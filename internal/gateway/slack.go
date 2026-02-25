package gateway

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/slack-go/slack"
	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"
	"go.uber.org/zap"
)

// AgentPersona defines how an agent appears on Slack.
type AgentPersona struct {
	Name    string `json:"name"`
	IconURL string `json:"icon_url"`
	Emoji   string `json:"emoji"` // fallback if no icon_url, e.g. ":robot_face:"
}

// SlackAdapter implements GatewayAdapter for Slack using Socket Mode.
type SlackAdapter struct {
	botToken  string
	appToken  string
	client    *slack.Client
	socket    *socketmode.Client
	handler   MessageHandler
	personas  map[string]*AgentPersona // agentID -> persona
	threads   map[string]string        // channelID:userID -> thread_ts for conversation continuity
	mu        sync.RWMutex
	logger    *zap.Logger
}

// NewSlackAdapter creates a Slack gateway adapter.
// botToken is the Bot User OAuth Token (xoxb-...).
// appToken is the App-Level Token (xapp-...) for Socket Mode.
func NewSlackAdapter(botToken, appToken string, logger *zap.Logger) *SlackAdapter {
	client := slack.New(botToken,
		slack.OptionAppLevelToken(appToken),
	)

	socket := socketmode.New(client,
		socketmode.OptionLog(zap.NewStdLog(logger)),
	)

	return &SlackAdapter{
		botToken: botToken,
		appToken: appToken,
		client:   client,
		socket:   socket,
		personas: make(map[string]*AgentPersona),
		threads:  make(map[string]string),
		logger:   logger,
	}
}

func (a *SlackAdapter) Platform() string { return "slack" }

func (a *SlackAdapter) OnMessage(h MessageHandler) { a.handler = h }

// SetPersona registers an agent's display persona for Slack messages.
func (a *SlackAdapter) SetPersona(agentID string, persona *AgentPersona) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.personas[agentID] = persona
}

// Connect starts the Socket Mode event loop in a background goroutine.
func (a *SlackAdapter) Connect(ctx context.Context) error {
	go a.handleEvents(ctx)
	go func() {
		if err := a.socket.RunContext(ctx); err != nil {
			a.logger.Error("slack socket mode error", zap.Error(err))
		}
	}()
	a.logger.Info("slack adapter connected via socket mode")
	return nil
}

// handleEvents processes incoming Socket Mode events.
func (a *SlackAdapter) handleEvents(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-a.socket.Events:
			if !ok {
				return
			}
			a.processEvent(evt)
		}
	}
}

func (a *SlackAdapter) processEvent(evt socketmode.Event) {
	switch evt.Type {
	case socketmode.EventTypeEventsAPI:
		eventsAPI, ok := evt.Data.(slackevents.EventsAPIEvent)
		if !ok {
			return
		}
		a.socket.Ack(*evt.Request)

		if eventsAPI.Type == slackevents.CallbackEvent {
			switch inner := eventsAPI.InnerEvent.Data.(type) {
			case *slackevents.MessageEvent:
				// Ignore bot messages to avoid loops
				if inner.BotID != "" {
					return
				}
				a.handleSlackMessage(inner)
			}
		}
	}
}

func (a *SlackAdapter) handleSlackMessage(ev *slackevents.MessageEvent) {
	if a.handler == nil {
		return
	}

	threadTS := ev.ThreadTimeStamp
	if threadTS == "" {
		threadTS = ev.TimeStamp
	}
	key := fmt.Sprintf("%s:%s", ev.Channel, ev.User)
	a.mu.Lock()
	a.threads[key] = threadTS
	a.mu.Unlock()

	a.handler(&InboundMessage{
		Platform:  "slack",
		ChannelID: ev.Channel,
		UserID:    ev.User,
		UserName:  ev.User,
		Content:   ev.Text,
		Timestamp: time.Now(),
		ReplyTo:   threadTS,
	})
}

// Send posts a message to a Slack channel with agent persona styling.
func (a *SlackAdapter) Send(_ context.Context, msg *OutboundMessage) error {
	opts := []slack.MsgOption{
		slack.MsgOptionText(msg.Content, false),
	}

	// Thread reply if we have a tracked thread
	if msg.ReplyTo != "" {
		opts = append(opts, slack.MsgOptionTS(msg.ReplyTo))
	}

	// Apply agent persona for distinct identity
	opts = append(opts, a.personaOpts(msg.AgentID)...)

	_, _, err := a.client.PostMessage(msg.ChannelID, opts...)
	if err != nil {
		a.logger.Error("slack send failed",
			zap.String("channel", msg.ChannelID), zap.Error(err))
		return fmt.Errorf("slack send: %w", err)
	}
	return nil
}

// personaOpts builds Slack message options for agent persona display.
func (a *SlackAdapter) personaOpts(agentID string) []slack.MsgOption {
	if agentID == "" {
		return nil
	}
	a.mu.RLock()
	p, ok := a.personas[agentID]
	a.mu.RUnlock()
	if !ok {
		return nil
	}

	opts := []slack.MsgOption{
		slack.MsgOptionUsername(p.Name),
	}
	if p.IconURL != "" {
		opts = append(opts, slack.MsgOptionIconURL(p.IconURL))
	} else if p.Emoji != "" {
		opts = append(opts, slack.MsgOptionIconEmoji(p.Emoji))
	}
	return opts
}

// Broadcast sends a broadcast message to all channels the bot is in.
func (a *SlackAdapter) Broadcast(_ context.Context, msg *BroadcastMessage) error {
	text := fmt.Sprintf("*[%s] %s*\n%s", msg.Type, msg.Title, msg.Content)

	opts := []slack.MsgOption{
		slack.MsgOptionText(text, false),
	}
	opts = append(opts, a.personaOpts(msg.AgentID)...)

	// Get channels the bot is a member of
	params := &slack.GetConversationsForUserParameters{
		Types: []string{"public_channel", "private_channel"},
		Limit: 200,
	}
	channels, _, err := a.client.GetConversationsForUser(params)
	if err != nil {
		return fmt.Errorf("slack list channels: %w", err)
	}

	for _, ch := range channels {
		if _, _, err := a.client.PostMessage(ch.ID, opts...); err != nil {
			a.logger.Warn("slack broadcast to channel failed",
				zap.String("channel", ch.ID), zap.Error(err))
		}
	}
	return nil
}

// Close is a no-op; the socket context cancellation handles shutdown.
func (a *SlackAdapter) Close() error {
	return nil
}
