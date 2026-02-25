package world

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ActivityType categorizes what a resident is doing.
type ActivityType string

const (
	ActivityWork   ActivityType = "work"
	ActivityReview ActivityType = "review"
	ActivitySocial ActivityType = "social"
	ActivityRest   ActivityType = "rest"
	ActivityLearn  ActivityType = "learn"
)

// ScheduleEntry is a single scheduled activity for a resident.
type ScheduleEntry struct {
	ID        string        `json:"id"`
	Type      ActivityType  `json:"type"`
	Title     string        `json:"title"`
	StartTime time.Time     `json:"start_time"`
	Duration  time.Duration `json:"duration"`
	Recurring string        `json:"recurring,omitempty"` // cron expression
	Status    string        `json:"status"`              // pending|active|done
}

// Schedule holds all entries for a single agent.
type Schedule struct {
	AgentID string          `json:"agent_id"`
	Entries []ScheduleEntry `json:"entries"`
}

// ScheduleManager manages schedules for all residents.
type ScheduleManager struct {
	schedules map[string]*Schedule // agentID -> schedule
	mu        sync.RWMutex
	logger    *zap.Logger
}

// NewScheduleManager creates a schedule manager.
func NewScheduleManager(logger *zap.Logger) *ScheduleManager {
	return &ScheduleManager{
		schedules: make(map[string]*Schedule),
		logger:    logger,
	}
}

// AddEntry adds a schedule entry for an agent.
func (m *ScheduleManager) AddEntry(agentID string, entry ScheduleEntry) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if entry.ID == "" {
		entry.ID = uuid.New().String()
	}
	if entry.Status == "" {
		entry.Status = "pending"
	}

	sched, ok := m.schedules[agentID]
	if !ok {
		sched = &Schedule{AgentID: agentID}
		m.schedules[agentID] = sched
	}
	sched.Entries = append(sched.Entries, entry)
	return entry.ID
}

// GetSchedule returns the schedule for an agent.
func (m *ScheduleManager) GetSchedule(agentID string) *Schedule {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if s, ok := m.schedules[agentID]; ok {
		return s
	}
	return &Schedule{AgentID: agentID}
}

// ActiveEntry returns the currently active entry for an agent, if any.
func (m *ScheduleManager) ActiveEntry(agentID string) *ScheduleEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	sched, ok := m.schedules[agentID]
	if !ok {
		return nil
	}
	for i := range sched.Entries {
		if sched.Entries[i].Status == "active" {
			return &sched.Entries[i]
		}
	}
	return nil
}

// OnTick implements ClockListener. Transitions entries between pending/active/done.
func (m *ScheduleManager) OnTick(worldTime time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for agentID, sched := range m.schedules {
		for i := range sched.Entries {
			e := &sched.Entries[i]
			end := e.StartTime.Add(e.Duration)

			switch e.Status {
			case "pending":
				if !worldTime.Before(e.StartTime) && worldTime.Before(end) {
					e.Status = "active"
					m.logger.Debug("schedule entry activated",
						zap.String("agent", agentID),
						zap.String("title", e.Title))
				}
			case "active":
				if !worldTime.Before(end) {
					e.Status = "done"
					m.logger.Debug("schedule entry completed",
						zap.String("agent", agentID),
						zap.String("title", e.Title))
				}
			}
		}
	}
}
