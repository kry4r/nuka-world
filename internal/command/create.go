package command

import (
	"context"
	"fmt"
	"strings"
)

// ---------------------------------------------------------------------------
// Callback types — create commands use function callbacks to avoid importing
// concrete agent/skill/store types. The wiring code in main provides closures
// that bridge to the real implementations.
// ---------------------------------------------------------------------------

// AgentCreateFunc creates and registers an agent given an ID, name,
// personality, and system prompt. Returns the assigned agent ID.
type AgentCreateFunc func(id, name, personality, systemPrompt string) string

// SkillCreateFunc creates a skill, persists it, and assigns it to an agent.
// Returns the assigned skill ID or an error.
type SkillCreateFunc func(ctx context.Context, agentID, name, description string) (string, error)

// ---------------------------------------------------------------------------
// RegisterCreateCommands wires up the four /create_* slash commands.
// ---------------------------------------------------------------------------

// RegisterCreateCommands registers /create_agent, /create_skill,
// /create_team, and /create_schedule.
func RegisterCreateCommands(reg *Registry, createAgent AgentCreateFunc, createSkill SkillCreateFunc) {
	reg.Register(createAgentCommand(createAgent))
	reg.Register(createSkillCommand(createSkill))
	reg.Register(createTeamCommand())
	reg.Register(createScheduleCommand())
}

// ---------------------------------------------------------------------------
// /create_agent <name> <personality description>
// ---------------------------------------------------------------------------

func createAgentCommand(create AgentCreateFunc) *Command {
	return &Command{
		Name:        "create_agent",
		Description: "Create a new AI agent from a name and description",
		Usage:       "/create_agent <name> <personality description>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			args = strings.TrimSpace(args)
			if args == "" {
				return &CommandResult{
					Content: "Usage: /create_agent <name> <personality description>",
				}, nil
			}

			parts := strings.SplitN(args, " ", 2)
			name := parts[0]
			personality := ""
			if len(parts) > 1 {
				personality = strings.TrimSpace(parts[1])
			}
			if personality == "" {
				personality = "A helpful AI assistant."
			}

			systemPrompt := fmt.Sprintf("You are %s. %s", name, personality)
			id := create(name, name, personality, systemPrompt)

			return &CommandResult{
				Content: fmt.Sprintf("Agent created: [%s] %s\nPersonality: %s", id, name, personality),
				Data:    map[string]string{"agent_id": id, "name": name},
			}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /create_skill <agent_id> <description>
// ---------------------------------------------------------------------------

func createSkillCommand(create SkillCreateFunc) *Command {
	return &Command{
		Name:        "create_skill",
		Description: "Create a skill and assign it to an agent",
		Usage:       "/create_skill <agent_id> <skill description>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			args = strings.TrimSpace(args)
			if args == "" {
				return &CommandResult{
					Content: "Usage: /create_skill <agent_id> <skill description>",
				}, nil
			}

			parts := strings.SplitN(args, " ", 2)
			if len(parts) < 2 {
				return &CommandResult{
					Content: "Usage: /create_skill <agent_id> <skill description>",
				}, nil
			}

			agentID := parts[0]
			description := strings.TrimSpace(parts[1])

			// Derive a short name from the first few words of the description.
			name := deriveSkillName(description)

			skillID, err := create(ctx, agentID, name, description)
			if err != nil {
				return &CommandResult{
					Content: fmt.Sprintf("Failed to create skill: %v", err),
				}, nil
			}

			return &CommandResult{
				Content: fmt.Sprintf("Skill created: [%s] %s\nAssigned to agent: %s", skillID, name, agentID),
				Data:    map[string]string{"skill_id": skillID, "agent_id": agentID},
			}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /create_team <name> <agent_id1,agent_id2,...>
// ---------------------------------------------------------------------------

func createTeamCommand() *Command {
	return &Command{
		Name:        "create_team",
		Description: "Create a team of agents (placeholder)",
		Usage:       "/create_team <name> <agent_id1,agent_id2,...>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			args = strings.TrimSpace(args)
			if args == "" {
				return &CommandResult{
					Content: "Usage: /create_team <name> <agent_id1,agent_id2,...>",
				}, nil
			}

			parts := strings.SplitN(args, " ", 2)
			teamName := parts[0]
			var members []string
			if len(parts) > 1 {
				for _, m := range strings.Split(parts[1], ",") {
					m = strings.TrimSpace(m)
					if m != "" {
						members = append(members, m)
					}
				}
			}

			if len(members) == 0 {
				return &CommandResult{
					Content: "Usage: /create_team <name> <agent_id1,agent_id2,...>",
				}, nil
			}

			return &CommandResult{
				Content: fmt.Sprintf("Team '%s' registered with %d member(s): %s\n(Note: full orchestration pending)",
					teamName, len(members), strings.Join(members, ", ")),
				Data: map[string]interface{}{
					"team":    teamName,
					"members": members,
				},
			}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// /create_schedule <agent_id> <type> <description>
// ---------------------------------------------------------------------------

func createScheduleCommand() *Command {
	return &Command{
		Name:        "create_schedule",
		Description: "Create a scheduled task for an agent (placeholder)",
		Usage:       "/create_schedule <agent_id> <interval|cron|once> <description>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			args = strings.TrimSpace(args)
			if args == "" {
				return &CommandResult{
					Content: "Usage: /create_schedule <agent_id> <interval|cron|once> <description>",
				}, nil
			}

			parts := strings.SplitN(args, " ", 3)
			if len(parts) < 3 {
				return &CommandResult{
					Content: "Usage: /create_schedule <agent_id> <interval|cron|once> <description>",
				}, nil
			}

			agentID := parts[0]
			schedType := parts[1]
			description := strings.TrimSpace(parts[2])

			switch schedType {
			case "interval", "cron", "once":
				// valid
			default:
				return &CommandResult{
					Content: fmt.Sprintf("Unknown schedule type %q. Use: interval, cron, or once.", schedType),
				}, nil
			}

			return &CommandResult{
				Content: fmt.Sprintf("Schedule registered for agent %s:\n  Type: %s\n  Task: %s\n(Note: scheduler execution pending)",
					agentID, schedType, description),
				Data: map[string]string{
					"agent_id": agentID,
					"type":     schedType,
					"task":     description,
				},
			}, nil
		},
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// deriveSkillName creates a short kebab-case name from the first few words
// of a description string.
func deriveSkillName(description string) string {
	words := strings.Fields(description)
	if len(words) > 4 {
		words = words[:4]
	}
	for i, w := range words {
		words[i] = strings.ToLower(w)
	}
	name := strings.Join(words, "-")
	// Strip trailing punctuation.
	name = strings.TrimRight(name, ".,;:!?")
	if name == "" {
		name = "unnamed-skill"
	}
	return name
}
