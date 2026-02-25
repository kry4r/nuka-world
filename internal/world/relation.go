package world

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// RelationType categorizes the relationship between two agents.
type RelationType string

const (
	RelationColleague   RelationType = "colleague"
	RelationMentor      RelationType = "mentor"
	RelationSubordinate RelationType = "subordinate"
	RelationFriend      RelationType = "friend"
)

// Relation represents a directed social relationship between two agents.
type Relation struct {
	FromAgentID string       `json:"from_agent_id"`
	ToAgentID   string       `json:"to_agent_id"`
	Type        RelationType `json:"type"`
	Strength    float64      `json:"strength"`     // 0-1
	History     []string     `json:"history"`       // interaction summaries
	UpdatedAt   time.Time    `json:"updated_at"`
}

// RelationGraph manages social relationships stored in Neo4j.
type RelationGraph struct {
	driver      neo4j.DriverWithContext
	decayRate   float64 // strength decay per tick, e.g. 0.001
	logger      *zap.Logger
}

// NewRelationGraph creates a relation graph backed by Neo4j.
func NewRelationGraph(driver neo4j.DriverWithContext, decayRate float64, logger *zap.Logger) *RelationGraph {
	return &RelationGraph{
		driver:    driver,
		decayRate: decayRate,
		logger:    logger,
	}
}

// SetRelation creates or updates a relationship between two agents.
func (g *RelationGraph) SetRelation(ctx context.Context, rel *Relation) error {
	session := g.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MERGE (a:Agent {id: $from})-[r:RELATES_TO {type: $type}]->(b:Agent {id: $to})
		 ON CREATE SET r.strength = $strength, r.history = $history, r.updated_at = datetime()
		 ON MATCH SET r.strength = $strength, r.history = $history, r.updated_at = datetime()`,
		map[string]interface{}{
			"from":     rel.FromAgentID,
			"to":       rel.ToAgentID,
			"type":     string(rel.Type),
			"strength": rel.Strength,
			"history":  rel.History,
		})
	if err != nil {
		return fmt.Errorf("set relation: %w", err)
	}
	return nil
}

// GetRelation returns a specific relationship between two agents.
func (g *RelationGraph) GetRelation(ctx context.Context, fromID, toID string, relType RelationType) (*Relation, error) {
	session := g.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	result, err := session.Run(ctx,
		`MATCH (a:Agent {id: $from})-[r:RELATES_TO {type: $type}]->(b:Agent {id: $to})
		 RETURN r.strength, r.history, r.updated_at`,
		map[string]interface{}{
			"from": fromID,
			"to":   toID,
			"type": string(relType),
		})
	if err != nil {
		return nil, fmt.Errorf("get relation: %w", err)
	}
	if !result.Next(ctx) {
		return nil, nil
	}
	rec := result.Record()
	strength, _ := rec.Get("r.strength")
	history, _ := rec.Get("r.history")

	var hist []string
	if h, ok := history.([]interface{}); ok {
		for _, v := range h {
			if s, ok := v.(string); ok {
				hist = append(hist, s)
			}
		}
	}

	return &Relation{
		FromAgentID: fromID,
		ToAgentID:   toID,
		Type:        relType,
		Strength:    strength.(float64),
		History:     hist,
	}, nil
}

// GetRelations returns all outgoing relationships for an agent.
func (g *RelationGraph) GetRelations(ctx context.Context, agentID string) ([]*Relation, error) {
	session := g.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	result, err := session.Run(ctx,
		`MATCH (a:Agent {id: $agentId})-[r:RELATES_TO]->(b:Agent)
		 RETURN b.id, r.type, r.strength, r.history`,
		map[string]interface{}{"agentId": agentID})
	if err != nil {
		return nil, fmt.Errorf("get relations: %w", err)
	}

	var relations []*Relation
	for result.Next(ctx) {
		rec := result.Record()
		toID, _ := rec.Get("b.id")
		relType, _ := rec.Get("r.type")
		strength, _ := rec.Get("r.strength")
		history, _ := rec.Get("r.history")

		var hist []string
		if h, ok := history.([]interface{}); ok {
			for _, v := range h {
				if s, ok := v.(string); ok {
					hist = append(hist, s)
				}
			}
		}

		relations = append(relations, &Relation{
			FromAgentID: agentID,
			ToAgentID:   toID.(string),
			Type:        RelationType(relType.(string)),
			Strength:    strength.(float64),
			History:     hist,
		})
	}
	return relations, nil
}

// RecordInteraction strengthens a relationship and appends a history entry.
func (g *RelationGraph) RecordInteraction(ctx context.Context, fromID, toID string, relType RelationType, summary string, boost float64) error {
	session := g.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MATCH (a:Agent {id: $from})-[r:RELATES_TO {type: $type}]->(b:Agent {id: $to})
		 SET r.strength = CASE WHEN r.strength + $boost > 1.0 THEN 1.0 ELSE r.strength + $boost END,
		     r.history = r.history + $summary,
		     r.updated_at = datetime()`,
		map[string]interface{}{
			"from":    fromID,
			"to":      toID,
			"type":    string(relType),
			"boost":   boost,
			"summary": summary,
		})
	if err != nil {
		return fmt.Errorf("record interaction: %w", err)
	}
	return nil
}

// OnTick implements ClockListener. Decays all relationship strengths over time.
func (g *RelationGraph) OnTick(worldTime time.Time) {
	ctx := context.Background()
	session := g.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MATCH ()-[r:RELATES_TO]->()
		 WHERE r.strength > 0
		 SET r.strength = CASE WHEN r.strength - $decay < 0 THEN 0 ELSE r.strength - $decay END`,
		map[string]interface{}{"decay": g.decayRate})
	if err != nil {
		g.logger.Warn("relation decay tick failed", zap.Error(err))
	}
}
