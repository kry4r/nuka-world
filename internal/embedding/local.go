package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

// LocalProvider implements Provider using an Ollama-compatible embeddings API.
type LocalProvider struct {
	endpoint  string
	model     string
	dimension int

	once    sync.Once
	dimOnce int
}

// NewLocalProvider creates a new LocalProvider from the given Config.
func NewLocalProvider(cfg Config) *LocalProvider {
	return &LocalProvider{
		endpoint:  cfg.Endpoint,
		model:     cfg.Model,
		dimension: cfg.Dimension,
	}
}

type localRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type localResponse struct {
	Embedding []float32 `json:"embedding"`
}

// Embed sends each text to the Ollama-compatible endpoint and returns embeddings.
func (p *LocalProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	embeddings := make([][]float32, 0, len(texts))

	for _, text := range texts {
		vec, err := p.embedSingle(ctx, text)
		if err != nil {
			return nil, err
		}
		embeddings = append(embeddings, vec)
	}

	// Cache dimension from first successful result.
	if len(embeddings) > 0 && len(embeddings[0]) > 0 {
		p.once.Do(func() {
			p.dimOnce = len(embeddings[0])
		})
	}

	return embeddings, nil
}

func (p *LocalProvider) embedSingle(ctx context.Context, text string) ([]float32, error) {
	body, err := json.Marshal(localRequest{
		Model:  p.model,
		Prompt: text,
	})
	if err != nil {
		return nil, fmt.Errorf("embedding: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint+"/api/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("embedding: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result localResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("embedding: decode response: %w", err)
	}

	return result.Embedding, nil
}

// Dimension returns the embedding vector dimension.
// It returns the cached dimension from the first result, or the configured default.
func (p *LocalProvider) Dimension() int {
	if p.dimOnce > 0 {
		return p.dimOnce
	}
	return p.dimension
}
