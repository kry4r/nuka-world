package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// AnthropicProvider implements the Provider interface for Claude API.
type AnthropicProvider struct {
	config ProviderConfig
	client *http.Client
	logger *zap.Logger
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(cfg ProviderConfig, logger *zap.Logger) *AnthropicProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 120 * time.Second
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = "https://api.anthropic.com/v1"
	}
	return &AnthropicProvider{
		config: cfg,
		client: &http.Client{Timeout: timeout},
		logger: logger,
	}
}

func (p *AnthropicProvider) ID() string   { return p.config.ID }
func (p *AnthropicProvider) Name() string { return p.config.Name }

// Chat sends a non-streaming chat request to Claude.
func (p *AnthropicProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	anthropicReq := p.convertRequest(req)

	body, err := json.Marshal(anthropicReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.config.Endpoint+"/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.config.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var claudeResp anthropicResponse
	if err := json.NewDecoder(resp.Body).Decode(&claudeResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return p.convertResponse(&claudeResp), nil
}

// Anthropic-specific request/response types
type anthropicRequest struct {
	Model     string            `json:"model"`
	Messages  []anthropicMsg    `json:"messages"`
	System    string            `json:"system,omitempty"`
	MaxTokens int               `json:"max_tokens"`
}

type anthropicMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (p *AnthropicProvider) convertRequest(req *ChatRequest) *anthropicRequest {
	ar := &anthropicRequest{
		Model:     req.Model,
		MaxTokens: req.MaxTokens,
	}
	if ar.MaxTokens == 0 {
		ar.MaxTokens = 4096
	}
	for _, m := range req.Messages {
		if m.Role == "system" {
			ar.System = m.Content
			continue
		}
		ar.Messages = append(ar.Messages, anthropicMsg{
			Role:    m.Role,
			Content: m.Content,
		})
	}
	return ar
}

func (p *AnthropicProvider) convertResponse(resp *anthropicResponse) *ChatResponse {
	content := ""
	for _, c := range resp.Content {
		if c.Type == "text" {
			content += c.Text
		}
	}
	return &ChatResponse{
		ID:           resp.ID,
		Model:        resp.Model,
		Content:      content,
		FinishReason: resp.StopReason,
		Usage: Usage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		},
	}
}

// ChatStream sends a streaming request to Claude.
func (p *AnthropicProvider) ChatStream(ctx context.Context, req *ChatRequest) (<-chan *StreamChunk, error) {
	ar := p.convertRequest(req)
	streamReq := map[string]interface{}{
		"model":      ar.Model,
		"messages":   ar.Messages,
		"max_tokens": ar.MaxTokens,
		"stream":     true,
	}
	if ar.System != "" {
		streamReq["system"] = ar.System
	}

	body, err := json.Marshal(streamReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.config.Endpoint+"/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.config.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	ch := make(chan *StreamChunk, 64)
	go p.readStream(resp.Body, ch)
	return ch, nil
}

func (p *AnthropicProvider) readStream(body io.ReadCloser, ch chan<- *StreamChunk) {
	defer close(ch)
	defer body.Close()

	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 1024)
	for {
		n, err := body.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			for {
				idx := bytes.Index(buf, []byte("\n\n"))
				if idx < 0 {
					break
				}
				line := string(buf[:idx])
				buf = buf[idx+2:]
				if len(line) > 6 && line[:6] == "data: " {
					data := line[6:]
					var event struct {
						Type  string `json:"type"`
						Delta struct {
							Type string `json:"type"`
							Text string `json:"text"`
						} `json:"delta"`
					}
					if json.Unmarshal([]byte(data), &event) == nil {
						switch event.Type {
						case "content_block_delta":
							ch <- &StreamChunk{Content: event.Delta.Text}
						case "message_stop":
							ch <- &StreamChunk{Done: true}
							return
						}
					}
				}
			}
		}
		if err != nil {
			return
		}
	}
}

// ListModels returns available Claude models.
func (p *AnthropicProvider) ListModels(_ context.Context) ([]Model, error) {
	return []Model{
		{ID: "claude-sonnet-4-20250514", Name: "Claude Sonnet 4", Provider: p.config.ID, MaxTokens: 200000},
		{ID: "claude-opus-4-20250514", Name: "Claude Opus 4", Provider: p.config.ID, MaxTokens: 200000},
		{ID: "claude-3-5-haiku-20241022", Name: "Claude 3.5 Haiku", Provider: p.config.ID, MaxTokens: 200000},
	}, nil
}

// HealthCheck verifies the provider is reachable.
func (p *AnthropicProvider) HealthCheck(ctx context.Context) error {
	req := &ChatRequest{
		Model:     "claude-3-5-haiku-20241022",
		Messages:  []Message{{Role: "user", Content: "ping"}},
		MaxTokens: 1,
	}
	_, err := p.Chat(ctx, req)
	return err
}
