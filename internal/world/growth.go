package world

import (
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Milestone records a growth achievement for an agent.
type Milestone struct {
	Title      string    `json:"title"`
	Desc       string    `json:"description"`
	AchievedAt time.Time `json:"achieved_at"`
}

// GrowthProfile tracks an agent's growth metrics.
type GrowthProfile struct {
	AgentID      string             `json:"agent_id"`
	Level        int                `json:"level"`
	Experience   int                `json:"experience"`
	SchemaCount  int                `json:"schema_count"`
	MemoryCount  int                `json:"memory_count"`
	SkillScores  map[string]float64 `json:"skill_scores"`
	Milestones   []Milestone        `json:"milestones"`
}

// experiencePerLevel defines XP needed to reach the next level.
const experiencePerLevel = 100

// GrowthTracker manages growth profiles for all agents.
type GrowthTracker struct {
	profiles map[string]*GrowthProfile // agentID -> profile
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewGrowthTracker creates a growth tracker.
func NewGrowthTracker(logger *zap.Logger) *GrowthTracker {
	return &GrowthTracker{
		profiles: make(map[string]*GrowthProfile),
		logger:   logger,
	}
}

// GetProfile returns the growth profile for an agent, creating one if needed.
func (t *GrowthTracker) GetProfile(agentID string) *GrowthProfile {
	t.mu.Lock()
	defer t.mu.Unlock()

	p, ok := t.profiles[agentID]
	if !ok {
		p = &GrowthProfile{
			AgentID:     agentID,
			Level:       1,
			SkillScores: make(map[string]float64),
		}
		t.profiles[agentID] = p
	}
	return p
}

// AddExperience grants XP and handles level-ups.
func (t *GrowthTracker) AddExperience(agentID string, xp int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	p := t.getOrCreate(agentID)
	p.Experience += xp

	for p.Experience >= experiencePerLevel*p.Level {
		p.Experience -= experiencePerLevel * p.Level
		p.Level++
		p.Milestones = append(p.Milestones, Milestone{
			Title:      "Level Up",
			Desc:       "Reached level " + itoa(p.Level),
			AchievedAt: time.Now(),
		})
		t.logger.Info("agent leveled up",
			zap.String("agent", agentID),
			zap.Int("level", p.Level))
	}
}

// AddSkillScore increases a skill's proficiency (capped at 1.0).
func (t *GrowthTracker) AddSkillScore(agentID, skill string, delta float64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	p := t.getOrCreate(agentID)
	score := p.SkillScores[skill] + delta
	if score > 1.0 {
		score = 1.0
	}
	p.SkillScores[skill] = score
}

// AddMilestone records a custom milestone for an agent.
func (t *GrowthTracker) AddMilestone(agentID, title, desc string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	p := t.getOrCreate(agentID)
	p.Milestones = append(p.Milestones, Milestone{
		Title:      title,
		Desc:       desc,
		AchievedAt: time.Now(),
	})
}

// UpdateCounts refreshes schema and memory counts for an agent.
func (t *GrowthTracker) UpdateCounts(agentID string, schemas, memories int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	p := t.getOrCreate(agentID)
	p.SchemaCount = schemas
	p.MemoryCount = memories
}

// getOrCreate returns or initializes a profile (caller must hold lock).
func (t *GrowthTracker) getOrCreate(agentID string) *GrowthProfile {
	p, ok := t.profiles[agentID]
	if !ok {
		p = &GrowthProfile{
			AgentID:     agentID,
			Level:       1,
			SkillScores: make(map[string]float64),
		}
		t.profiles[agentID] = p
	}
	return p
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
