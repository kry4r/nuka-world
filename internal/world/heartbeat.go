package world

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

// HeartbeatFunc is called when an agent's heartbeat fires.
type HeartbeatFunc func(ctx context.Context, agentID string) error

// ListAgentIDsFunc returns all registered agent IDs.
type ListAgentIDsFunc func() []string

// DrainSchedulesFunc returns pending schedule requests from the engine.
type DrainSchedulesFunc func() []PendingSchedule

// PendingSchedule is a schedule entry created by a tool call.
type PendingSchedule struct {
	AgentID   string
	Title     string
	Type      string
	StartTime time.Time
	Duration  time.Duration
	Recurring string
}

// Heartbeat is a ClockListener that triggers autonomous agent actions
// and drains pending schedules from the engine into the ScheduleManager.
type Heartbeat struct {
	interval    time.Duration // how often (in world-time) to fire
	lastBeat    time.Time
	agentIDs    []string
	beatFn      HeartbeatFunc
	listFn      ListAgentIDsFunc
	drainFn     DrainSchedulesFunc
	scheduleMgr *ScheduleManager
	mu          sync.Mutex
	logger      *zap.Logger
}

// NewHeartbeat creates a heartbeat listener.
func NewHeartbeat(
	interval time.Duration,
	beatFn HeartbeatFunc,
	listFn ListAgentIDsFunc,
	drainFn DrainSchedulesFunc,
	scheduleMgr *ScheduleManager,
	logger *zap.Logger,
) *Heartbeat {
	return &Heartbeat{
		interval:    interval,
		beatFn:      beatFn,
		listFn:      listFn,
		drainFn:     drainFn,
		scheduleMgr: scheduleMgr,
		logger:      logger,
	}
}

// SetAgents updates the list of agents that receive heartbeats.
func (h *Heartbeat) SetAgents(ids []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.agentIDs = ids
}

// FireNow forces an immediate heartbeat for all agents, bypassing the interval check.
func (h *Heartbeat) FireNow() int {
	h.drainPendingSchedules()

	h.mu.Lock()
	agents := make([]string, len(h.agentIDs))
	copy(agents, h.agentIDs)
	h.mu.Unlock()

	if len(agents) == 0 && h.listFn != nil {
		agents = h.listFn()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fired := 0
	for _, id := range agents {
		if err := h.beatFn(ctx, id); err != nil {
			h.logger.Warn("forced heartbeat failed",
				zap.String("agent", id),
				zap.Error(err))
		} else {
			fired++
			h.logger.Info("forced heartbeat fired",
				zap.String("agent", id))
		}
	}
	return fired
}

// OnTick implements ClockListener.
func (h *Heartbeat) OnTick(worldTime time.Time) {
	// Drain pending schedules from engine into ScheduleManager
	h.drainPendingSchedules()

	// Check if it's time for a heartbeat
	h.mu.Lock()
	if h.lastBeat.IsZero() {
		h.lastBeat = worldTime
		h.mu.Unlock()
		return
	}
	elapsed := worldTime.Sub(h.lastBeat)
	if elapsed < h.interval {
		h.mu.Unlock()
		return
	}
	h.lastBeat = worldTime
	agents := make([]string, len(h.agentIDs))
	copy(agents, h.agentIDs)
	h.mu.Unlock()

	// Auto-discover agents from engine if no static list
	if len(agents) == 0 && h.listFn != nil {
		agents = h.listFn()
	}

	// Fire heartbeat for each agent
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for _, id := range agents {
		if err := h.beatFn(ctx, id); err != nil {
			h.logger.Warn("heartbeat failed",
				zap.String("agent", id),
				zap.Error(err))
		} else {
			h.logger.Debug("heartbeat fired",
				zap.String("agent", id),
				zap.Time("world_time", worldTime))
		}
	}
}

func (h *Heartbeat) drainPendingSchedules() {
	if h.drainFn == nil || h.scheduleMgr == nil {
		return
	}
	pending := h.drainFn()
	for _, p := range pending {
		entry := ScheduleEntry{
			Type:      ActivityType(p.Type),
			Title:     p.Title,
			StartTime: p.StartTime,
			Duration:  p.Duration,
			Recurring: p.Recurring,
		}
		id := h.scheduleMgr.AddEntry(p.AgentID, entry)
		h.logger.Info("drained schedule into manager",
			zap.String("agent", p.AgentID),
			zap.String("entry_id", id),
			zap.String("title", p.Title))
	}
}
