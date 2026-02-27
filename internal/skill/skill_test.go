package skill

import "testing"

func TestManagerAssignAndGet(t *testing.T) {
	mgr := NewManager()
	mgr.Add(&Skill{ID: "s1", Name: "search", Source: "builtin"})
	mgr.Add(&Skill{ID: "s2", Name: "memory", Source: "builtin"})

	mgr.AssignSkill("agent-1", "s1")
	mgr.AssignSkill("agent-1", "s2")
	mgr.AssignSkill("agent-2", "s1")

	skills := mgr.GetAgentSkills("agent-1")
	if len(skills) != 2 {
		t.Fatalf("agent-1 got %d skills, want 2", len(skills))
	}

	skills = mgr.GetAgentSkills("agent-2")
	if len(skills) != 1 {
		t.Fatalf("agent-2 got %d skills, want 1", len(skills))
	}

	skills = mgr.GetAgentSkills("agent-3")
	if len(skills) != 0 {
		t.Fatalf("agent-3 got %d skills, want 0", len(skills))
	}
}

func TestManagerUnassign(t *testing.T) {
	mgr := NewManager()
	mgr.Add(&Skill{ID: "s1", Name: "search", Source: "builtin"})

	mgr.AssignSkill("agent-1", "s1")
	mgr.UnassignSkill("agent-1", "s1")

	skills := mgr.GetAgentSkills("agent-1")
	if len(skills) != 0 {
		t.Fatalf("got %d skills after unassign, want 0", len(skills))
	}
}

func TestFormatSkillPrompt(t *testing.T) {
	skills := []*Skill{
		{Name: "search", Description: "Web search", PromptFragment: "You can search."},
	}
	prompt := FormatSkillPrompt(skills)
	if prompt == "" {
		t.Error("expected non-empty prompt")
	}
}
