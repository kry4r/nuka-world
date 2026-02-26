package gateway

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"go.uber.org/zap"
)

// DiscordAdapter implements GatewayAdapter for Discord using the bot gateway.
type DiscordAdapter struct {
	token    string
	session  *discordgo.Session
	handler  MessageHandler
	personas map[string]*AgentPersona // agentID -> persona
	webhooks map[string]string        // channelID -> webhook URL for persona messages
	connected   bool
	connectedAt time.Time
	lastError   string
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewDiscordAdapter creates a Discord gateway adapter.
func NewDiscordAdapter(token string, logger *zap.Logger) *DiscordAdapter {
	return &DiscordAdapter{
		token:    token,
		personas: make(map[string]*AgentPersona),
		webhooks: make(map[string]string),
		logger:   logger,
	}
}

func (a *DiscordAdapter) Platform() string { return "discord" }

func (a *DiscordAdapter) OnMessage(h MessageHandler) { a.handler = h }

// SetPersona registers an agent's display persona for Discord messages.
func (a *DiscordAdapter) SetPersona(agentID string, persona *AgentPersona) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.personas[agentID] = persona
}

// SetWebhook registers a webhook URL for a channel to enable persona messages.
func (a *DiscordAdapter) SetWebhook(channelID, webhookURL string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.webhooks[channelID] = webhookURL
}

// Connect opens the Discord gateway websocket and verifies guild membership.
func (a *DiscordAdapter) Connect(_ context.Context) error {
	session, err := discordgo.New("Bot " + a.token)
	if err != nil {
		a.mu.Lock()
		a.lastError = fmt.Sprintf("session create: %v", err)
		a.mu.Unlock()
		return fmt.Errorf("discord session: %w", err)
	}
	a.session = session

	a.session.Identify.Intents = discordgo.IntentsGuildMessages | discordgo.IntentsDirectMessages
	a.session.AddHandler(a.onMessageCreate)

	if err := a.session.Open(); err != nil {
		a.mu.Lock()
		a.lastError = fmt.Sprintf("open failed: %v", err)
		a.connected = false
		a.mu.Unlock()
		return fmt.Errorf("discord open: %w", err)
	}

	now := time.Now()
	a.mu.Lock()
	a.connected = true
	a.connectedAt = now
	a.lastError = ""
	a.mu.Unlock()

	// Log guild count
	guildCount := len(a.session.State.Guilds)
	if guildCount == 0 {
		a.logger.Warn("discord bot not added to any server — invite it first")
	}

	a.logger.Info("discord adapter connected",
		zap.String("user", a.session.State.User.Username),
		zap.Int("guilds", guildCount))
	return nil
}

// onMessageCreate handles incoming Discord messages.
func (a *DiscordAdapter) onMessageCreate(s *discordgo.Session, m *discordgo.MessageCreate) {
	// Ignore messages from the bot itself
	if m.Author.ID == s.State.User.ID {
		return
	}
	if a.handler == nil {
		return
	}

	a.handler(&InboundMessage{
		Platform:  "discord",
		ChannelID: m.ChannelID,
		UserID:    m.Author.ID,
		UserName:  m.Author.Username,
		Content:   m.Content,
		Timestamp: m.Timestamp,
		ReplyTo:   m.ChannelID,
	})
}

// Send posts a message to a Discord channel.
// If a webhook is configured for the channel and an agent persona exists,
// it uses the webhook to display the agent's name and avatar.
func (a *DiscordAdapter) Send(_ context.Context, msg *OutboundMessage) error {
	a.mu.RLock()
	webhookURL := a.webhooks[msg.ChannelID]
	persona, hasPersona := a.personas[msg.AgentID]
	a.mu.RUnlock()

	// Use webhook for persona-styled messages
	if webhookURL != "" && hasPersona {
		return a.sendViaWebhook(webhookURL, persona, msg.Content)
	}

	// Fallback: plain bot message with persona name prefix
	content := msg.Content
	if hasPersona {
		content = fmt.Sprintf("**[%s]** %s", persona.Name, msg.Content)
	}
	_, err := a.session.ChannelMessageSend(msg.ChannelID, content)
	if err != nil {
		return fmt.Errorf("discord send: %w", err)
	}
	return nil
}

// sendViaWebhook posts a message using a Discord webhook with custom name/avatar.
func (a *DiscordAdapter) sendViaWebhook(webhookURL string, persona *AgentPersona, content string) error {
	webhook, err := a.session.WebhookWithToken(webhookURL, "")
	if err != nil {
		return fmt.Errorf("discord webhook: %w", err)
	}

	params := &discordgo.WebhookParams{
		Content:  content,
		Username: persona.Name,
	}
	if persona.IconURL != "" {
		params.AvatarURL = persona.IconURL
	}

	_, err = a.session.WebhookExecute(webhook.ID, webhook.Token, false, params)
	if err != nil {
		return fmt.Errorf("discord webhook execute: %w", err)
	}
	return nil
}

// Broadcast sends a broadcast message to all guilds the bot is in.
func (a *DiscordAdapter) Broadcast(_ context.Context, msg *BroadcastMessage) error {
	content := fmt.Sprintf("**[%s] %s**\n%s", msg.Type, msg.Title, msg.Content)

	for _, guild := range a.session.State.Guilds {
		channels, err := a.session.GuildChannels(guild.ID)
		if err != nil {
			a.logger.Warn("discord list channels failed",
				zap.String("guild", guild.ID), zap.Error(err))
			continue
		}
		// Send to the first text channel we can write to
		for _, ch := range channels {
			if ch.Type == discordgo.ChannelTypeGuildText {
				if _, err := a.session.ChannelMessageSend(ch.ID, content); err == nil {
					break
				}
			}
		}
	}
	return nil
}

// Close shuts down the Discord session.
func (a *DiscordAdapter) Close() error {
	if a.session != nil {
		return a.session.Close()
	}
	return nil
}

func (a *DiscordAdapter) Status() AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s := AdapterStatus{
		Platform:  "discord",
		Connected: a.connected,
		Error:     a.lastError,
	}
	if a.connected {
		t := a.connectedAt
		s.ConnectedAt = &t
		guildCount := 0
		if a.session != nil && a.session.State != nil {
			guildCount = len(a.session.State.Guilds)
		}
		s.Details = fmt.Sprintf("bot=%s, guilds=%d",
			a.session.State.User.Username, guildCount)
	}
	return s
}
