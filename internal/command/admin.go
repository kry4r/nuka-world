package command

import (
	"context"
	"fmt"
	"strings"
)

// AgentGetter retrieves an agent's info by ID.
type AgentGetter interface {
	GetAgent(id string) (AgentInfo, bool)
}

// AgentRemover removes an agent by ID.
type AgentRemover interface {
	RemoveAgent(id string) bool
}

// SkillAssigner assigns/unassigns skills to agents.
type SkillAssigner interface {
	AssignSkill(agentID, skillID string)
	UnassignSkill(agentID, skillID string)
}

// RegisterAdminCommands registers /agent_info, /remove_agent, /assign_skill, /unassign_skill.
func RegisterAdminCommands(reg *Registry, getter AgentGetter, remover AgentRemover, skills SkillAssigner) {
	reg.Register(agentInfoCommand(getter))
	reg.Register(removeAgentCommand(remover))
	reg.Register(assignSkillCommand(skills))
	reg.Register(unassignSkillCommand(skills))
}

func agentInfoCommand(getter AgentGetter) *Command {
	return &Command{
		Name:        "agent_info",
		Description: "Show details of a specific agent",
		Usage:       "/agent_info <agent_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			id := strings.TrimSpace(args)
			if id == "" {
				return &CommandResult{Content: "Usage: /agent_info <agent_id>"}, nil
			}
			a, ok := getter.GetAgent(id)
			if !ok {
				return &CommandResult{Content: fmt.Sprintf("Agent %q not found.", id)}, nil
			}
			return &CommandResult{
				Content: fmt.Sprintf("Agent: %s\n  ID: %s\n  Role: %s\n  Status: %s", a.Name, a.ID, a.Role, a.Status),
				Data:    a,
			}, nil
		},
	}
}

func assignSkillCommand(skills SkillAssigner) *Command {
	return &Command{
		Name:        "assign_skill",
		Description: "Assign a skill to an agent",
		Usage:       "/assign_skill <agent_id> <skill_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /assign_skill <agent_id> <skill_id>"}, nil
			}
			skills.AssignSkill(parts[0], strings.TrimSpace(parts[1]))
			return &CommandResult{Content: fmt.Sprintf("Skill %q assigned to agent %q.", parts[1], parts[0])}, nil
		},
	}
}

func unassignSkillCommand(skills SkillAssigner) *Command {
	return &Command{
		Name:        "unassign_skill",
		Description: "Remove a skill from an agent",
		Usage:       "/unassign_skill <agent_id> <skill_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.SplitN(strings.TrimSpace(args), " ", 2)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /unassign_skill <agent_id> <skill_id>"}, nil
			}
			skills.UnassignSkill(parts[0], strings.TrimSpace(parts[1]))
			return &CommandResult{Content: fmt.Sprintf("Skill %q removed from agent %q.", parts[1], parts[0])}, nil
		},
	}
}

func removeAgentCommand(remover AgentRemover) *Command {
	return &Command{
		Name:        "remove_agent",
		Description: "Remove an agent by ID",
		Usage:       "/remove_agent <agent_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			id := strings.TrimSpace(args)
			if id == "" {
				return &CommandResult{Content: "Usage: /remove_agent <agent_id>"}, nil
			}
			if !remover.RemoveAgent(id) {
				return &CommandResult{Content: fmt.Sprintf("Agent %q not found.", id)}, nil
			}
			return &CommandResult{Content: fmt.Sprintf("Agent %q removed.", id)}, nil
		},
	}
}
