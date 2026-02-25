package memory

import (
	"context"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// MatchResult represents how well input matches a schema.
type MatchResult struct {
	Schema *Schema `json:"schema"`
	Score  float64 `json:"score"`  // 0.0 - 1.0
	Method string  `json:"method"` // "keyword", "semantic"
}

// MatchThresholds controls assimilation vs accommodation decisions.
type MatchThresholds struct {
	Assimilate  float64 // score >= this → assimilate (default 0.8)
	Accommodate float64 // score <= this → accommodate (default 0.3)
}

// DefaultMatchThresholds returns Piaget-inspired defaults.
func DefaultMatchThresholds() MatchThresholds {
	return MatchThresholds{
		Assimilate:  0.8,
		Accommodate: 0.3,
	}
}

// MatchSchemas finds schemas that match the given input keywords.
// Returns results sorted by score descending.
func (s *Store) MatchSchemas(ctx context.Context, agentID string, keywords []string) ([]MatchResult, error) {
	start := time.Now()

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	// Fetch all schemas for this agent
	result, err := session.Run(ctx,
		`MATCH (s:Schema {agent_id: $agentId})
		 RETURN s.id AS id, s.name AS name, s.description AS desc,
		        s.activation_level AS activation, s.strength AS strength,
		        s.created_at AS created, s.last_activated AS lastActivated`,
		map[string]interface{}{"agentId": agentID})
	if err != nil {
		return nil, err
	}

	var matches []MatchResult
	for result.Next(ctx) {
		rec := result.Record()
		schema := &Schema{AgentID: agentID}

		if v, ok := rec.Get("id"); ok && v != nil {
			schema.ID = v.(string)
		}
		if v, ok := rec.Get("name"); ok && v != nil {
			schema.Name = v.(string)
		}
		if v, ok := rec.Get("desc"); ok && v != nil {
			schema.Description = v.(string)
		}
		if v, ok := rec.Get("activation"); ok && v != nil {
			schema.ActivationLevel = v.(float64)
		}
		if v, ok := rec.Get("strength"); ok && v != nil {
			schema.Strength = v.(float64)
		}

		score := keywordSimilarity(keywords, schema.Name, schema.Description)
		if score > 0 {
			matches = append(matches, MatchResult{
				Schema: schema,
				Score:  score,
				Method: "keyword",
			})
		}
	}

	// Sort by score descending
	sortMatchResults(matches)

	s.logger.Debug("schema matching complete",
		zap.String("agent", agentID),
		zap.Int("keywords", len(keywords)),
		zap.Int("matches", len(matches)),
		zap.Duration("duration", time.Since(start)))

	return matches, nil
}
