package skill

import (
	"fmt"
	"strings"
	"sync"
)

// Manager holds the skill pool and agent-skill assignments.
// All operations are thread-safe.
type Manager struct {
	mu          sync.RWMutex
	skills      map[string]*Skill
	assignments map[string][]string // agentID → skillIDs
}

// NewManager creates an empty Manager ready for use.
func NewManager() *Manager {
	return &Manager{
		skills:      make(map[string]*Skill),
		assignments: make(map[string][]string),
	}
}

// Add registers a skill in the pool.
func (m *Manager) Add(s *Skill) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.skills[s.ID] = s
}

// Get returns a skill by ID, or nil if not found.
func (m *Manager) Get(id string) *Skill {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.skills[id]
}

// All returns every skill in the pool.
func (m *Manager) All() []*Skill {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Skill, 0, len(m.skills))
	for _, s := range m.skills {
		out = append(out, s)
	}
	return out
}

// AssignSkill assigns a skill to an agent. Duplicate assignments are ignored.
func (m *Manager) AssignSkill(agentID, skillID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, id := range m.assignments[agentID] {
		if id == skillID {
			return
		}
	}
	m.assignments[agentID] = append(m.assignments[agentID], skillID)
}

// UnassignSkill removes a skill assignment from an agent.
func (m *Manager) UnassignSkill(agentID, skillID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ids := m.assignments[agentID]
	for i, id := range ids {
		if id == skillID {
			m.assignments[agentID] = append(ids[:i], ids[i+1:]...)
			return
		}
	}
}

// GetAgentSkills returns the resolved skills assigned to an agent.
func (m *Manager) GetAgentSkills(agentID string) []*Skill {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []*Skill
	for _, id := range m.assignments[agentID] {
		if s, ok := m.skills[id]; ok {
			out = append(out, s)
		}
	}
	return out
}

// GetAgentToolNames returns the deduplicated tool names from all skills
// assigned to an agent.
func (m *Manager) GetAgentToolNames(agentID string) []string {
	skills := m.GetAgentSkills(agentID)
	seen := make(map[string]struct{})
	var names []string
	for _, s := range skills {
		for _, t := range s.ToolNames {
			if _, ok := seen[t]; !ok {
				seen[t] = struct{}{}
				names = append(names, t)
			}
		}
	}
	return names
}

// FormatSkillPrompt formats a slice of skills into a markdown block suitable
// for injection into an agent's system prompt.
func FormatSkillPrompt(skills []*Skill) string {
	if len(skills) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("## Available Skills\n")
	for _, s := range skills {
		fmt.Fprintf(&b, "\n### %s\n%s\n", s.Name, s.Description)
		if s.PromptFragment != "" {
			fmt.Fprintf(&b, "\n%s\n", s.PromptFragment)
		}
	}
	return b.String()
}

// GetAgentSkillPrompt returns a formatted prompt fragment for all skills
// assigned to the given agent. Returns "" if no skills are assigned.
// This method satisfies the agent.SkillProvider interface.
func (m *Manager) GetAgentSkillPrompt(agentID string) string {
	skills := m.GetAgentSkills(agentID)
	return FormatSkillPrompt(skills)
}
