package command

import (
	"context"
	"fmt"
	"strings"
)

// ProviderSwitcher manages provider defaults, listing, and per-agent binding.
type ProviderSwitcher interface {
	SetDefault(providerID string)
	ListProviders() []ProviderInfo
	BindAgent(agentID, providerID string)
	SetAgentModel(agentID, model string)
	GetAgentBinding(agentID string) (providerID, model string)
}

// ProviderInfo holds basic provider info for command output.
type ProviderInfo struct {
	ID        string
	Name      string
	Type      string
	Endpoint  string
	Models    []string
	IsDefault bool
}

// RegisterProviderCommands registers /providers, /models, /switch_provider, /switch_model.
func RegisterProviderCommands(reg *Registry, switcher ProviderSwitcher) {
	reg.Register(listProvidersCommand(switcher))
	reg.Register(listModelsCommand(switcher))
	reg.Register(switchProviderCommand(switcher))
	reg.Register(switchModelCommand(switcher))
}

func listProvidersCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "providers",
		Description: "List all available LLM providers and their models",
		Usage:       "/providers",
		Handler: func(_ context.Context, _ string, _ *CommandContext) (*CommandResult, error) {
			providers := switcher.ListProviders()
			if len(providers) == 0 {
				return &CommandResult{Content: "No providers configured."}, nil
			}
			var sb strings.Builder
			sb.WriteString("Available providers:\n")
			for _, p := range providers {
				marker := "  "
				if p.IsDefault {
					marker = "* "
				}
				sb.WriteString(fmt.Sprintf("%s%s (id=%s, type=%s)\n", marker, p.Name, p.ID, p.Type))
				if len(p.Models) > 0 {
					sb.WriteString(fmt.Sprintf("    models: %s\n", strings.Join(p.Models, ", ")))
				}
			}
			sb.WriteString("\n* = default provider")
			return &CommandResult{
				Content: sb.String(),
				Data:    providers,
			}, nil
		},
	}
}

func listModelsCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "models",
		Description: "List models available on a provider, or all providers if no ID given",
		Usage:       "/models [provider_id]",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			id := strings.TrimSpace(args)
			providers := switcher.ListProviders()
			if len(providers) == 0 {
				return &CommandResult{Content: "No providers configured."}, nil
			}
			var sb strings.Builder
			for _, p := range providers {
				if id != "" && p.ID != id {
					continue
				}
				sb.WriteString(fmt.Sprintf("%s (%s):\n", p.Name, p.ID))
				if len(p.Models) == 0 {
					sb.WriteString("  (no models listed)\n")
				} else {
					for _, m := range p.Models {
						sb.WriteString(fmt.Sprintf("  - %s\n", m))
					}
				}
			}
			if sb.Len() == 0 {
				return &CommandResult{Content: fmt.Sprintf("Provider %q not found.", id)}, nil
			}
			return &CommandResult{Content: sb.String()}, nil
		},
	}
}

func switchProviderCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "switch_provider",
		Description: "Switch the LLM provider for an agent (or set global default)",
		Usage:       "/switch_provider <agent_id> <provider_id>  OR  /switch_provider <provider_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.Fields(args)
			if len(parts) == 0 {
				providers := switcher.ListProviders()
				var sb strings.Builder
				sb.WriteString("Available providers:\n")
				for _, p := range providers {
					marker := "  "
					if p.IsDefault {
						marker = "* "
					}
					sb.WriteString(fmt.Sprintf("%s%s (%s) [%s]\n", marker, p.Name, p.ID, p.Type))
				}
				sb.WriteString("\nUsage: /switch_provider <agent_id> <provider_id>")
				return &CommandResult{Content: sb.String()}, nil
			}
			if len(parts) == 1 {
				// Global default switch
				switcher.SetDefault(parts[0])
				return &CommandResult{
					Content: fmt.Sprintf("Global default provider switched to %q.", parts[0]),
				}, nil
			}
			// Per-agent binding
			agentID, providerID := parts[0], parts[1]
			switcher.BindAgent(agentID, providerID)
			return &CommandResult{
				Content: fmt.Sprintf("Agent %q now uses provider %q.", agentID, providerID),
				Data:    map[string]string{"agent_id": agentID, "provider_id": providerID},
			}, nil
		},
	}
}

func switchModelCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "switch_model",
		Description: "Switch the model for an agent",
		Usage:       "/switch_model <agent_id> <model>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			parts := strings.Fields(args)
			if len(parts) < 2 {
				return &CommandResult{
					Content: "Usage: /switch_model <agent_id> <model>\n\nUse /models to see available models per provider.",
				}, nil
			}
			agentID, model := parts[0], parts[1]
			switcher.SetAgentModel(agentID, model)
			return &CommandResult{
				Content: fmt.Sprintf("Agent %q now uses model %q.", agentID, model),
				Data:    map[string]string{"agent_id": agentID, "model": model},
			}, nil
		},
	}
}
