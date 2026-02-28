package provider

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"
)

// Router manages multiple LLM providers and routes requests.
type Router struct {
	providers map[string]Provider
	bindings  map[string]string   // agentID -> providerID
	fallbacks map[string][]string // agentID -> fallback provider chain
	defaults  string              // default provider ID
	mu        sync.RWMutex
	logger    *zap.Logger
}

// NewRouter creates a new provider router.
func NewRouter(logger *zap.Logger) *Router {
	return &Router{
		providers: make(map[string]Provider),
		bindings:  make(map[string]string),
		fallbacks: make(map[string][]string),
		logger:    logger,
	}
}

// Register adds a provider to the router.
func (r *Router) Register(p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.ID()] = p
	if r.defaults == "" {
		r.defaults = p.ID()
	}
	r.logger.Info("registered provider", zap.String("id", p.ID()), zap.String("name", p.Name()))
}

// SetDefault sets the default provider.
func (r *Router) SetDefault(providerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.defaults = providerID
}

// DefaultID returns the current default provider ID.
func (r *Router) DefaultID() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.defaults
}

// Bind associates an agent with a specific provider.
func (r *Router) Bind(agentID, providerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bindings[agentID] = providerID
}

// SetFallbacks configures fallback providers for an agent.
func (r *Router) SetFallbacks(agentID string, providerIDs []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.fallbacks[agentID] = providerIDs
}

// Route sends a chat request through the appropriate provider.
func (r *Router) Route(ctx context.Context, agentID string, req *ChatRequest) (*ChatResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	primary := r.getProvider(agentID)
	if primary == nil {
		return nil, fmt.Errorf("no provider available for agent %s", agentID)
	}

	resp, err := primary.Chat(ctx, req)
	if err == nil {
		return resp, nil
	}
	r.logger.Warn("primary provider failed, trying fallbacks",
		zap.String("agent", agentID), zap.Error(err))

	for _, fbID := range r.fallbacks[agentID] {
		fb, ok := r.providers[fbID]
		if !ok {
			continue
		}
		resp, err = fb.Chat(ctx, req)
		if err == nil {
			return resp, nil
		}
		r.logger.Warn("fallback provider failed", zap.String("provider", fbID), zap.Error(err))
	}

	return nil, fmt.Errorf("all providers failed for agent %s: %w", agentID, err)
}

// RouteStream sends a streaming chat request.
func (r *Router) RouteStream(ctx context.Context, agentID string, req *ChatRequest) (<-chan *StreamChunk, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	primary := r.getProvider(agentID)
	if primary == nil {
		return nil, fmt.Errorf("no provider available for agent %s", agentID)
	}
	return primary.ChatStream(ctx, req)
}

func (r *Router) getProvider(agentID string) Provider {
	if pid, ok := r.bindings[agentID]; ok {
		if p, ok := r.providers[pid]; ok {
			return p
		}
	}
	if p, ok := r.providers[r.defaults]; ok {
		return p
	}
	return nil
}

// GetProvider returns a provider by ID.
func (r *Router) GetProvider(id string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[id]
	return p, ok
}

// ListProviders returns all registered providers.
func (r *Router) ListProviders() []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		result = append(result, p)
	}
	return result
}
