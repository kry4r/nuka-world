package context

import "github.com/nidhogg/nuka-world/internal/provider"

// BlockPriority defines compression priority (higher = compressed last).
type BlockPriority int

const (
	PriorityHistory    BlockPriority = 1 // compressed first
	PriorityToolResult BlockPriority = 2
	PriorityMemory     BlockPriority = 3
	PriorityTask       BlockPriority = 4 // never compressed
	PriorityPersona    BlockPriority = 5 // never compressed
	PrioritySystem     BlockPriority = 6 // never compressed
)

// Block is a labeled group of messages with a compression priority.
type Block struct {
	Name     string            `json:"name"`
	Priority BlockPriority     `json:"priority"`
	Messages []provider.Message `json:"messages"`
	Tokens   int               `json:"tokens"`
	Fixed    bool              `json:"fixed"` // if true, never compress
}

// ContextWindow holds all message blocks for an LLM call.
type ContextWindow struct {
	SystemPrompt *Block `json:"system_prompt"`
	PersonaBlock *Block `json:"persona_block"`
	MemoryBlock  *Block `json:"memory_block"`
	HistoryBlock *Block `json:"history_block"`
	TaskBlock    *Block `json:"task_block"`
	ToolResults  *Block `json:"tool_results"`
}

// Config holds context manager settings.
type Config struct {
	MaxTokens    int     // model's max context window
	ReserveRatio float64 // fraction reserved for response (default 0.3)
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() Config {
	return Config{
		MaxTokens:    128000,
		ReserveRatio: 0.3,
	}
}
