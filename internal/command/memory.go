package command

import (
	"context"
	"fmt"
	"strings"
)

// MemoryWriter writes/deletes agent memories.
type MemoryWriter interface {
	Remember(ctx context.Context, agentID, content string) error
	Forget(ctx context.Context, agentID, keyword string) error
}

// MemoryReader queries agent memories.
type MemoryReader interface {
	Recall(ctx context.Context, agentID, query string) (string, error)
}

// RegisterMemoryCommands registers /remember, /forget, /recall.
func RegisterMemoryCommands(reg *Registry, w MemoryWriter, r MemoryReader) {
	reg.Register(rememberCommand(w))
	reg.Register(forgetCommand(w))
	reg.Register(recallCommand(r))
}

func rememberCommand(w MemoryWriter) *Command {
	return &Command{
		Name:        "remember",
		Description: "Store a memory for an agent",
		Usage:       "/remember <agent_id> <content>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /remember <agent_id> <content>"}, nil
			}
			if err := w.Remember(ctx, parts[0], parts[1]); err != nil {
				return &CommandResult{Content: fmt.Sprintf("Failed: %v", err)}, nil
			}
			return &CommandResult{Content: fmt.Sprintf("Memory stored for agent %q.", parts[0])}, nil
		},
	}
}

func forgetCommand(w MemoryWriter) *Command {
	return &Command{
		Name:        "forget",
		Description: "Delete memories matching a keyword for an agent",
		Usage:       "/forget <agent_id> <keyword>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /forget <agent_id> <keyword>"}, nil
			}
			if err := w.Forget(ctx, parts[0], parts[1]); err != nil {
				return &CommandResult{Content: fmt.Sprintf("Failed: %v", err)}, nil
			}
			return &CommandResult{Content: fmt.Sprintf("Memories matching %q removed for agent %q.", parts[1], parts[0])}, nil
		},
	}
}

func recallCommand(r MemoryReader) *Command {
	return &Command{
		Name:        "recall",
		Description: "Query an agent's memories",
		Usage:       "/recall <agent_id> <query>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /recall <agent_id> <query>"}, nil
			}
			result, err := r.Recall(ctx, parts[0], parts[1])
			if err != nil {
				return &CommandResult{Content: fmt.Sprintf("Failed: %v", err)}, nil
			}
			if result == "" {
				return &CommandResult{Content: "No memories found."}, nil
			}
			return &CommandResult{Content: result}, nil
		},
	}
}
