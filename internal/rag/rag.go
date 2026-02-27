package rag

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/nidhogg/nuka-world/internal/embedding"
	"github.com/nidhogg/nuka-world/internal/vectorstore"
	"go.uber.org/zap"
)

const (
	CollConversations = "conversations"
	CollDocuments     = "documents"
	CollWorldEvents   = "world_events"
)

// Orchestrator coordinates embedding generation and vector search across
// multiple Qdrant collections to provide retrieval-augmented generation.
type Orchestrator struct {
	embedder embedding.Provider
	qdrant   *vectorstore.Client
	logger   *zap.Logger
}

// NewOrchestrator creates a new RAG orchestrator.
func NewOrchestrator(embedder embedding.Provider, qdrant *vectorstore.Client, logger *zap.Logger) *Orchestrator {
	return &Orchestrator{embedder: embedder, qdrant: qdrant, logger: logger}
}

// InitCollections ensures all required Qdrant collections exist.
func (o *Orchestrator) InitCollections(ctx context.Context) error {
	dim := uint64(o.embedder.Dimension())
	if dim == 0 {
		dim = 1024
	}
	for _, name := range []string{CollConversations, CollDocuments, CollWorldEvents} {
		if err := o.qdrant.EnsureCollection(ctx, name, dim); err != nil {
			return fmt.Errorf("init collection %s: %w", name, err)
		}
	}
	return nil
}

// RAGResult holds a single retrieval result with its source and relevance score.
type RAGResult struct {
	Content string
	Source  string
	Score   float32
}

// Query embeds the query string and searches all collections, returning the
// top-K most relevant results sorted by descending score.
func (o *Orchestrator) Query(ctx context.Context, agentID, query string, topK int) ([]RAGResult, error) {
	vectors, err := o.embedder.Embed(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	if len(vectors) == 0 {
		return nil, nil
	}
	qvec := vectors[0]

	var allResults []RAGResult
	for _, coll := range []string{CollConversations, CollDocuments, CollWorldEvents} {
		hits, err := o.qdrant.Search(ctx, coll, qvec, uint64(topK))
		if err != nil {
			o.logger.Warn("rag search failed", zap.String("collection", coll), zap.Error(err))
			continue
		}
		for _, h := range hits {
			allResults = append(allResults, RAGResult{
				Content: h.Payload["content"],
				Source:  coll + ":" + h.ID,
				Score:   h.Score,
			})
		}
	}

	sort.Slice(allResults, func(i, j int) bool {
		return allResults[i].Score > allResults[j].Score
	})
	if len(allResults) > topK {
		allResults = allResults[:topK]
	}
	return allResults, nil
}

// Store embeds the content and upserts it into the specified collection.
func (o *Orchestrator) Store(ctx context.Context, collection, content string, metadata map[string]string) error {
	vectors, err := o.embedder.Embed(ctx, []string{content})
	if err != nil {
		return fmt.Errorf("embed content: %w", err)
	}
	if len(vectors) == 0 {
		return fmt.Errorf("empty embedding result")
	}

	id := uuid.New().String()
	payload := make(map[string]string)
	for k, v := range metadata {
		payload[k] = v
	}
	payload["content"] = content
	payload["indexed_at"] = time.Now().UTC().Format(time.RFC3339)

	return o.qdrant.Upsert(ctx, collection, id, vectors[0], payload)
}

// FormatContext renders RAG results into a prompt-friendly string.
func FormatContext(results []RAGResult) string {
	if len(results) == 0 {
		return ""
	}
	var b []byte
	b = append(b, "## Retrieved Context (RAG)\n\n"...)
	for i, r := range results {
		b = append(b, fmt.Sprintf("%d. [%s] (score: %.2f)\n%s\n\n", i+1, r.Source, r.Score, r.Content)...)
	}
	return string(b)
}

