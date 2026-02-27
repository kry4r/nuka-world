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

// APIProvider implements Provider using an OpenAI-compatible embeddings API.
type APIProvider struct {
	endpoint  string
	model     string
	apiKey    string
	dimension int

	once    sync.Once
	dimOnce int
}

// NewAPIProvider creates a new APIProvider from the given Config.
func NewAPIProvider(cfg Config) *APIProvider {
	return &APIProvider{
		endpoint:  cfg.Endpoint,
		model:     cfg.Model,
		apiKey:    cfg.APIKey,
		dimension: cfg.Dimension,
	}
}

type apiRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type apiEmbeddingData struct {
	Embedding []float32 `json:"embedding"`
}

type apiResponse struct {
	Data []apiEmbeddingData `json:"data"`
}

// Embed sends texts to the OpenAI-compatible endpoint and returns embeddings.
func (p *APIProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	body, err := json.Marshal(apiRequest{
		Model: p.model,
		Input: texts,
	})
	if err != nil {
		return nil, fmt.Errorf("embedding: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("embedding: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("embedding: decode response: %w", err)
	}

	embeddings := make([][]float32, len(result.Data))
	for i, d := range result.Data {
		embeddings[i] = d.Embedding
	}

	// Cache dimension from first successful result.
	if len(embeddings) > 0 && len(embeddings[0]) > 0 {
		p.once.Do(func() {
			p.dimOnce = len(embeddings[0])
		})
	}

	return embeddings, nil
}

// Dimension returns the embedding vector dimension.
// It returns the cached dimension from the first result, or the configured default.
func (p *APIProvider) Dimension() int {
	if p.dimOnce > 0 {
		return p.dimOnce
	}
	return p.dimension
}
