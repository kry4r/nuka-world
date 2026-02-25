package agent

import (
	"time"
)

// StepType identifies the kind of thinking step.
type StepType string

const (
	StepMemoryRecall StepType = "memory_recall"
	StepSchemaMatch  StepType = "schema_match"
	StepSchemaUpdate StepType = "schema_update"
	StepReasoning    StepType = "reasoning"
	StepToolCall     StepType = "tool_call"
	StepToolResult   StepType = "tool_result"
	StepResponse     StepType = "response"
)

// ThinkingChain records the full cognitive trace of an agent execution.
type ThinkingChain struct {
	ID        string        `json:"id"`
	AgentID   string        `json:"agent_id"`
	SessionID string        `json:"session_id"`
	Steps     []ThinkStep   `json:"steps"`
	StartedAt time.Time     `json:"started_at"`
	Duration  time.Duration `json:"duration"`
}

// ThinkStep is a single step in the thinking chain.
type ThinkStep struct {
	Type       StepType    `json:"type"`
	Content    string      `json:"content"`
	Detail     interface{} `json:"detail,omitempty"`
	Timestamp  time.Time   `json:"timestamp"`
	TokensUsed int         `json:"tokens_used"`
}
