package a2a

import (
	"context"
	"fmt"
)

// AgentEngine is the minimal interface the planner needs from the agent system.
type AgentEngine interface {
	ListAgentIDs() []string
	GetAgentCard(id string) (*AgentCard, bool)
}

// TeamProposal is the result of the planner's team selection.
type TeamProposal struct {
	TaskID         string       `json:"task_id"`
	ProposedAgents []*AgentCard `json:"proposed_agents"`
	Reasoning      string       `json:"reasoning"`
}

// Planner selects agents for a collaboration task.
type Planner struct {
	engine AgentEngine
}

// NewPlanner creates a new Planner.
func NewPlanner(engine AgentEngine) *Planner {
	return &Planner{engine: engine}
}

// ProposeTeam scans all agents, matches capabilities, and returns a proposal.
func (p *Planner) ProposeTeam(ctx context.Context, taskDesc string) (*TeamProposal, error) {
	ids := p.engine.ListAgentIDs()
	if len(ids) == 0 {
		return nil, fmt.Errorf("no agents available")
	}

	var cards []*AgentCard
	for _, id := range ids {
		if c, ok := p.engine.GetAgentCard(id); ok {
			cards = append(cards, c)
		}
	}

	matched := MatchCards(cards, taskDesc)
	if len(matched) == 0 {
		// Fallback: include all available agents except "world"
		for _, c := range cards {
			if c.ID != "world" && c.Available {
				matched = append(matched, c)
			}
		}
	}

	reasoning := fmt.Sprintf("Matched %d agent(s) for task: %s", len(matched), taskDesc)
	return &TeamProposal{
		ProposedAgents: matched,
		Reasoning:      reasoning,
	}, nil
}
