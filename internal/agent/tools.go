package agent

import (
	"context"
	"fmt"

	"github.com/nidhogg/nuka-world/internal/provider"
)

// ToolHandler executes a tool call and returns the result as a string.
type ToolHandler func(ctx context.Context, args string) (string, error)

// ToolRegistry holds available tools and their handlers.
type ToolRegistry struct {
	defs     []provider.Tool
	handlers map[string]ToolHandler
}

// NewToolRegistry creates an empty registry.
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		handlers: make(map[string]ToolHandler),
	}
}

// Register adds a tool definition and its handler.
func (r *ToolRegistry) Register(def provider.Tool, handler ToolHandler) {
	r.defs = append(r.defs, def)
	r.handlers[def.Function.Name] = handler
}

// Definitions returns all tool definitions for the LLM request.
func (r *ToolRegistry) Definitions() []provider.Tool {
	return r.defs
}

// Execute runs a tool by name with the given JSON arguments.
func (r *ToolRegistry) Execute(ctx context.Context, name, args string) (string, error) {
	h, ok := r.handlers[name]
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", name)
	}
	return h(ctx, args)
}
