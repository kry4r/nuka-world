package workflow

import "testing"

func TestRun_ManualDecision_GatesProgress(t *testing.T) {
	p := &Pack{ID: "p1", Name: "demo", Policies: Policies{DecisionMode: DecisionManual}}
	p.Nodes = []Node{
		{ID: "n1", Type: NodeDecision, Decision: &DecisionSpec{
			Title: "Pick one",
			Options: []Option{
				{ID: "o1", Title: "A"},
				{ID: "o2", Title: "B"},
				{ID: "o3", Title: "C"},
			},
		}},
		{ID: "n2", Type: NodeMessage, Message: &MessageSpec{Content: "after"}},
	}
	r := NewRun("rest", "c1", "u1", p)

	out, err := r.Advance(nil)
	if err != nil {
		t.Fatalf("advance: %v", err)
	}
	if out.State != RunAwaitingChoice {
		t.Fatalf("expected awaiting_choice, got %s", out.State)
	}

	// Sending normal chat while awaiting_choice should NOT advance.
	out, err = r.OnUserMessage("hello")
	if err != nil {
		t.Fatalf("on msg: %v", err)
	}
	if out.State != RunAwaitingChoice {
		t.Fatalf("expected still awaiting_choice, got %s", out.State)
	}

	// Choosing should advance to next node.
	out, err = r.Choose(2) // pick B
	if err != nil {
		t.Fatalf("choose: %v", err)
	}
	if out.State == RunAwaitingChoice {
		t.Fatalf("expected progressed, still awaiting_choice")
	}
}

func TestRun_Decision_RequiresExactly3Options(t *testing.T) {
	p := &Pack{ID: "p1", Name: "demo"}
	p.Nodes = []Node{
		{ID: "n1", Type: NodeDecision, Decision: &DecisionSpec{
			Title:   "bad",
			Options: []Option{{ID: "o1", Title: "only one"}},
		}},
	}
	r := NewRun("rest", "c1", "u1", p)
	_, err := r.Advance(nil)
	if err == nil {
		t.Fatalf("expected error for non-3 options")
	}
}

