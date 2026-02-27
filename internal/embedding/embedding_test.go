package embedding

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIProviderEmbed(t *testing.T) {
	// Mock OpenAI-compatible embedding server.
	// APIProvider posts to endpoint+"/embeddings", so we use a mux.
	mux := http.NewServeMux()
	mux.HandleFunc("/embeddings", func(w http.ResponseWriter, r *http.Request) {
		resp := apiResponse{
			Data: []apiEmbeddingData{
				{Embedding: []float32{0.1, 0.2, 0.3}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	p := NewAPIProvider(Config{
		Endpoint: srv.URL,
		Model:    "test-model",
	})

	vectors, err := p.Embed(context.Background(), []string{"hello"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vectors) != 1 {
		t.Fatalf("got %d vectors, want 1", len(vectors))
	}
	if len(vectors[0]) != 3 {
		t.Fatalf("got dimension %d, want 3", len(vectors[0]))
	}
	if p.Dimension() != 3 {
		t.Errorf("got dimension %d, want 3", p.Dimension())
	}
}

func TestAPIProviderEmbed_Empty(t *testing.T) {
	p := NewAPIProvider(Config{
		Endpoint:  "http://unused",
		Model:     "test-model",
		Dimension: 128,
	})

	vectors, err := p.Embed(context.Background(), []string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if vectors != nil {
		t.Errorf("expected nil for empty input, got %v", vectors)
	}
}

func TestAPIProviderDimension_Fallback(t *testing.T) {
	p := NewAPIProvider(Config{
		Endpoint:  "http://unused",
		Model:     "test-model",
		Dimension: 256,
	})

	// Before any Embed call, Dimension should return the configured default.
	if d := p.Dimension(); d != 256 {
		t.Errorf("got dimension %d, want configured default 256", d)
	}
}
