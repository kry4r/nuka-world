package a2a

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
)

// ChatExecutor is the interface for executing agent chat.
type ChatExecutor interface {
	ExecuteAgent(ctx context.Context, agentID, message string) (string, error)
}

// ConversationEngine runs moderated multi-agent conversations.
type ConversationEngine struct {
	executor ChatExecutor
	store    *Store
	logger   *zap.Logger
}

// NewConversationEngine creates a new conversation engine.
func NewConversationEngine(executor ChatExecutor, store *Store, logger *zap.Logger) *ConversationEngine {
	return &ConversationEngine{
		executor: executor,
		store:    store,
		logger:   logger,
	}
}

// Run executes the moderated conversation loop for a task.
func (ce *ConversationEngine) Run(ctx context.Context, task *Task) error {
	if len(task.ConfirmedAgents) == 0 {
		return fmt.Errorf("no confirmed agents for task %s", task.ID)
	}

	// Transition to working
	if err := Transition(task.Status, StatusWorking); err != nil {
		return err
	}
	if err := ce.store.UpdateTaskStatus(ctx, task.ID, StatusWorking, ""); err != nil {
		return err
	}
	task.Status = StatusWorking

	for round := 1; round <= task.MaxRounds; round++ {
		ce.logger.Info("a2a round", zap.Int("round", round), zap.String("task", task.ID))

		// World moderator decides next speaker
		speaker := ce.selectNextSpeaker(ctx, task, round)

		// Build context for the speaker
		prompt := ce.buildPrompt(ctx, task, speaker, round)

		// Execute agent
		reply, err := ce.executor.ExecuteAgent(ctx, speaker, prompt)
		if err != nil {
			ce.logger.Warn("agent execution failed", zap.String("agent", speaker), zap.Error(err))
			reply = fmt.Sprintf("[%s failed to respond: %v]", speaker, err)
		}

		// Store message
		msg := &Message{
			TaskID: task.ID, FromAgent: speaker,
			Content: reply, Round: round, MsgType: "agent",
		}
		_ = ce.store.AddMessage(ctx, msg)

		// Check consensus
		if ce.checkConsensus(reply) {
			summary := ce.summarize(ctx, task)
			_ = ce.store.UpdateTaskStatus(ctx, task.ID, StatusCompleted, summary)
			task.Status = StatusCompleted
			task.Result = summary
			return nil
		}
	}

	// Max rounds reached — World summarizes
	summary := ce.summarize(ctx, task)
	_ = ce.store.UpdateTaskStatus(ctx, task.ID, StatusCompleted, summary)
	task.Status = StatusCompleted
	task.Result = summary
	return nil
}

// selectNextSpeaker picks the next agent to speak using round-robin.
func (ce *ConversationEngine) selectNextSpeaker(_ context.Context, task *Task, round int) string {
	agents := task.ConfirmedAgents
	idx := (round - 1) % len(agents)
	return agents[idx]
}

// buildPrompt constructs the context prompt for the next speaker.
func (ce *ConversationEngine) buildPrompt(ctx context.Context, task *Task, speaker string, round int) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[A2A协作任务] %s\n\n", task.Description))
	sb.WriteString(fmt.Sprintf("参与者: %s\n", strings.Join(task.ConfirmedAgents, ", ")))
	sb.WriteString(fmt.Sprintf("当前轮次: %d/%d\n\n", round, task.MaxRounds))

	// Append conversation history
	msgs, err := ce.store.GetMessages(ctx, task.ID)
	if err == nil && len(msgs) > 0 {
		sb.WriteString("=== 对话历史 ===\n")
		for _, m := range msgs {
			sb.WriteString(fmt.Sprintf("[%s] %s\n", m.FromAgent, m.Content))
		}
		sb.WriteString("=== 历史结束 ===\n\n")
	}

	sb.WriteString(fmt.Sprintf("你是 %s，请基于以上对话给出你的观点和建议。", speaker))
	if round >= task.MaxRounds {
		sb.WriteString(" 这是最后一轮，请给出最终结论。")
	}
	return sb.String()
}

// checkConsensus checks if the reply signals task completion.
func (ce *ConversationEngine) checkConsensus(reply string) bool {
	lower := strings.ToLower(reply)
	markers := []string{"[consensus]", "[完成]", "[结论]", "[done]"}
	for _, m := range markers {
		if strings.Contains(lower, m) {
			return true
		}
	}
	return false
}

// summarize asks World to produce a final summary of the conversation.
func (ce *ConversationEngine) summarize(ctx context.Context, task *Task) string {
	msgs, err := ce.store.GetMessages(ctx, task.ID)
	if err != nil || len(msgs) == 0 {
		return "No conversation to summarize."
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("请总结以下关于「%s」的协作对话，给出最终结论：\n\n", task.Description))
	for _, m := range msgs {
		sb.WriteString(fmt.Sprintf("[%s] %s\n", m.FromAgent, m.Content))
	}

	result, err := ce.executor.ExecuteAgent(ctx, "world", sb.String())
	if err != nil {
		ce.logger.Warn("summarize failed", zap.Error(err))
		// Fallback: use last message
		return msgs[len(msgs)-1].Content
	}
	return result
}
