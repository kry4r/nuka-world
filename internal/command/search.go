package command

import (
	"context"
	"fmt"
	"strings"
)

// RAGSearcher abstracts RAG query capability.
type RAGSearcher interface {
	Query(ctx context.Context, agentID, query string, topK int) ([]RAGSearchResult, error)
}

// RAGSearchResult mirrors rag.RAGResult to avoid circular imports.
type RAGSearchResult struct {
	Content string
	Source  string
	Score   float32
}

// RegisterSearchCommand registers the /search command.
func RegisterSearchCommand(reg *Registry, searcher RAGSearcher) {
	reg.Register(&Command{
		Name:        "search",
		Description: "Search knowledge base via RAG",
		Usage:       "/search <query>",
		Handler: func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			if strings.TrimSpace(args) == "" {
				return &CommandResult{Content: "Usage: /search <query>"}, nil
			}
			results, err := searcher.Query(ctx, "", args, 5)
			if err != nil {
				return nil, fmt.Errorf("RAG search: %w", err)
			}
			if len(results) == 0 {
				return &CommandResult{Content: "No results found for: " + args}, nil
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Search results for \"%s\":\n\n", args))
			for i, r := range results {
				sb.WriteString(fmt.Sprintf("%d. [%.2f] %s\n   %s\n\n", i+1, r.Score, r.Source, r.Content))
			}
			return &CommandResult{Content: sb.String()}, nil
		},
	})
}
