package router

import (
	"context"
	"fmt"
	"strings"

	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/command"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	"github.com/nidhogg/nuka-world/internal/provider"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
	"go.uber.org/zap"
)

// MessageRouter routes inbound messages to the appropriate agent or team.
type MessageRouter struct {
	engine   *agent.Engine
	gw       *gateway.Gateway
	steward  *orchestrator.Steward
	store    *pgstore.Store
	commands *command.Registry
	logger   *zap.Logger
}

// New creates a new MessageRouter.
func New(engine *agent.Engine, gw *gateway.Gateway,
	steward *orchestrator.Steward, store *pgstore.Store,
	commands *command.Registry, logger *zap.Logger) *MessageRouter {
	return &MessageRouter{
		engine:   engine,
		gw:       gw,
		steward:  steward,
		store:    store,
		commands: commands,
		logger:   logger,
	}
}

// Handle routes an inbound message to the appropriate agent.
// Signature matches gateway.MessageHandler.
func (mr *MessageRouter) Handle(msg *gateway.InboundMessage) {
	ctx := context.Background()
	mr.logger.Info("routing message",
		zap.String("platform", msg.Platform),
		zap.String("channel", msg.ChannelID),
		zap.String("user", msg.UserName),
	)

	// 0. Intercept slash commands before any agent/team routing
	if strings.HasPrefix(msg.Content, "/") {
		cc := &command.CommandContext{
			Platform:  msg.Platform,
			ChannelID: msg.ChannelID,
			UserID:    msg.UserID,
			UserName:  msg.UserName,
			Engine:    mr.engine,
			Store:     mr.store,
		}
		result, err := mr.commands.Dispatch(ctx, msg.Content, cc)
		if err != nil {
			mr.logger.Error("command dispatch error", zap.Error(err))
			mr.sendReply(ctx, msg, "Command error: "+err.Error())
			return
		}
		mr.sendReply(ctx, msg, result.Content)
		return
	}

	// 1. Try Team routing first (@team-<name>)
	if teamID, cleanMsg := mr.resolveTeam(msg.Content); teamID != "" && mr.steward != nil {
		mr.handleTeam(ctx, msg, teamID, cleanMsg)
		return
	}

	// 2. Agent routing (@AgentName)
	agentID, cleanContent := mr.resolveAgent(msg.Content)
	if agentID == "" {
		mr.sendReply(ctx, msg, "No agent matched. Mention an agent with @Name.")
		return
	}

	// Persist user message if store available
	var sessionID string
	if mr.store != nil {
		sid, err := mr.store.FindOrCreateSession(ctx, agentID, msg.ChannelID, msg.Platform)
		if err != nil {
			mr.logger.Error("find/create session failed", zap.Error(err))
		} else {
			sessionID = sid
			_ = mr.store.AppendMessage(ctx, sessionID, provider.Message{
				Role:    "user",
				Content: cleanContent,
			})
		}
	}

	// Execute agent
	result, err := mr.engine.Execute(ctx, agentID, cleanContent)
	if err != nil {
		mr.logger.Error("agent execute failed", zap.String("agent", agentID), zap.Error(err))
		mr.sendReply(ctx, msg, fmt.Sprintf("Agent error: %s", err.Error()))
		return
	}

	// Persist assistant reply
	if mr.store != nil && sessionID != "" {
		_ = mr.store.AppendMessage(ctx, sessionID, provider.Message{
			Role:    "assistant",
			Content: result.Content,
		})
	}

	// Send reply back to platform
	mr.sendReply(ctx, msg, result.Content)
}

// resolveAgent parses @AgentName from message content.
// Returns the agent ID and content with the mention stripped.
func (mr *MessageRouter) resolveAgent(content string) (string, string) {
	for _, a := range mr.engine.List() {
		mention := "@" + a.Persona.Name
		if strings.Contains(content, mention) {
			clean := strings.TrimSpace(strings.Replace(content, mention, "", 1))
			return a.Persona.ID, clean
		}
	}
	// No mention found — if only one agent exists, use it as default
	agents := mr.engine.List()
	if len(agents) == 1 {
		return agents[0].Persona.ID, content
	}
	return "", content
}

// resolveTeam checks for @team-<name> pattern in message content.
// Returns team ID and cleaned content, or empty string if no match.
func (mr *MessageRouter) resolveTeam(content string) (string, string) {
	if mr.steward == nil {
		return "", content
	}
	for _, team := range mr.steward.ListTeams() {
		mention := "@team-" + team.Name
		if strings.Contains(content, mention) {
			clean := strings.TrimSpace(strings.Replace(content, mention, "", 1))
			return team.ID, clean
		}
	}
	return "", content
}

// handleTeam dispatches a message to a team via the Steward.
func (mr *MessageRouter) handleTeam(ctx context.Context, msg *gateway.InboundMessage, teamID, cleanMsg string) {
	mr.sendReply(ctx, msg, "Team is collaborating on your request...")

	result, err := mr.steward.Handle(ctx, teamID, cleanMsg)
	if err != nil {
		mr.logger.Error("team handle failed", zap.String("team", teamID), zap.Error(err))
		mr.sendReply(ctx, msg, fmt.Sprintf("Team error: %s", err.Error()))
		return
	}

	mr.sendReply(ctx, msg, mr.formatTeamResult(result))
}

// formatTeamResult formats a StewardResult for chat display.
func (mr *MessageRouter) formatTeamResult(r *orchestrator.StewardResult) string {
	var buf strings.Builder
	for _, t := range r.Tasks {
		fmt.Fprintf(&buf, "> *%s*: %s\n", t.AgentID, t.Output)
	}
	if r.Summary != "" {
		buf.WriteString("\n")
		buf.WriteString(r.Summary)
	}
	if buf.Len() == 0 {
		return r.Summary
	}
	return buf.String()
}

// sendReply sends a text reply back to the originating platform/channel.
func (mr *MessageRouter) sendReply(ctx context.Context, orig *gateway.InboundMessage, text string) {
	err := mr.gw.Send(ctx, &gateway.OutboundMessage{
		Platform:  orig.Platform,
		ChannelID: orig.ChannelID,
		Content:   text,
		ReplyTo:   orig.ReplyTo,
	})
	if err != nil {
		mr.logger.Error("send reply failed", zap.Error(err))
	}
}
