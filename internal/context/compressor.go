package context

import (
	"context"
	"fmt"
	"strings"

	"github.com/nidhogg/nuka-world/internal/provider"
	"go.uber.org/zap"
)

// Manager controls context window sizing and compression.
type Manager struct {
	config Config
	router *provider.Router
	logger *zap.Logger
}

// NewManager creates a context manager.
func NewManager(cfg Config, router *provider.Router, logger *zap.Logger) *Manager {
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = DefaultConfig().MaxTokens
	}
	if cfg.ReserveRatio <= 0 || cfg.ReserveRatio >= 1 {
		cfg.ReserveRatio = DefaultConfig().ReserveRatio
	}
	return &Manager{
		config: cfg,
		router: router,
		logger: logger,
	}
}

// Budget returns the available token budget for content.
func (m *Manager) Budget() int {
	return int(float64(m.config.MaxTokens) * (1 - m.config.ReserveRatio))
}

// Fit compresses a ContextWindow to fit within the token budget.
// Compresses lowest-priority blocks first.
func (m *Manager) Fit(ctx context.Context, w *ContextWindow) ([]provider.Message, error) {
	blocks := m.collectBlocks(w)
	total := m.totalTokens(blocks)
	budget := m.Budget()

	if total <= budget {
		return m.flatten(blocks), nil
	}

	m.logger.Info("context exceeds budget, compressing",
		zap.Int("total", total),
		zap.Int("budget", budget))

	// Compress from lowest priority upward
	for _, b := range blocks {
		if b.Fixed || total <= budget {
			continue
		}
		overflow := total - budget
		reduced := m.compressBlock(ctx, b, overflow)
		total -= reduced
	}

	return m.flatten(blocks), nil
}

// collectBlocks gathers all non-nil blocks sorted by priority (lowest first).
func (m *Manager) collectBlocks(w *ContextWindow) []*Block {
	all := []*Block{
		w.HistoryBlock,
		w.ToolResults,
		w.MemoryBlock,
		w.TaskBlock,
		w.PersonaBlock,
		w.SystemPrompt,
	}
	var result []*Block
	for _, b := range all {
		if b != nil && len(b.Messages) > 0 {
			result = append(result, b)
		}
	}
	return result
}

// totalTokens sums token counts across all blocks.
func (m *Manager) totalTokens(blocks []*Block) int {
	total := 0
	for _, b := range blocks {
		total += b.Tokens
	}
	return total
}

// flatten merges all blocks into a single message slice, ordered by priority (highest first).
func (m *Manager) flatten(blocks []*Block) []provider.Message {
	var msgs []provider.Message
	for i := len(blocks) - 1; i >= 0; i-- {
		msgs = append(msgs, blocks[i].Messages...)
	}
	return msgs
}

// compressBlock applies the appropriate compression strategy to a block.
// Returns the number of tokens freed.
func (m *Manager) compressBlock(ctx context.Context, b *Block, overflow int) int {
	before := b.Tokens

	switch b.Priority {
	case PriorityHistory:
		m.compressHistory(ctx, b, overflow)
	case PriorityToolResult:
		m.compressToolResults(b, overflow)
	case PriorityMemory:
		m.compressMemory(b, overflow)
	default:
		return 0
	}

	freed := before - b.Tokens
	m.logger.Debug("compressed block",
		zap.String("block", b.Name),
		zap.Int("freed", freed))
	return freed
}

// compressHistory summarizes old conversation turns using LLM.
// Falls back to simple truncation if LLM is unavailable.
func (m *Manager) compressHistory(ctx context.Context, b *Block, overflow int) {
	if len(b.Messages) <= 2 {
		return
	}

	cutpoint := len(b.Messages) / 2
	oldMsgs := b.Messages[:cutpoint]

	var content strings.Builder
	for _, msg := range oldMsgs {
		fmt.Fprintf(&content, "[%s]: %s\n", msg.Role, msg.Content)
	}

	summary, err := m.summarize(ctx, content.String())
	if err != nil {
		m.logger.Warn("history summarization failed, truncating", zap.Error(err))
		b.Messages = b.Messages[cutpoint:]
		b.Tokens = estimateTokens(b.Messages)
		return
	}

	summaryMsg := provider.Message{
		Role:    "system",
		Content: fmt.Sprintf("[对话历史摘要]\n%s", summary),
	}
	b.Messages = append([]provider.Message{summaryMsg}, b.Messages[cutpoint:]...)
	b.Tokens = estimateTokens(b.Messages)
}

// compressToolResults truncates tool outputs, keeping only key information.
func (m *Manager) compressToolResults(b *Block, overflow int) {
	const maxPerResult = 500

	for i, msg := range b.Messages {
		if len(msg.Content) > maxPerResult {
			b.Messages[i].Content = msg.Content[:maxPerResult] + "\n...[已截断]"
		}
	}
	b.Tokens = estimateTokens(b.Messages)
}

// compressMemory trims memory blocks from the tail (lowest relevance).
func (m *Manager) compressMemory(b *Block, overflow int) {
	tokensToFree := overflow
	for tokensToFree > 0 && len(b.Messages) > 1 {
		last := b.Messages[len(b.Messages)-1]
		freed := estimateTokensStr(last.Content)
		b.Messages = b.Messages[:len(b.Messages)-1]
		tokensToFree -= freed
	}
	b.Tokens = estimateTokens(b.Messages)
}

// summarize uses the LLM to compress text into a concise summary.
func (m *Manager) summarize(ctx context.Context, text string) (string, error) {
	if m.router == nil {
		return "", fmt.Errorf("no router available for summarization")
	}

	req := &provider.ChatRequest{
		Model: "default",
		Messages: []provider.Message{
			{Role: "user", Content: fmt.Sprintf(
				"请将以下对话历史压缩为简洁摘要，保留关键信息：\n\n%s", text)},
		},
		MaxTokens: 512,
	}

	resp, err := m.router.Route(ctx, "_compressor", req)
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

// estimateTokens estimates total tokens for a slice of messages.
func estimateTokens(msgs []provider.Message) int {
	total := 0
	for _, m := range msgs {
		total += estimateTokensStr(m.Content)
	}
	return total
}

// estimateTokensStr estimates tokens for a single string.
// Rough heuristic: ~4 chars per token for mixed CJK/English.
func estimateTokensStr(s string) int {
	n := len(s)
	if n == 0 {
		return 0
	}
	return (n + 3) / 4
}
