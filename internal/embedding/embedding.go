package embedding

import "context"

// Provider generates vector embeddings from text.
type Provider interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	Dimension() int
}

// Config holds embedding provider configuration.
type Config struct {
	Provider  string `json:"provider"`  // "api" or "local"
	Endpoint  string `json:"endpoint"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key"`
	Dimension int    `json:"dimension"`
}
