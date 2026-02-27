package skill

// Skill represents a capability that can be assigned to an agent.
// Skills carry prompt fragments and tool bindings that extend an agent's behavior.
type Skill struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	PromptFragment string   `json:"prompt_fragment"`
	ToolNames      []string `json:"tool_names"`
	Source         string   `json:"source"` // "builtin", "plugin", "db"
}
