package workflow

type DecisionMode string

const (
	DecisionManual DecisionMode = "manual"
	DecisionAuto   DecisionMode = "auto"
)

type NodeType string

const (
	NodeDecision NodeType = "decision"
	NodeMessage  NodeType = "message"
	NodeStep     NodeType = "step"
)

type Policies struct {
	DecisionMode       DecisionMode `json:"decision_mode"`
	AutoThinkingRounds int          `json:"auto_thinking_rounds"`
	DeciderRole        string       `json:"decider_role"`
}

type Pack struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Version     int      `json:"version"`
	Policies    Policies `json:"policies"`
	Nodes       []Node   `json:"nodes"`
}

type Node struct {
	ID       string        `json:"id"`
	Type     NodeType      `json:"type"`
	Decision *DecisionSpec `json:"decision,omitempty"`
	Message  *MessageSpec  `json:"message,omitempty"`
	Step     *StepSpec     `json:"step,omitempty"`
}

type DecisionSpec struct {
	Title   string   `json:"title"`
	Options []Option `json:"options"`
}

type Option struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

type MessageSpec struct {
	Content string `json:"content"`
}

type StepSpec struct {
	Role        string `json:"role"`
	Instruction string `json:"instruction"`
	Iterations  int    `json:"iterations,omitempty"`
}

