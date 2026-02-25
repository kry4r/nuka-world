package memory

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// ActivationOpts controls spreading activation behavior.
type ActivationOpts struct {
	MaxDepth    int     // max hops, default 3
	DecayFactor float64 // per-hop decay, default 0.7
	Threshold   float64 // min activation to recall, default 0.3
	MaxNodes    int     // max recalled nodes, default 50
}

// DefaultActivationOpts returns sensible defaults.
func DefaultActivationOpts() ActivationOpts {
	return ActivationOpts{
		MaxDepth:    3,
		DecayFactor: 0.7,
		Threshold:   0.3,
		MaxNodes:    50,
	}
}

// ActivatedNode is a node recalled by spreading activation.
type ActivatedNode struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	Name       string  `json:"name"`
	Content    string  `json:"content"`
	Activation float64 `json:"activation"`
}

// ActivationResult holds the output of a spreading activation pass.
type ActivationResult struct {
	Nodes    []ActivatedNode `json:"nodes"`
	Duration time.Duration   `json:"duration"`
}

// Activate performs spreading activation from trigger keywords.
// BFS traversal along graph edges with per-hop weight decay.
func (s *Store) Activate(ctx context.Context, agentID string, triggers []string, opts ActivationOpts) (*ActivationResult, error) {
	start := time.Now()
	if opts.MaxDepth == 0 {
		opts = DefaultActivationOpts()
	}

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	// Cypher: start from nodes matching trigger keywords,
	// traverse up to MaxDepth hops, accumulate decayed activation.
	query := `
		UNWIND $triggers AS keyword
		MATCH (trigger)
		WHERE trigger.agent_id = $agentId
		  AND (trigger.name CONTAINS keyword
		    OR trigger.content CONTAINS keyword
		    OR trigger.description CONTAINS keyword)
		WITH COLLECT(DISTINCT trigger) AS seeds
		UNWIND seeds AS seed
		CALL {
			WITH seed
			MATCH path = (seed)-[*1..` + itoa(opts.MaxDepth) + `]-(node)
			WHERE node.agent_id = $agentId
			WITH node, length(path) AS depth,
			     reduce(w = 1.0, r IN relationships(path) |
			       w * coalesce(r.weight, 0.5)
			     ) AS pathWeight
			RETURN node, $decay ^ toFloat(depth) * pathWeight AS activation
		}
		WITH node, MAX(activation) AS activation
		WHERE activation > $threshold
		RETURN DISTINCT
			node.id AS id,
			labels(node)[0] AS label,
			coalesce(node.name, '') AS name,
			coalesce(node.content, node.description, '') AS content,
			activation
		ORDER BY activation DESC
		LIMIT $maxNodes
	`

	result, err := session.Run(ctx, query, map[string]interface{}{
		"triggers":  triggers,
		"agentId":   agentID,
		"decay":     opts.DecayFactor,
		"threshold": opts.Threshold,
		"maxNodes":  opts.MaxNodes,
	})
	if err != nil {
		return nil, err
	}

	ar := &ActivationResult{}
	for result.Next(ctx) {
		rec := result.Record()
		node := ActivatedNode{}
		if v, ok := rec.Get("id"); ok && v != nil {
			node.ID = v.(string)
		}
		if v, ok := rec.Get("label"); ok && v != nil {
			node.Label = v.(string)
		}
		if v, ok := rec.Get("name"); ok && v != nil {
			node.Name = v.(string)
		}
		if v, ok := rec.Get("content"); ok && v != nil {
			node.Content = v.(string)
		}
		if v, ok := rec.Get("activation"); ok && v != nil {
			node.Activation = v.(float64)
		}
		ar.Nodes = append(ar.Nodes, node)
	}

	ar.Duration = time.Since(start)
	s.logger.Info("spreading activation complete",
		zap.String("agent", agentID),
		zap.Int("triggers", len(triggers)),
		zap.Int("recalled", len(ar.Nodes)),
		zap.Duration("duration", ar.Duration))
	return ar, nil
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
