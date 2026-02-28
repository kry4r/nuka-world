package command

import (
	"context"
	"encoding/json"
	"fmt"
)

// ToolDef mirrors provider.Tool without importing the provider package.
type ToolDef struct {
	Type     string       `json:"type"`
	Function ToolFuncDef  `json:"function"`
}

// ToolFuncDef mirrors provider.ToolFunction.
type ToolFuncDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

// BridgedTool is a command wrapped as a tool definition + handler pair.
type BridgedTool struct {
	Def     ToolDef
	Handler func(ctx context.Context, args string) (string, error)
}

// BridgeCommands converts all registered commands into tool definitions
// that an LLM can call via function calling. Each command becomes a tool
// with a single "args" string parameter matching the command's usage.
func BridgeCommands(reg *Registry, cc *CommandContext) []BridgedTool {
	cmds := reg.List()
	tools := make([]BridgedTool, 0, len(cmds))

	for _, cmd := range cmds {
		c := cmd // capture
		tools = append(tools, BridgedTool{
			Def: ToolDef{
				Type: "function",
				Function: ToolFuncDef{
					Name:        "cmd_" + c.Name,
					Description: fmt.Sprintf("Slash command /%s: %s\nUsage: %s", c.Name, c.Description, c.Usage),
					Parameters: map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"args": map[string]string{
								"type":        "string",
								"description": "Command arguments (everything after the command name)",
							},
						},
					},
				},
			},
			Handler: func(ctx context.Context, rawArgs string) (string, error) {
				var p struct {
					Args string `json:"args"`
				}
				if err := json.Unmarshal([]byte(rawArgs), &p); err != nil {
					p.Args = rawArgs
				}
				result, err := c.Handler(ctx, p.Args, cc)
				if err != nil {
					return fmt.Sprintf(`{"error":"%s"}`, err.Error()), nil
				}
				b, _ := json.Marshal(result)
				return string(b), nil
			},
		})
	}
	return tools
}
