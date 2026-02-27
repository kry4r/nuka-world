package rag

import (
	"context"

	"github.com/nidhogg/nuka-world/internal/agent"
)

// ProviderAdapter wraps an Orchestrator to satisfy the agent.RAGProvider interface.
type ProviderAdapter struct {
	inner *Orchestrator
}

// NewProviderAdapter returns an adapter that bridges the Orchestrator
// to the agent engine's RAGProvider interface.
func NewProviderAdapter(o *Orchestrator) *ProviderAdapter {
	return &ProviderAdapter{inner: o}
}

// Query delegates to the Orchestrator and converts RAGResult to agent.RAGQueryResult.
func (a *ProviderAdapter) Query(ctx context.Context, agentID, query string, topK int) ([]agent.RAGQueryResult, error) {
	results, err := a.inner.Query(ctx, agentID, query, topK)
	if err != nil {
		return nil, err
	}
	out := make([]agent.RAGQueryResult, len(results))
	for i, r := range results {
		out[i] = agent.RAGQueryResult{
			Content: r.Content,
			Source:  r.Source,
			Score:   r.Score,
		}
	}
	return out, nil
}

// Store delegates directly to the Orchestrator.
func (a *ProviderAdapter) Store(ctx context.Context, collection, content string, metadata map[string]string) error {
	return a.inner.Store(ctx, collection, content, metadata)
}
