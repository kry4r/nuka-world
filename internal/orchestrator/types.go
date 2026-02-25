package orchestrator

import "time"

// WorkflowType defines how tasks in a workflow execute.
type WorkflowType string

const (
	WorkflowSequential  WorkflowType = "sequential"
	WorkflowParallel    WorkflowType = "parallel"
	WorkflowConditional WorkflowType = "conditional"
)

// TaskStatus tracks execution state.
type TaskStatus string

const (
	TaskPending   TaskStatus = "pending"
	TaskRunning   TaskStatus = "running"
	TaskDone      TaskStatus = "done"
	TaskFailed    TaskStatus = "failed"
	TaskCancelled TaskStatus = "cancelled"
)

// Team is a group of agents coordinated by a steward.
type Team struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	StewardID string   `json:"steward_id"`
	Members   []Member `json:"members"`
	Workflow  Workflow  `json:"workflow"`
	CreatedAt time.Time `json:"created_at"`
}

// Member is an agent's role within a team.
type Member struct {
	AgentID     string `json:"agent_id"`
	Role        string `json:"role"`
	CanDelegate bool   `json:"can_delegate"`
	Priority    int    `json:"priority"`
}

// Workflow defines how a team executes tasks.
type Workflow struct {
	Type  WorkflowType `json:"type"`
	Steps []Step       `json:"steps"`
}

// Step is a single unit of work in a workflow.
type Step struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	AgentRole   string     `json:"agent_role"`
	Instruction string     `json:"instruction"`
	DependsOn   []string   `json:"depends_on,omitempty"`
	Condition   string     `json:"condition,omitempty"`
}

// Task is a concrete unit of work assigned to an agent.
type Task struct {
	ID          string     `json:"id"`
	StepID      string     `json:"step_id"`
	AgentID     string     `json:"agent_id"`
	Input       string     `json:"input"`
	Status      TaskStatus `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// TaskResult holds the output of a completed task.
type TaskResult struct {
	TaskID   string     `json:"task_id"`
	AgentID  string     `json:"agent_id"`
	Output   string     `json:"output"`
	Status   TaskStatus `json:"status"`
	Error    string     `json:"error,omitempty"`
	Duration time.Duration `json:"duration"`
}
