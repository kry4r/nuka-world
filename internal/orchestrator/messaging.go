package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// MessageBus handles inter-agent communication via Redis Streams.
type MessageBus struct {
	rdb    *redis.Client
	logger *zap.Logger
}

// NewMessageBus creates a Redis-backed message bus.
func NewMessageBus(redisURL string, logger *zap.Logger) (*MessageBus, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &MessageBus{rdb: rdb, logger: logger}, nil
}

// AgentMessage is a message passed between agents.
type AgentMessage struct {
	ID        string    `json:"id"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Type      string    `json:"type"` // "task", "result", "status", "broadcast"
	Payload   string    `json:"payload"`
	Timestamp time.Time `json:"timestamp"`
}

const streamPrefix = "nuka:agent:"

// Publish sends a message to an agent's stream.
func (mb *MessageBus) Publish(ctx context.Context, msg *AgentMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	stream := streamPrefix + msg.To
	_, err = mb.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]interface{}{
			"data": string(data),
		},
	}).Result()

	if err != nil {
		return fmt.Errorf("publish to %s: %w", stream, err)
	}

	mb.logger.Debug("published message",
		zap.String("from", msg.From),
		zap.String("to", msg.To),
		zap.String("type", msg.Type))
	return nil
}

// Subscribe listens for messages on an agent's stream.
// Returns a channel that emits messages. Cancel the context to stop.
func (mb *MessageBus) Subscribe(ctx context.Context, agentID string) <-chan *AgentMessage {
	ch := make(chan *AgentMessage, 16)
	stream := streamPrefix + agentID

	go func() {
		defer close(ch)
		lastID := "$"

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			results, err := mb.rdb.XRead(ctx, &redis.XReadArgs{
				Streams: []string{stream, lastID},
				Count:   10,
				Block:   time.Second * 2,
			}).Result()

			if err != nil {
				if err == context.Canceled || err == context.DeadlineExceeded {
					return
				}
				continue
			}

			for _, r := range results {
				for _, msg := range r.Messages {
					lastID = msg.ID
					data, ok := msg.Values["data"].(string)
					if !ok {
						continue
					}
					var am AgentMessage
					if json.Unmarshal([]byte(data), &am) == nil {
						ch <- &am
					}
				}
			}
		}
	}()

	return ch
}

// Close shuts down the Redis connection.
func (mb *MessageBus) Close() error {
	return mb.rdb.Close()
}
