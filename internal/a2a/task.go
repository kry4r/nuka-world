package a2a

import (
	"fmt"
	"time"
)

// Status represents the state of an A2A task.
type Status string

const (
	StatusSubmitted Status = "submitted"
	StatusPlanning  Status = "planning"
	StatusConfirmed Status = "confirmed"
	StatusWorking   Status = "working"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
	StatusCanceled  Status = "canceled"
)

// Task represents an A2A collaboration task.
type Task struct {
	ID              string    `json:"id"`
	Description     string    `json:"description"`
	Status          Status    `json:"status"`
	ProposedAgents  []string  `json:"proposed_agents"`
	ConfirmedAgents []string  `json:"confirmed_agents"`
	Result          string    `json:"result"`
	MaxRounds       int       `json:"max_rounds"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// validTransitions defines allowed state transitions.
var validTransitions = map[Status][]Status{
	StatusSubmitted: {StatusPlanning, StatusCanceled},
	StatusPlanning:  {StatusConfirmed, StatusCanceled},
	StatusConfirmed: {StatusWorking, StatusCanceled},
	StatusWorking:   {StatusCompleted, StatusFailed, StatusCanceled},
}

// Transition validates and returns nil if from→to is a legal transition.
func Transition(from, to Status) error {
	allowed, ok := validTransitions[from]
	if !ok {
		return fmt.Errorf("no transitions from %q", from)
	}
	for _, s := range allowed {
		if s == to {
			return nil
		}
	}
	return fmt.Errorf("invalid transition %q → %q", from, to)
}
