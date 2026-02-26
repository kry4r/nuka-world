package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

// ToolInfo describes a tool exposed by an MCP server.
type ToolInfo struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// Client is an MCP SSE client that connects to an MCP server,
// discovers tools, and can call them via JSON-RPC over HTTP.
type Client struct {
	name    string
	sseURL  string
	rpcURL  string
	tools   []ToolInfo
	pending map[int]chan json.RawMessage
	nextID  atomic.Int64
	mu      sync.Mutex
	cancel  context.CancelFunc
	logger  *zap.Logger
}

// NewClient creates a new MCP client for the given SSE endpoint.
func NewClient(name, sseURL string, logger *zap.Logger) *Client {
	return &Client{
		name:    name,
		sseURL:  sseURL,
		pending: make(map[int]chan json.RawMessage),
		logger:  logger,
	}
}

// Name returns the server name.
func (c *Client) Name() string { return c.name }

// ListTools returns the tools discovered from the MCP server.
func (c *Client) ListTools() []ToolInfo { return c.tools }

// Connect establishes the SSE connection, discovers the JSON-RPC endpoint,
// and fetches the available tools list.
func (c *Client) Connect(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.sseURL, nil)
	if err != nil {
		return fmt.Errorf("mcp connect: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("mcp sse connect: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return fmt.Errorf("mcp sse status %d", resp.StatusCode)
	}

	// Read the first event to get the JSON-RPC endpoint
	rpcURL, err := c.readEndpointEvent(resp.Body)
	if err != nil {
		resp.Body.Close()
		return fmt.Errorf("mcp endpoint event: %w", err)
	}
	c.rpcURL = c.resolveURL(rpcURL)
	c.logger.Info("MCP endpoint discovered", zap.String("name", c.name), zap.String("rpc", c.rpcURL))

	// Start background SSE reader
	sseCtx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	go c.readSSE(sseCtx, resp.Body)

	// Fetch tools list
	if err := c.fetchTools(ctx); err != nil {
		return fmt.Errorf("mcp list tools: %w", err)
	}
	c.logger.Info("MCP tools discovered", zap.String("name", c.name), zap.Int("count", len(c.tools)))
	return nil
}

// readEndpointEvent reads SSE lines until it finds an "endpoint" event.
func (c *Client) readEndpointEvent(r io.Reader) (string, error) {
	scanner := bufio.NewScanner(r)
	var eventType string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if eventType == "endpoint" {
				return data, nil
			}
		}
	}
	return "", fmt.Errorf("SSE stream ended without endpoint event")
}

// resolveURL turns a relative path into an absolute URL based on sseURL.
func (c *Client) resolveURL(path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	// Extract base from sseURL
	idx := strings.LastIndex(c.sseURL, "/")
	if idx > 8 { // after "https://"
		return c.sseURL[:idx] + "/" + strings.TrimPrefix(path, "/")
	}
	return c.sseURL + "/" + strings.TrimPrefix(path, "/")
}

// readSSE continuously reads SSE events and dispatches JSON-RPC responses
// to waiting callers via the pending map.
func (c *Client) readSSE(ctx context.Context, r io.ReadCloser) {
	defer r.Close()
	scanner := bufio.NewScanner(r)
	var eventType string
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if eventType == "message" {
				c.dispatchResponse([]byte(data))
			}
			eventType = ""
		}
	}
}

// dispatchResponse parses a JSON-RPC response and sends it to the waiting caller.
func (c *Client) dispatchResponse(data []byte) {
	var envelope struct {
		ID     int             `json:"id"`
		Result json.RawMessage `json:"result"`
		Error  json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		c.logger.Debug("mcp: ignoring non-jsonrpc SSE data")
		return
	}

	c.mu.Lock()
	ch, ok := c.pending[envelope.ID]
	if ok {
		delete(c.pending, envelope.ID)
	}
	c.mu.Unlock()

	if ok {
		if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
			ch <- envelope.Error
		} else {
			ch <- envelope.Result
		}
	}
}

// sendRPC sends a JSON-RPC request and waits for the response via SSE.
func (c *Client) sendRPC(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	id := int(c.nextID.Add(1))

	ch := make(chan json.RawMessage, 1)
	c.mu.Lock()
	c.pending[id] = ch
	c.mu.Unlock()

	rpcReq := struct {
		JSONRPC string      `json:"jsonrpc"`
		ID      int         `json:"id"`
		Method  string      `json:"method"`
		Params  interface{} `json:"params,omitempty"`
	}{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(rpcReq)
	if err != nil {
		return nil, fmt.Errorf("marshal rpc: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create rpc request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send rpc: %w", err)
	}
	resp.Body.Close()

	// Wait for response via SSE channel
	select {
	case result := <-ch:
		return result, nil
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, ctx.Err()
	case <-time.After(30 * time.Second):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("mcp rpc timeout for %s", method)
	}
}

// fetchTools calls tools/list on the MCP server and populates c.tools.
func (c *Client) fetchTools(ctx context.Context) error {
	result, err := c.sendRPC(ctx, "tools/list", nil)
	if err != nil {
		return err
	}
	var resp struct {
		Tools []ToolInfo `json:"tools"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return fmt.Errorf("parse tools/list: %w", err)
	}
	c.tools = resp.Tools
	return nil
}

// CallTool invokes a tool on the MCP server and returns the text result.
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	params := map[string]interface{}{
		"name":      name,
		"arguments": args,
	}
	result, err := c.sendRPC(ctx, "tools/call", params)
	if err != nil {
		return "", fmt.Errorf("mcp call %s: %w", name, err)
	}

	var resp struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(result, &resp); err != nil {
		return string(result), nil
	}
	if len(resp.Content) > 0 {
		return resp.Content[0].Text, nil
	}
	return string(result), nil
}

// Close shuts down the SSE connection and cleans up pending requests.
func (c *Client) Close() error {
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Lock()
	for id, ch := range c.pending {
		close(ch)
		delete(c.pending, id)
	}
	c.mu.Unlock()
	return nil
}
