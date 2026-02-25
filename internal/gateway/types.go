package gateway

import (
	"context"
	"time"
)

// GatewayAdapter defines the interface for platform adapters.
type GatewayAdapter interface {
	Platform() string
	Connect(ctx context.Context) error
	Send(ctx context.Context, msg *OutboundMessage) error
	OnMessage(handler MessageHandler)
	Broadcast(ctx context.Context, msg *BroadcastMessage) error
	Close() error
}

// MessageHandler processes inbound messages from any platform.
type MessageHandler func(msg *InboundMessage)

// InboundMessage is a normalized message from any platform.
type InboundMessage struct {
	Platform  string    `json:"platform"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	ReplyTo   string    `json:"reply_to,omitempty"`
}

// OutboundMessage is a message sent to a specific platform channel.
type OutboundMessage struct {
	Platform  string `json:"platform"`
	ChannelID string `json:"channel_id"`
	AgentID   string `json:"agent_id,omitempty"`
	Content   string `json:"content"`
	ReplyTo   string `json:"reply_to,omitempty"`
}

// BroadcastType categorizes broadcast messages.
type BroadcastType string

const (
	BroadcastAnnouncement BroadcastType = "announcement"
	BroadcastTaskComplete BroadcastType = "task_complete"
	BroadcastWorldEvent   BroadcastType = "world_event"
	BroadcastDailyDigest  BroadcastType = "daily_digest"
)

// BroadcastMessage is sent to multiple platforms simultaneously.
type BroadcastMessage struct {
	Type      BroadcastType `json:"type"`
	Title     string        `json:"title"`
	Content   string        `json:"content"`
	AgentID   string        `json:"agent_id"`
	Priority  int           `json:"priority"`
	Platforms []string      `json:"platforms,omitempty"`
}
