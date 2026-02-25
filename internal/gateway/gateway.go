package gateway

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"
)

// Gateway manages all platform adapters and routes messages.
type Gateway struct {
	adapters map[string]GatewayAdapter
	handler  MessageHandler
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewGateway creates a gateway manager.
func NewGateway(logger *zap.Logger) *Gateway {
	return &Gateway{
		adapters: make(map[string]GatewayAdapter),
		logger:   logger,
	}
}

// SetHandler sets the callback for all inbound messages.
func (g *Gateway) SetHandler(h MessageHandler) {
	g.handler = h
}

// Register adds an adapter and wires its message handler.
func (g *Gateway) Register(adapter GatewayAdapter) {
	g.mu.Lock()
	defer g.mu.Unlock()

	platform := adapter.Platform()
	g.adapters[platform] = adapter
	adapter.OnMessage(func(msg *InboundMessage) {
		if g.handler != nil {
			g.handler(msg)
		}
	})
	g.logger.Info("registered gateway adapter", zap.String("platform", platform))
}

// ConnectAll starts all registered adapters.
func (g *Gateway) ConnectAll(ctx context.Context) error {
	g.mu.RLock()
	defer g.mu.RUnlock()

	for platform, adapter := range g.adapters {
		if err := adapter.Connect(ctx); err != nil {
			g.logger.Error("adapter connect failed",
				zap.String("platform", platform), zap.Error(err))
			return fmt.Errorf("connect %s: %w", platform, err)
		}
		g.logger.Info("adapter connected", zap.String("platform", platform))
	}
	return nil
}

// Send sends a message to a specific platform channel.
func (g *Gateway) Send(ctx context.Context, msg *OutboundMessage) error {
	g.mu.RLock()
	adapter, ok := g.adapters[msg.Platform]
	g.mu.RUnlock()

	if !ok {
		return fmt.Errorf("no adapter for platform: %s", msg.Platform)
	}
	return adapter.Send(ctx, msg)
}

// Broadcast sends a message to all matching platform adapters.
func (g *Gateway) Broadcast(ctx context.Context, msg *BroadcastMessage) error {
	g.mu.RLock()
	defer g.mu.RUnlock()

	targets := g.adapters
	if len(msg.Platforms) > 0 {
		targets = make(map[string]GatewayAdapter)
		for _, p := range msg.Platforms {
			if a, ok := g.adapters[p]; ok {
				targets[p] = a
			}
		}
	}

	var errs []error
	for platform, adapter := range targets {
		if err := adapter.Broadcast(ctx, msg); err != nil {
			g.logger.Error("broadcast failed",
				zap.String("platform", platform), zap.Error(err))
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("broadcast failed on %d platform(s)", len(errs))
	}
	return nil
}

// Close shuts down all adapters.
func (g *Gateway) Close() error {
	g.mu.RLock()
	defer g.mu.RUnlock()

	for platform, adapter := range g.adapters {
		if err := adapter.Close(); err != nil {
			g.logger.Error("adapter close failed",
				zap.String("platform", platform), zap.Error(err))
		}
	}
	return nil
}

// Adapters returns the list of registered platform names.
func (g *Gateway) Adapters() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	names := make([]string, 0, len(g.adapters))
	for p := range g.adapters {
		names = append(names, p)
	}
	return names
}
