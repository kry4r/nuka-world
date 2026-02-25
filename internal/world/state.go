package world

import (
	"sync"
	"time"

	"go.uber.org/zap"
)

// AgentState represents the current activity state of a resident.
type AgentState string

const (
	StateIdle        AgentState = "idle"
	StateWorking     AgentState = "working"
	StateResting     AgentState = "resting"
	StateSocializing AgentState = "socializing"
	StateLearning    AgentState = "learning"
	StateReviewing   AgentState = "reviewing"
)

// activityToState maps schedule activity types to agent states.
var activityToState = map[ActivityType]AgentState{
	ActivityWork:   StateWorking,
	ActivityReview: StateReviewing,
	ActivitySocial: StateSocializing,
	ActivityRest:   StateResting,
	ActivityLearn:  StateLearning,
}

// StateManager tracks and transitions agent states based on schedules.
type StateManager struct {
	states   map[string]AgentState // agentID -> current state
	schedule *ScheduleManager
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewStateManager creates a state manager linked to a schedule manager.
func NewStateManager(schedule *ScheduleManager, logger *zap.Logger) *StateManager {
	return &StateManager{
		states:   make(map[string]AgentState),
		schedule: schedule,
		logger:   logger,
	}
}

// GetState returns the current state of an agent.
func (m *StateManager) GetState(agentID string) AgentState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if s, ok := m.states[agentID]; ok {
		return s
	}
	return StateIdle
}

// SetState manually overrides an agent's state.
func (m *StateManager) SetState(agentID string, state AgentState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.states[agentID] = state
}

// OnTick implements ClockListener. Derives agent states from active schedule entries.
func (m *StateManager) OnTick(worldTime time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Collect all agent IDs from both states and schedules.
	agentIDs := make(map[string]struct{})
	for id := range m.states {
		agentIDs[id] = struct{}{}
	}
	m.schedule.mu.RLock()
	for id := range m.schedule.schedules {
		agentIDs[id] = struct{}{}
	}
	m.schedule.mu.RUnlock()

	for agentID := range agentIDs {
		entry := m.schedule.ActiveEntry(agentID)
		prev := m.states[agentID]
		var next AgentState

		if entry != nil {
			if s, ok := activityToState[entry.Type]; ok {
				next = s
			} else {
				next = StateWorking
			}
		} else {
			next = StateIdle
		}

		if next != prev {
			m.states[agentID] = next
			m.logger.Debug("agent state changed",
				zap.String("agent", agentID),
				zap.String("from", string(prev)),
				zap.String("to", string(next)))
		}
	}
}
