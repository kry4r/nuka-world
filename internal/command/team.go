package command

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

// TeamRegistry manages agent teams.
type TeamRegistry struct {
	teams map[string][]string
	mu    sync.RWMutex
}

// NewTeamRegistry creates an empty team registry.
func NewTeamRegistry() *TeamRegistry {
	return &TeamRegistry{teams: make(map[string][]string)}
}

// Add creates a team with the given members.
func (tr *TeamRegistry) Add(name string, members []string) {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	tr.teams[name] = members
}

// Get returns team members.
func (tr *TeamRegistry) Get(name string) ([]string, bool) {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	m, ok := tr.teams[name]
	return m, ok
}

// Has checks if an agent is in a team.
func (tr *TeamRegistry) Has(team, agentID string) bool {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	for _, id := range tr.teams[team] {
		if id == agentID {
			return true
		}
	}
	return false
}

// AgentExecutor executes a message on an agent and returns the response.
type AgentExecutor interface {
	ExecuteAgent(ctx context.Context, agentID, message string) (string, error)
}

// RegisterTeamCommands registers /assign_task, /broadcast, /team_msg.
func RegisterTeamCommands(reg *Registry, tr *TeamRegistry, exec AgentExecutor) {
	reg.Register(assignTaskCommand(exec))
	reg.Register(broadcastCommand(exec))
	reg.Register(teamMsgCommand(tr, exec))
}

func assignTaskCommand(exec AgentExecutor) *Command {
	return &Command{
		Name:        "assign_task",
		Description: "Assign a task to an agent",
		Usage:       "/assign_task <agent_id> <task description>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /assign_task <agent_id> <task>"}, nil
			}
			resp, err := exec.ExecuteAgent(ctx, parts[0], parts[1])
			if err != nil {
				return &CommandResult{Content: fmt.Sprintf("Failed: %v", err)}, nil
			}
			return &CommandResult{Content: fmt.Sprintf("[%s] %s", parts[0], resp)}, nil
		},
	}
}

func broadcastCommand(exec AgentExecutor) *Command {
	return &Command{
		Name:        "broadcast",
		Description: "Broadcast a message to all agents",
		Usage:       "/broadcast <message>",
		Handler: func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			msg := strings.TrimSpace(args)
			if msg == "" {
				return &CommandResult{Content: "Usage: /broadcast <message>"}, nil
			}
			// Use engine's agent lister via CommandContext
			eng, ok := cc.Engine.(interface{ ListAgentIDs() []string })
			if !ok {
				return &CommandResult{Content: "Broadcast not supported."}, nil
			}
			var b strings.Builder
			for _, id := range eng.ListAgentIDs() {
				resp, err := exec.ExecuteAgent(ctx, id, msg)
				if err != nil {
					fmt.Fprintf(&b, "[%s] error: %v\n", id, err)
					continue
				}
				fmt.Fprintf(&b, "[%s] %s\n", id, resp)
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}

func teamMsgCommand(tr *TeamRegistry, exec AgentExecutor) *Command {
	return &Command{
		Name:        "team_msg",
		Description: "Send a message from one agent to another within a team",
		Usage:       "/team_msg <team> <from_agent> <to_agent> <message>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 4)
			if len(parts) < 4 {
				return &CommandResult{Content: "Usage: /team_msg <team> <from> <to> <message>"}, nil
			}
			team, from, to, msg := parts[0], parts[1], parts[2], parts[3]
			if !tr.Has(team, from) || !tr.Has(team, to) {
				return &CommandResult{Content: fmt.Sprintf("Both agents must be in team %q.", team)}, nil
			}
			prompt := fmt.Sprintf("[team:%s] Message from %s: %s", team, from, msg)
			resp, err := exec.ExecuteAgent(ctx, to, prompt)
			if err != nil {
				return &CommandResult{Content: fmt.Sprintf("Failed: %v", err)}, nil
			}
			return &CommandResult{
				Content: fmt.Sprintf("[%s → %s] %s", from, to, resp),
			}, nil
		},
	}
}
