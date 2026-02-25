package agent

import (
	"time"
)

// Persona defines an agent's identity and personality.
type Persona struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Role         string             `json:"role"`
	Personality  string             `json:"personality"`
	Sprite       SpriteConfig       `json:"sprite"`
	Skills       []string           `json:"skills"`
	Traits       map[string]float64 `json:"traits"`
	Backstory    string             `json:"backstory"`
	SystemPrompt string             `json:"system_prompt"`
}

// SpriteConfig holds pixel-art avatar configuration.
type SpriteConfig struct {
	BaseSprite string `json:"base_sprite"`
	IdleAnim   string `json:"idle_anim"`
	WorkAnim   string `json:"work_anim"`
	ThinkAnim  string `json:"think_anim"`
	Palette    string `json:"palette"`
}

// Status represents an agent's current state.
type Status string

const (
	StatusIdle     Status = "idle"
	StatusThinking Status = "thinking"
	StatusWorking  Status = "working"
	StatusResting  Status = "resting"
)

// Agent is a resident of Nuka World.
type Agent struct {
	Persona    Persona   `json:"persona"`
	Status     Status    `json:"status"`
	ProviderID string    `json:"provider_id"`
	Model      string    `json:"model"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
