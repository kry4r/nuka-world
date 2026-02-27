package command

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Command represents a slash command.
type Command struct {
	Name        string
	Description string
	Usage       string
	Handler     CommandHandler
}

// CommandHandler is the function signature for command execution.
type CommandHandler func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error)

// CommandContext provides dependencies to command handlers.
type CommandContext struct {
	Platform  string
	ChannelID string
	UserID    string
	UserName  string
	Engine    interface{} // *agent.Engine — avoid circular import
	Store     interface{} // *store.Store
}

// CommandResult holds the output of a command.
type CommandResult struct {
	Content string      `json:"content"`
	Data    interface{} `json:"data,omitempty"`
}

// Registry holds all registered commands.
type Registry struct {
	commands map[string]*Command
	mu       sync.RWMutex
}

// NewRegistry creates an empty command registry.
func NewRegistry() *Registry {
	return &Registry{commands: make(map[string]*Command)}
}

// Register adds a command to the registry.
func (r *Registry) Register(cmd *Command) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.commands[cmd.Name] = cmd
}

// Dispatch parses a slash command string and executes the matching handler.
func (r *Registry) Dispatch(ctx context.Context, input string, cc *CommandContext) (*CommandResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Parse: "/command_name args..."
	input = strings.TrimPrefix(input, "/")
	parts := strings.SplitN(input, " ", 2)
	name := parts[0]
	args := ""
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}

	cmd, ok := r.commands[name]
	if !ok {
		return &CommandResult{
			Content: fmt.Sprintf("Unknown command: /%s. Type /help for available commands.", name),
		}, nil
	}

	return cmd.Handler(ctx, args, cc)
}

// List returns all registered commands sorted by name.
func (r *Registry) List() []*Command {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*Command, 0, len(r.commands))
	for _, cmd := range r.commands {
		result = append(result, cmd)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}
