package workflow

import "fmt"

type RunState string

const (
	RunRunning        RunState = "running"
	RunAwaitingChoice RunState = "awaiting_choice"
	RunAwaitingInput  RunState = "awaiting_input"
	RunCompleted      RunState = "completed"
	RunCanceled       RunState = "canceled"
)

type Run struct {
	ID       string
	Platform string
	Channel  string
	UserID   string
	Pack     *Pack

	State     RunState
	NodeIndex int

	LastDecision *DecisionSpec
}

type Output struct {
	State   RunState
	Message string
}

func NewRun(platform, channel, userID string, p *Pack) *Run {
	return &Run{
		ID:        "run-local", // replaced by Manager/DB later
		Platform:  platform,
		Channel:   channel,
		UserID:    userID,
		Pack:      p,
		State:     RunRunning,
		NodeIndex: 0,
	}
}

func (r *Run) Advance(_ any) (*Output, error) {
	if r.State == RunAwaitingChoice || r.State == RunAwaitingInput {
		return &Output{State: r.State}, nil
	}
	if r.NodeIndex >= len(r.Pack.Nodes) {
		r.State = RunCompleted
		return &Output{State: r.State}, nil
	}
	n := r.Pack.Nodes[r.NodeIndex]
	switch n.Type {
	case NodeDecision:
		if n.Decision == nil || len(n.Decision.Options) != 3 {
			return nil, fmt.Errorf("decision must have exactly 3 options")
		}
		r.LastDecision = n.Decision
		r.State = RunAwaitingChoice
		return &Output{State: r.State, Message: n.Decision.Title}, nil
	case NodeMessage:
		r.NodeIndex++
		return &Output{State: r.State, Message: n.Message.Content}, nil
	default:
		// Step nodes executed by Manager later
		r.NodeIndex++
		return &Output{State: r.State}, nil
	}
}

func (r *Run) OnUserMessage(_ string) (*Output, error) {
	// While awaiting choice/input, normal chat should not advance.
	if r.State == RunAwaitingChoice || r.State == RunAwaitingInput {
		return &Output{State: r.State}, nil
	}
	return r.Advance(nil)
}

func (r *Run) Choose(n int) (*Output, error) {
	if r.State != RunAwaitingChoice || r.LastDecision == nil {
		return nil, fmt.Errorf("not awaiting choice")
	}
	if n < 1 || n > 3 {
		return nil, fmt.Errorf("choice must be 1..3")
	}
	// Decision consumed, advance.
	r.State = RunRunning
	r.NodeIndex++
	return r.Advance(nil)
}

