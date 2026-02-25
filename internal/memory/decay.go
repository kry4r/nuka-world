package memory

import (
	"context"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// DecayConfig controls memory decay behavior.
type DecayConfig struct {
	HalfLifeHours float64 // time for activation to halve (default 168 = 1 week)
	MinActivation float64 // floor value, never decay below this (default 0.05)
	UsageBoost    float64 // activation boost per access (default 0.15)
}

// DefaultDecayConfig returns sensible defaults.
func DefaultDecayConfig() DecayConfig {
	return DecayConfig{
		HalfLifeHours: 168,
		MinActivation: 0.05,
		UsageBoost:    0.15,
	}
}

// DecaySweep applies time-based exponential decay to all schema activation levels.
// Should be called periodically (e.g. every hour or on agent wake).
func (s *Store) DecaySweep(ctx context.Context, agentID string, cfg DecayConfig) (int, error) {
	if cfg.HalfLifeHours == 0 {
		cfg = DefaultDecayConfig()
	}

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	// Exponential decay: activation * 2^(-hours_elapsed / half_life)
	// Clamped to MinActivation floor
	result, err := session.Run(ctx,
		`MATCH (sc:Schema {agent_id: $agentId})
		 WHERE sc.activation_level > $minAct
		 WITH sc,
		      duration.between(sc.last_activated, datetime()).hours AS hours
		 WHERE hours > 0
		 SET sc.activation_level = CASE
		   WHEN sc.activation_level * (0.5 ^ (toFloat(hours) / $halfLife)) < $minAct
		   THEN $minAct
		   ELSE sc.activation_level * (0.5 ^ (toFloat(hours) / $halfLife))
		 END
		 RETURN count(sc) AS updated`,
		map[string]interface{}{
			"agentId":  agentID,
			"halfLife": cfg.HalfLifeHours,
			"minAct":   cfg.MinActivation,
		})
	if err != nil {
		return 0, err
	}

	var updated int
	if result.Next(ctx) {
		if v, ok := result.Record().Get("updated"); ok {
			updated = int(v.(int64))
		}
	}

	s.logger.Info("decay sweep complete",
		zap.String("agent", agentID),
		zap.Int("updated", updated))

	return updated, nil
}

// BoostAccess reinforces a schema's activation when it's accessed.
// Also increments access_count on linked memories.
func (s *Store) BoostAccess(ctx context.Context, schemaID string, cfg DecayConfig) error {
	if cfg.UsageBoost == 0 {
		cfg = DefaultDecayConfig()
	}

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MATCH (sc:Schema {id: $schemaId})
		 SET sc.activation_level = CASE
		       WHEN sc.activation_level + $boost > 1.0 THEN 1.0
		       ELSE sc.activation_level + $boost
		     END,
		     sc.last_activated = datetime()
		 WITH sc
		 OPTIONAL MATCH (m:Memory)-[:INSTANCE_OF]->(sc)
		 SET m.access_count = m.access_count + 1`,
		map[string]interface{}{
			"schemaId": schemaID,
			"boost":    cfg.UsageBoost,
		})

	return err
}
