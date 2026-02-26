package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nidhogg/nuka-world/internal/mcp"
	"github.com/nidhogg/nuka-world/internal/provider"
)

// RegisterBuiltinTools adds the default tools to a registry.
func RegisterBuiltinTools(reg *ToolRegistry, e *Engine) {
	reg.Register(provider.Tool{
		Type: "function",
		Function: provider.ToolFunction{
			Name:        "get_current_time",
			Description: "Get the current world time and real time",
			Parameters: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}, func(ctx context.Context, args string) (string, error) {
		return fmt.Sprintf(`{"real_time":"%s"}`, time.Now().Format(time.RFC3339)), nil
	})

	reg.Register(provider.Tool{
		Type: "function",
		Function: provider.ToolFunction{
			Name:        "list_agents",
			Description: "List all registered agents in Nuka World",
			Parameters: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}, func(ctx context.Context, args string) (string, error) {
		agents := e.List()
		type brief struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Role   string `json:"role"`
			Status string `json:"status"`
		}
		list := make([]brief, len(agents))
		for i, a := range agents {
			list[i] = brief{
				ID:     a.Persona.ID,
				Name:   a.Persona.Name,
				Role:   a.Persona.Role,
				Status: string(a.Status),
			}
		}
		b, _ := json.Marshal(list)
		return string(b), nil
	})

	reg.Register(provider.Tool{
		Type: "function",
		Function: provider.ToolFunction{
			Name:        "create_schedule",
			Description: "Create a scheduled task for an agent in Nuka World",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"agent_id":  map[string]string{"type": "string", "description": "Target agent ID"},
					"title":     map[string]string{"type": "string", "description": "Task title"},
					"type":      map[string]string{"type": "string", "description": "Activity type: work|review|social|rest|learn"},
					"delay_min": map[string]string{"type": "number", "description": "Minutes from now to start"},
					"duration":  map[string]string{"type": "number", "description": "Duration in minutes"},
					"recurring": map[string]string{"type": "string", "description": "Cron expression for recurring tasks (optional)"},
				},
				"required": []string{"agent_id", "title", "type"},
			},
		},
	}, func(ctx context.Context, args string) (string, error) {
		var p struct {
			AgentID  string  `json:"agent_id"`
			Title    string  `json:"title"`
			Type     string  `json:"type"`
			DelayMin float64 `json:"delay_min"`
			Duration float64 `json:"duration"`
			Recurring string `json:"recurring"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", fmt.Errorf("parse args: %w", err)
		}
		if p.Duration == 0 {
			p.Duration = 30
		}
		if p.DelayMin == 0 {
			p.DelayMin = 1
		}
		// Store in engine's pending schedules for the handler to pick up
		entry := ScheduleRequest{
			AgentID:   p.AgentID,
			Title:     p.Title,
			Type:      p.Type,
			StartTime: time.Now().Add(time.Duration(p.DelayMin) * time.Minute),
			Duration:  time.Duration(p.Duration) * time.Minute,
			Recurring: p.Recurring,
		}
		e.addPendingSchedule(entry)
		return fmt.Sprintf(`{"status":"scheduled","title":"%s","agent":"%s"}`, p.Title, p.AgentID), nil
	})

	reg.Register(provider.Tool{
		Type: "function",
		Function: provider.ToolFunction{
			Name:        "send_message",
			Description: "Send a message to another agent in Nuka World",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"target_agent": map[string]string{"type": "string", "description": "Target agent ID"},
					"message":      map[string]string{"type": "string", "description": "Message content"},
				},
				"required": []string{"target_agent", "message"},
			},
		},
	}, func(ctx context.Context, args string) (string, error) {
		var p struct {
			Target  string `json:"target_agent"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal([]byte(args), &p); err != nil {
			return "", fmt.Errorf("parse args: %w", err)
		}
		if _, ok := e.Get(p.Target); !ok {
			return fmt.Sprintf(`{"error":"agent %s not found"}`, p.Target), nil
		}
		// Execute the target agent with the message
		result, err := e.Execute(ctx, p.Target, p.Message)
		if err != nil {
			return fmt.Sprintf(`{"error":"%s"}`, err.Error()), nil
		}
		return fmt.Sprintf(`{"response":"%s"}`, truncate(result.Content, 500)), nil
	})
}

// ScheduleRequest is a pending schedule entry created by a tool call.
type ScheduleRequest struct {
	AgentID   string
	Title     string
	Type      string
	StartTime time.Time
	Duration  time.Duration
	Recurring string
}

// RegisterMCPTools bridges MCP server tools into the agent ToolRegistry.
func RegisterMCPTools(reg *ToolRegistry, clients []*mcp.Client) {
	for _, c := range clients {
		for _, tool := range c.ListTools() {
			client := c // capture
			t := tool   // capture
			reg.Register(provider.Tool{
				Type: "function",
				Function: provider.ToolFunction{
					Name:        t.Name,
					Description: t.Description,
					Parameters:  t.InputSchema,
				},
			}, func(ctx context.Context, args string) (string, error) {
				var parsed map[string]interface{}
				json.Unmarshal([]byte(args), &parsed)
				return client.CallTool(ctx, t.Name, parsed)
			})
		}
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
