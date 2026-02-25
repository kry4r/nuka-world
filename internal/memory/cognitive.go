package memory

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// CognitiveAction describes what happened during schema processing.
type CognitiveAction string

const (
	ActionAssimilate  CognitiveAction = "assimilate"
	ActionAccommodate CognitiveAction = "accommodate"
	ActionPartial     CognitiveAction = "partial_update"
)

// CognitiveResult captures the outcome of processing new information.
type CognitiveResult struct {
	Action   CognitiveAction `json:"action"`
	SchemaID string          `json:"schema_id"`
	MemoryID string          `json:"memory_id"`
	Score    float64         `json:"score"`
	Detail   string          `json:"detail"`
}

// Process takes new information and either assimilates it into an existing
// schema or accommodates by creating a new one. This is the core Piaget loop.
func (s *Store) Process(ctx context.Context, agentID string, content string, keywords []string, importance float64) (*CognitiveResult, error) {
	thresholds := DefaultMatchThresholds()

	// Step 1: Create the memory node
	mem := &Memory{
		ID:         uuid.New().String(),
		AgentID:    agentID,
		Content:    content,
		Importance: importance,
	}
	if err := s.CreateMemory(ctx, mem); err != nil {
		return nil, err
	}

	// Step 2: Match against existing schemas
	matches, err := s.MatchSchemas(ctx, agentID, keywords)
	if err != nil {
		return nil, err
	}

	// Step 3: Decide action based on best match
	if len(matches) > 0 && matches[0].Score >= thresholds.Assimilate {
		return s.assimilate(ctx, mem, matches[0])
	}
	if len(matches) == 0 || matches[0].Score <= thresholds.Accommodate {
		return s.accommodate(ctx, agentID, mem, keywords)
	}
	return s.partialUpdate(ctx, mem, matches[0])
}

// assimilate integrates new memory into an existing schema.
// Strengthens the schema and links the memory as an instance.
func (s *Store) assimilate(ctx context.Context, mem *Memory, match MatchResult) (*CognitiveResult, error) {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	// Link memory to schema and boost strength
	_, err := session.Run(ctx,
		`MATCH (m:Memory {id: $memId}), (sc:Schema {id: $schemaId})
		 MERGE (m)-[:INSTANCE_OF {score: $score}]->(sc)
		 SET sc.strength = sc.strength + (1.0 - sc.strength) * 0.1,
		     sc.activation_level = CASE
		       WHEN sc.activation_level + 0.2 > 1.0 THEN 1.0
		       ELSE sc.activation_level + 0.2
		     END,
		     sc.last_activated = datetime()`,
		map[string]interface{}{
			"memId":    mem.ID,
			"schemaId": match.Schema.ID,
			"score":    match.Score,
		})
	if err != nil {
		return nil, err
	}

	s.logger.Info("assimilated memory into schema",
		zap.String("memory", mem.ID),
		zap.String("schema", match.Schema.Name),
		zap.Float64("score", match.Score))

	return &CognitiveResult{
		Action:   ActionAssimilate,
		SchemaID: match.Schema.ID,
		MemoryID: mem.ID,
		Score:    match.Score,
		Detail:   "integrated into existing schema: " + match.Schema.Name,
	}, nil
}

// accommodate creates a new schema when input doesn't fit existing ones.
func (s *Store) accommodate(ctx context.Context, agentID string, mem *Memory, keywords []string) (*CognitiveResult, error) {
	schema := &Schema{
		ID:          uuid.New().String(),
		AgentID:     agentID,
		Name:        strings.Join(keywords, "_"),
		Description: mem.Content,
		Strength:    0.5,
	}
	if err := s.CreateSchema(ctx, schema); err != nil {
		return nil, err
	}

	if err := s.LinkMemoryToSchema(ctx, mem.ID, schema.ID); err != nil {
		return nil, err
	}

	s.logger.Info("accommodated new schema",
		zap.String("memory", mem.ID),
		zap.String("schema", schema.Name))

	return &CognitiveResult{
		Action:   ActionAccommodate,
		SchemaID: schema.ID,
		MemoryID: mem.ID,
		Score:    0,
		Detail:   "created new schema: " + schema.Name,
	}, nil
}

// partialUpdate links memory to a partially matching schema
// and slightly boosts its activation without strengthening.
func (s *Store) partialUpdate(ctx context.Context, mem *Memory, match MatchResult) (*CognitiveResult, error) {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MATCH (m:Memory {id: $memId}), (sc:Schema {id: $schemaId})
		 MERGE (m)-[:RELATED_TO {score: $score}]->(sc)
		 SET sc.activation_level = CASE
		       WHEN sc.activation_level + 0.1 > 1.0 THEN 1.0
		       ELSE sc.activation_level + 0.1
		     END,
		     sc.last_activated = datetime()`,
		map[string]interface{}{
			"memId":    mem.ID,
			"schemaId": match.Schema.ID,
			"score":    match.Score,
		})
	if err != nil {
		return nil, err
	}

	s.logger.Info("partial schema update",
		zap.String("memory", mem.ID),
		zap.String("schema", match.Schema.Name),
		zap.Float64("score", match.Score))

	return &CognitiveResult{
		Action:   ActionPartial,
		SchemaID: match.Schema.ID,
		MemoryID: mem.ID,
		Score:    match.Score,
		Detail:   "partial match with schema: " + match.Schema.Name,
	}, nil
}
