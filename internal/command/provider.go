package command

import (
	"context"
	"fmt"
	"strings"
)

// ProviderSwitcher manages provider defaults and listing.
type ProviderSwitcher interface {
	SetDefault(providerID string)
	ListProviders() []ProviderInfo
}

// ProviderInfo holds basic provider info for command output.
type ProviderInfo struct {
	ID        string
	Name      string
	Type      string
	IsDefault bool
}

// RegisterProviderCommands registers /switch_provider and /switch_model.
func RegisterProviderCommands(reg *Registry, switcher ProviderSwitcher) {
	reg.Register(switchProviderCommand(switcher))
	reg.Register(switchModelCommand(switcher))
}

func switchProviderCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "switch_provider",
		Description: "Switch the default LLM provider",
		Usage:       "/switch_provider <provider_id>",
		Handler: func(_ context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			id := strings.TrimSpace(args)
			if id == "" {
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
				sb.WriteString("\nUsage: /switch_provider <provider_id>")
				return &CommandResult{Content: sb.String()}, nil
			}
			switcher.SetDefault(id)
			return &CommandResult{
				Content: fmt.Sprintf("Default provider switched to %q.", id),
			}, nil
		},
	}
}

func switchModelCommand(switcher ProviderSwitcher) *Command {
	return &Command{
		Name:        "switch_model",
		Description: "Switch the model for a specific provider",
		Usage:       "/switch_model <provider_id> <model>",
		Handler: func(_ context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			parts := strings.Fields(args)
			if len(parts) < 2 {
				return &CommandResult{Content: "Usage: /switch_model <provider_id> <model>"}, nil
			}
			providerID := parts[0]
			model := parts[1]
			// Model switching is handled at the agent engine level via binding
			return &CommandResult{
				Content: fmt.Sprintf("Model switched to %q on provider %q.", model, providerID),
				Data:    map[string]string{"provider_id": providerID, "model": model},
			}, nil
		},
	}
}
