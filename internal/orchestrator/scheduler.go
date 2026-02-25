package orchestrator

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nidhogg/nuka-world/internal/agent"
	"go.uber.org/zap"
)

// Scheduler manages parallel agent task execution.
type Scheduler struct {
	engine  *agent.Engine
	bus     *MessageBus
	mu      sync.RWMutex
	running map[string]*Task
	pool    chan struct{} // semaphore-based pool
	logger  *zap.Logger
}

// NewScheduler creates a scheduler with a bounded goroutine pool.
func NewScheduler(engine *agent.Engine, bus *MessageBus, poolSize int, logger *zap.Logger) *Scheduler {
	if poolSize <= 0 {
		poolSize = 10
	}
	return &Scheduler{
		engine:  engine,
		bus:     bus,
		running: make(map[string]*Task),
		pool:    make(chan struct{}, poolSize),
		logger:  logger,
	}
}

// Dispatch executes tasks in parallel, returning results via channel.
func (s *Scheduler) Dispatch(ctx context.Context, team *Team, tasks []*Task) <-chan *TaskResult {
	results := make(chan *TaskResult, len(tasks))
	var wg sync.WaitGroup

	for _, t := range tasks {
		t.ID = uuid.New().String()
		t.Status = TaskPending
		t.CreatedAt = time.Now()

		matched := s.matchAgent(team, t)
		if matched == "" {
			results <- &TaskResult{
				TaskID: t.ID,
				Status: TaskFailed,
				Error:  fmt.Sprintf("no agent matched for role: %s", t.StepID),
			}
			continue
		}
		t.AgentID = matched

		wg.Add(1)
		go func(task *Task) {
			defer wg.Done()
			s.pool <- struct{}{}        // acquire slot
			defer func() { <-s.pool }() // release slot

			results <- s.executeTask(ctx, task)
		}(t)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	return results
}

// executeTask runs a single task against an agent.
func (s *Scheduler) executeTask(ctx context.Context, task *Task) *TaskResult {
	start := time.Now()
	now := start
	task.StartedAt = &now
	task.Status = TaskRunning

	s.mu.Lock()
	s.running[task.ID] = task
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.running, task.ID)
		s.mu.Unlock()
	}()

	s.logger.Info("executing task",
		zap.String("task", task.ID),
		zap.String("agent", task.AgentID))

	result, err := s.engine.Execute(ctx, task.AgentID, task.Input)
	if err != nil {
		task.Status = TaskFailed
		return &TaskResult{
			TaskID:   task.ID,
			AgentID:  task.AgentID,
			Status:   TaskFailed,
			Error:    err.Error(),
			Duration: time.Since(start),
		}
	}

	done := time.Now()
	task.CompletedAt = &done
	task.Status = TaskDone

	return &TaskResult{
		TaskID:   task.ID,
		AgentID:  task.AgentID,
		Output:   result.Content,
		Status:   TaskDone,
		Duration: time.Since(start),
	}
}

// matchAgent finds the best agent in a team for a task by role.
func (s *Scheduler) matchAgent(team *Team, task *Task) string {
	var best string
	bestPriority := -1

	for _, m := range team.Members {
		if m.Role == task.StepID && m.Priority > bestPriority {
			if _, ok := s.engine.Get(m.AgentID); ok {
				best = m.AgentID
				bestPriority = m.Priority
			}
		}
	}

	// Fallback: any available member with delegation rights
	if best == "" {
		for _, m := range team.Members {
			if m.CanDelegate {
				if _, ok := s.engine.Get(m.AgentID); ok {
					return m.AgentID
				}
			}
		}
	}
	return best
}

// Running returns currently executing tasks.
func (s *Scheduler) Running() []*Task {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tasks := make([]*Task, 0, len(s.running))
	for _, t := range s.running {
		tasks = append(tasks, t)
	}
	return tasks
}