package a2a

import "strings"

// AgentCard describes an agent's capabilities for task matching.
type AgentCard struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Role      string   `json:"role"`
	Skills    []string `json:"skills"`
	Available bool     `json:"available"`
}

// MatchCards returns agents whose skills overlap with the task description keywords.
func MatchCards(cards []*AgentCard, taskDesc string) []*AgentCard {
	words := strings.Fields(strings.ToLower(taskDesc))
	var matched []*AgentCard
	for _, c := range cards {
		if !c.Available {
			continue
		}
		if matchScore(c, words) > 0 {
			matched = append(matched, c)
		}
	}
	return matched
}

func matchScore(c *AgentCard, words []string) int {
	score := 0
	roleLower := strings.ToLower(c.Role)
	for _, w := range words {
		if len(w) < 2 {
			continue
		}
		for _, sk := range c.Skills {
			if strings.Contains(strings.ToLower(sk), w) {
				score++
			}
		}
		if strings.Contains(roleLower, w) {
			score++
		}
	}
	return score
}
