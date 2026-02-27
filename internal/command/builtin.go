package command

import (
	"context"
	"fmt"
	"strings"
)

// ---------------------------------------------------------------------------
// Interfaces — kept here so builtin commands avoid importing concrete types.
// ---------------------------------------------------------------------------

// AgentLister lists registered agents.
type AgentLister interface {
	List() []AgentInfo
}

// AgentInfo describes a registered agent.
type AgentInfo struct {
	ID     string
	Name   string
	Role   string
	Status string
}

// MCPLister lists MCP server tools.
type MCPLister interface {
	ListTools() []ToolInfo
}

// ToolInfo describes a single tool exposed by an MCP server.
type ToolInfo struct {
	ServerName string
	ToolName   string
}

// StatusProvider provides adapter connection status.
type StatusProvider interface {
	StatusAll() []AdapterStatus
}

// AdapterStatus describes the connection state of a platform adapter.
type AdapterStatus struct {
	Name      string
	Platform  string
	Connected bool
}

// SkillLister lists available skills.
type SkillLister interface {
	ListSkills() []SkillInfo
}

// SkillInfo describes a loaded skill.
type SkillInfo struct {
	Name        string
	Description string
	Source      string
}

// ---------------------------------------------------------------------------
// RegisterBuiltins wires up the five built-in slash commands.
// ---------------------------------------------------------------------------

// RegisterBuiltins registers /help, /agents, /mcp, /status, and /skills.
func RegisterBuiltins(reg *Registry, agents AgentLister, mcp MCPLister, status StatusProvider, skills SkillLister) {
	reg.Register(helpCommand(reg))
	reg.Register(agentsCommand(agents))
	reg.Register(mcpCommand(mcp))
	reg.Register(statusCommand(status))
	reg.Register(skillsCommand(skills))
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

func helpCommand(reg *Registry) *Command {
	return &Command{
		Name:        "help",
		Description: "List all available commands",
		Usage:       "/help",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			cmds := reg.List()
			var b strings.Builder
			b.WriteString("Available commands:\n")
			for _, c := range cmds {
				fmt.Fprintf(&b, "  /%s — %s\n", c.Name, c.Description)
				if c.Usage != "" {
					fmt.Fprintf(&b, "    Usage: %s\n", c.Usage)
				}
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /agents
// ---------------------------------------------------------------------------

func agentsCommand(lister AgentLister) *Command {
	return &Command{
		Name:        "agents",
		Description: "List registered AI agents",
		Usage:       "/agents",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			agents := lister.List()
			if len(agents) == 0 {
				return &CommandResult{Content: "No agents registered."}, nil
			}
			var b strings.Builder
			b.WriteString("Registered agents:\n")
			for _, a := range agents {
				fmt.Fprintf(&b, "  [%s] %s — role: %s, status: %s\n",
					a.ID, a.Name, a.Role, a.Status)
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /mcp
// ---------------------------------------------------------------------------

func mcpCommand(lister MCPLister) *Command {
	return &Command{
		Name:        "mcp",
		Description: "List MCP server tools",
		Usage:       "/mcp",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			tools := lister.ListTools()
			if len(tools) == 0 {
				return &CommandResult{Content: "No MCP tools available."}, nil
			}
			// Group tools by server name.
			servers := make(map[string][]string)
			var order []string
			for _, t := range tools {
				if _, seen := servers[t.ServerName]; !seen {
					order = append(order, t.ServerName)
				}
				servers[t.ServerName] = append(servers[t.ServerName], t.ToolName)
			}
			var b strings.Builder
			b.WriteString("MCP servers & tools:\n")
			for _, srv := range order {
				names := servers[srv]
				fmt.Fprintf(&b, "  %s (%d tools)\n", srv, len(names))
				for _, n := range names {
					fmt.Fprintf(&b, "    - %s\n", n)
				}
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------

func statusCommand(provider StatusProvider) *Command {
	return &Command{
		Name:        "status",
		Description: "Show adapter connection status",
		Usage:       "/status",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			adapters := provider.StatusAll()
			if len(adapters) == 0 {
				return &CommandResult{Content: "No adapters configured."}, nil
			}
			var b strings.Builder
			b.WriteString("Adapter status:\n")
			for _, a := range adapters {
				state := "disconnected"
				if a.Connected {
					state = "connected"
				}
				fmt.Fprintf(&b, "  %s (%s): %s\n", a.Name, a.Platform, state)
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /skills
// ---------------------------------------------------------------------------

func skillsCommand(lister SkillLister) *Command {
	return &Command{
		Name:        "skills",
		Description: "List available skills",
		Usage:       "/skills",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			skills := lister.ListSkills()
			if len(skills) == 0 {
				return &CommandResult{Content: "No skills registered yet."}, nil
			}
			var b strings.Builder
			b.WriteString("Available skills:\n")
			for _, s := range skills {
				fmt.Fprintf(&b, "  %s — %s", s.Name, s.Description)
				if s.Source != "" {
					fmt.Fprintf(&b, " (source: %s)", s.Source)
				}
				b.WriteByte('\n')
			}
			return &CommandResult{Content: b.String()}, nil
		},
	}
}
