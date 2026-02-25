package memory

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
)

// ContextBlock is a chunk of memory-derived context for LLM injection.
type ContextBlock struct {
	Source     string  `json:"source"`      // schema name or memory id
	Content    string  `json:"content"`
	Relevance  float64 `json:"relevance"`
	TokenEstimate int  `json:"token_estimate"`
}

// ContextBudget controls how much memory context to inject.
type ContextBudget struct {
	MaxTokens   int // total token budget for memory context
	MaxBlocks   int // max number of context blocks
}

// DefaultContextBudget returns sensible defaults.
func DefaultContextBudget() ContextBudget {
	return ContextBudget{
		MaxTokens: 2000,
		MaxBlocks: 10,
	}
}

// BuildContext assembles memory context for LLM injection.
// Runs spreading activation, then packs results into blocks within budget.
func (s *Store) BuildContext(ctx context.Context, agentID string, triggers []string, budget ContextBudget) ([]ContextBlock, error) {
	if budget.MaxTokens == 0 {
		budget = DefaultContextBudget()
	}

	// Activate relevant memories
	activated, err := s.Activate(ctx, agentID, triggers, DefaultActivationOpts())
	if err != nil {
		return nil, fmt.Errorf("activation failed: %w", err)
	}

	var blocks []ContextBlock
	usedTokens := 0

	for _, node := range activated.Nodes {
		if len(blocks) >= budget.MaxBlocks {
			break
		}

		est := estimateTokens(node.Content)
		if usedTokens+est > budget.MaxTokens {
			continue
		}

		blocks = append(blocks, ContextBlock{
			Source:        node.Name,
			Content:       node.Content,
			Relevance:     node.Activation,
			TokenEstimate: est,
		})
		usedTokens += est
	}

	s.logger.Debug("built memory context",
		zap.String("agent", agentID),
		zap.Int("blocks", len(blocks)),
		zap.Int("tokens", usedTokens))

	return blocks, nil
}

// FormatContextPrompt renders memory blocks as a system prompt section.
func FormatContextPrompt(blocks []ContextBlock) string {
	if len(blocks) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("[Memory Context]\n")
	for _, block := range blocks {
		fmt.Fprintf(&b, "- %s (relevance: %.2f): %s\n", block.Source, block.Relevance, block.Content)
	}
	return b.String()
}

// estimateTokens gives a rough token count (~4 chars per token).
func estimateTokens(s string) int {
	n := len(s) / 4
	if n < 1 {
		return 1
	}
	return n
}
