package gateway

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

// BroadcastRecord tracks a sent broadcast for history.
type BroadcastRecord struct {
	Message *BroadcastMessage `json:"message"`
	SentAt  time.Time         `json:"sent_at"`
	Targets []string          `json:"targets"`
}

// Broadcaster provides world-level broadcast capabilities through the Gateway.
type Broadcaster struct {
	gateway *Gateway
	history []BroadcastRecord
	logger  *zap.Logger
}

// NewBroadcaster creates a broadcaster backed by the given gateway.
func NewBroadcaster(gw *Gateway, logger *zap.Logger) *Broadcaster {
	return &Broadcaster{
		gateway: gw,
		logger:  logger,
	}
}

// Send broadcasts a message to all or selected platforms via the gateway.
func (b *Broadcaster) Send(ctx context.Context, msg *BroadcastMessage) error {
	if msg.Type == "" {
		return fmt.Errorf("broadcast type is required")
	}

	b.logger.Info("sending world broadcast",
		zap.String("type", string(msg.Type)),
		zap.String("title", msg.Title),
		zap.String("agent", msg.AgentID),
		zap.Int("priority", msg.Priority),
	)

	err := b.gateway.Broadcast(ctx, msg)
	if err != nil {
		return err
	}

	targets := msg.Platforms
	if len(targets) == 0 {
		targets = b.gateway.Adapters()
	}

	b.history = append(b.history, BroadcastRecord{
		Message: msg,
		SentAt:  time.Now(),
		Targets: targets,
	})

	return nil
}

// History returns recent broadcast records.
func (b *Broadcaster) History(limit int) []BroadcastRecord {
	if limit <= 0 || limit > len(b.history) {
		limit = len(b.history)
	}
	start := len(b.history) - limit
	return b.history[start:]
}
