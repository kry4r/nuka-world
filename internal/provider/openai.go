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

// OpenAIProvider implements the Provider interface for OpenAI-compatible APIs.
type OpenAIProvider struct {
	config ProviderConfig
	client *http.Client
	logger *zap.Logger
}

// NewOpenAIProvider creates a new OpenAI-compatible provider.
func NewOpenAIProvider(cfg ProviderConfig, logger *zap.Logger) *OpenAIProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 120 * time.Second
	}
	if cfg.Endpoint == "" {
		cfg.Endpoint = "https://api.openai.com/v1"
	}
	return &OpenAIProvider{
		config: cfg,
		client: &http.Client{Timeout: timeout},
		logger: logger,
	}
}

func (p *OpenAIProvider) ID() string   { return p.config.ID }
func (p *OpenAIProvider) Name() string { return p.config.Name }

// chatURL builds the chat completions URL. If Extra["path_model"] is "true",
// the model name is inserted into the URL path (e.g. for 讯飞星辰MaaS).
func (p *OpenAIProvider) chatURL(model string) string {
	if p.config.Extra["path_model"] == "true" && model != "" {
		return p.config.Endpoint + "/" + model + "/chat/completions"
	}
	return p.config.Endpoint + "/chat/completions"
}

// Chat sends a non-streaming chat request.
func (p *OpenAIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.chatURL(req.Model), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var oaiResp openAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&oaiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(oaiResp.Choices) == 0 {
		return nil, fmt.Errorf("empty response from provider")
	}

	choice := oaiResp.Choices[0]
	return &ChatResponse{
		ID:           oaiResp.ID,
		Model:        oaiResp.Model,
		Content:      choice.Message.Content,
		ToolCalls:    choice.Message.ToolCalls,
		FinishReason: choice.FinishReason,
		Usage: Usage{
			PromptTokens:     oaiResp.Usage.PromptTokens,
			CompletionTokens: oaiResp.Usage.CompletionTokens,
			TotalTokens:      oaiResp.Usage.TotalTokens,
		},
	}, nil
}

// openAI-specific response types
type openAIChatResponse struct {
	ID      string         `json:"id"`
	Model   string         `json:"model"`
	Choices []openAIChoice `json:"choices"`
	Usage   Usage          `json:"usage"`
}

type openAIChoice struct {
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

// ChatStream sends a streaming chat request.
func (p *OpenAIProvider) ChatStream(ctx context.Context, req *ChatRequest) (<-chan *StreamChunk, error) {
	streamReq := map[string]interface{}{
		"model":    req.Model,
		"messages": req.Messages,
		"stream":   true,
	}
	if req.Temperature > 0 {
		streamReq["temperature"] = req.Temperature
	}
	if req.MaxTokens > 0 {
		streamReq["max_tokens"] = req.MaxTokens
	}
	if len(req.Tools) > 0 {
		streamReq["tools"] = req.Tools
	}
	if req.ToolChoice != "" {
		streamReq["tool_choice"] = req.ToolChoice
	}

	body, err := json.Marshal(streamReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.chatURL(req.Model), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

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
	go p.readSSEStream(resp.Body, ch)
	return ch, nil
}

func (p *OpenAIProvider) readSSEStream(body io.ReadCloser, ch chan<- *StreamChunk) {
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
					if data == "[DONE]" {
						ch <- &StreamChunk{Done: true}
						return
					}
					var chunk struct {
						Choices []struct {
							Delta struct {
								Content string `json:"content"`
							} `json:"delta"`
							FinishReason string `json:"finish_reason"`
						} `json:"choices"`
					}
					if json.Unmarshal([]byte(data), &chunk) == nil && len(chunk.Choices) > 0 {
						ch <- &StreamChunk{
							Content:      chunk.Choices[0].Delta.Content,
							FinishReason: chunk.Choices[0].FinishReason,
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

// ListModels returns available models from the provider.
func (p *OpenAIProvider) ListModels(ctx context.Context) ([]Model, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		p.config.Endpoint+"/models", nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	models := make([]Model, len(result.Data))
	for i, m := range result.Data {
		models[i] = Model{ID: m.ID, Name: m.ID, Provider: p.config.ID}
	}
	return models, nil
}

// HealthCheck verifies the provider is reachable.
func (p *OpenAIProvider) HealthCheck(ctx context.Context) error {
	_, err := p.ListModels(ctx)
	return err
}
