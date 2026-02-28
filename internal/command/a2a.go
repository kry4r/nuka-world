package command

import (
	"context"
	"fmt"
	"strings"
)

// A2ATaskCreator creates A2A collaboration tasks.
type A2ATaskCreator interface {
	CreateTask(ctx context.Context, description string, maxRounds int) (taskID string, proposed []string, err error)
}

// A2ATaskQuerier queries A2A task status.
type A2ATaskQuerier interface {
	GetTaskStatus(ctx context.Context, taskID string) (string, error)
}

// RegisterA2ACommands registers /a2a_task and /a2a_status.
func RegisterA2ACommands(reg *Registry, creator A2ATaskCreator, querier A2ATaskQuerier) {
	reg.Register(a2aTaskCommand(creator))
	reg.Register(a2aStatusCommand(querier))
}

func a2aTaskCommand(creator A2ATaskCreator) *Command {
	return &Command{
		Name:        "a2a_task",
		Description: "Submit an A2A collaboration task",
		Usage:       "/a2a_task <description>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			desc := strings.TrimSpace(args)
			if desc == "" {
				return &CommandResult{Content: "Usage: /a2a_task <task description>"}, nil
			}
			taskID, proposed, err := creator.CreateTask(ctx, desc, 10)
			if err != nil {
				return nil, err
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("A2A task created: %s\n", taskID))
			if len(proposed) > 0 {
				sb.WriteString(fmt.Sprintf("Proposed agents: %s\n", strings.Join(proposed, ", ")))
				sb.WriteString("Use /a2a_confirm to start collaboration.")
			}
			return &CommandResult{
				Content: sb.String(),
				Data:    map[string]string{"task_id": taskID},
			}, nil
		},
	}
}

func a2aStatusCommand(querier A2ATaskQuerier) *Command {
	return &Command{
		Name:        "a2a_status",
		Description: "Check A2A task status",
		Usage:       "/a2a_status <task_id>",
		Handler: func(ctx context.Context, args string, _ *CommandContext) (*CommandResult, error) {
			taskID := strings.TrimSpace(args)
			if taskID == "" {
				return &CommandResult{Content: "Usage: /a2a_status <task_id>"}, nil
			}
			status, err := querier.GetTaskStatus(ctx, taskID)
			if err != nil {
				return nil, err
			}
			return &CommandResult{Content: status}, nil
		},
	}
}
