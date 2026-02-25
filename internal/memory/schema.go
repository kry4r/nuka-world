package memory

import (
	"time"
)

// Schema represents a cognitive schema node.
type Schema struct {
	ID              string    `json:"id"`
	AgentID         string    `json:"agent_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	ActivationLevel float64   `json:"activation_level"`
	Strength        float64   `json:"strength"`
	CreatedAt       time.Time `json:"created_at"`
	LastActivated   time.Time `json:"last_activated"`
}

// Memory represents a concrete memory event.
type Memory struct {
	ID          string    `json:"id"`
	AgentID     string    `json:"agent_id"`
	Content     string    `json:"content"`
	Importance  float64   `json:"importance"`
	AccessCount int       `json:"access_count"`
	CreatedAt   time.Time `json:"created_at"`
}
