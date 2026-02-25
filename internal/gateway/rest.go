package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RESTAdapter implements GatewayAdapter for HTTP-based message ingestion.
type RESTAdapter struct {
	handler  MessageHandler
	channels map[string]chan *OutboundMessage // channelID -> pending responses
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewRESTAdapter creates a REST gateway adapter.
func NewRESTAdapter(logger *zap.Logger) *RESTAdapter {
	return &RESTAdapter{
		channels: make(map[string]chan *OutboundMessage),
		logger:   logger,
	}
}

func (a *RESTAdapter) Platform() string { return "rest" }

func (a *RESTAdapter) Connect(_ context.Context) error { return nil }

func (a *RESTAdapter) OnMessage(h MessageHandler) { a.handler = h }

func (a *RESTAdapter) Close() error { return nil }

// Send delivers a message to a waiting REST channel.
func (a *RESTAdapter) Send(_ context.Context, msg *OutboundMessage) error {
	a.mu.RLock()
	ch, ok := a.channels[msg.ChannelID]
	a.mu.RUnlock()
	if !ok {
		return fmt.Errorf("no active channel: %s", msg.ChannelID)
	}
	select {
	case ch <- msg:
		return nil
	default:
		return fmt.Errorf("channel %s buffer full", msg.ChannelID)
	}
}

// Routes returns a chi router with REST gateway endpoints.
func (a *RESTAdapter) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/message", a.handleMessage)
	return r
}

// handleMessage accepts an inbound message via HTTP and waits for the response.
func (a *RESTAdapter) handleMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"user_id"`
		UserName string `json:"user_name"`
		Content  string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Content == "" {
		http.Error(w, `{"error":"content is required"}`, http.StatusBadRequest)
		return
	}

	channelID := uuid.New().String()
	ch := make(chan *OutboundMessage, 1)

	a.mu.Lock()
	a.channels[channelID] = ch
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		delete(a.channels, channelID)
		a.mu.Unlock()
	}()

	// Dispatch inbound message to handler
	if a.handler != nil {
		a.handler(&InboundMessage{
			Platform:  "rest",
			ChannelID: channelID,
			UserID:    req.UserID,
			UserName:  req.UserName,
			Content:   req.Content,
			Timestamp: time.Now(),
		})
	}

	// Wait for response with timeout
	select {
	case msg := <-ch:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(msg)
	case <-time.After(60 * time.Second):
		http.Error(w, `{"error":"response timeout"}`, http.StatusGatewayTimeout)
	case <-r.Context().Done():
		return
	}
}

// Broadcast sends to all active REST channels.
func (a *RESTAdapter) Broadcast(_ context.Context, msg *BroadcastMessage) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, ch := range a.channels {
		select {
		case ch <- &OutboundMessage{
			Platform: "rest",
			Content:  fmt.Sprintf("[%s] %s\n%s", msg.Type, msg.Title, msg.Content),
		}:
		default:
		}
	}
	return nil
}
