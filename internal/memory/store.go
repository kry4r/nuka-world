package memory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"go.uber.org/zap"
)

// Store handles Neo4j operations for the memory system.
type Store struct {
	driver neo4j.DriverWithContext
	logger *zap.Logger
}

// NewStore creates a new Neo4j memory store.
func NewStore(uri, user, password string, logger *zap.Logger) (*Store, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("create neo4j driver: %w", err)
	}
	return &Store{driver: driver, logger: logger}, nil
}

// Close shuts down the Neo4j driver.
func (s *Store) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}

// Driver returns the underlying Neo4j driver for shared use.
func (s *Store) Driver() neo4j.DriverWithContext {
	return s.driver
}

// Ping verifies the Neo4j connection.
func (s *Store) Ping(ctx context.Context) error {
	return s.driver.VerifyConnectivity(ctx)
}

// CreateSchema creates a new schema node.
func (s *Store) CreateSchema(ctx context.Context, schema *Schema) error {
	if schema.ID == "" {
		schema.ID = uuid.New().String()
	}
	schema.CreatedAt = time.Now()
	schema.LastActivated = schema.CreatedAt

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`CREATE (s:Schema {
			id: $id, agent_id: $agentId, name: $name,
			description: $desc, activation_level: 0.0,
			strength: $strength, created_at: datetime(),
			last_activated: datetime()
		})`,
		map[string]interface{}{
			"id":       schema.ID,
			"agentId":  schema.AgentID,
			"name":     schema.Name,
			"desc":     schema.Description,
			"strength": schema.Strength,
		})
	return err
}

// CreateMemory creates a new memory node.
func (s *Store) CreateMemory(ctx context.Context, mem *Memory) error {
	if mem.ID == "" {
		mem.ID = uuid.New().String()
	}
	mem.CreatedAt = time.Now()

	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`CREATE (m:Memory {
			id: $id, agent_id: $agentId,
			content: $content, importance: $importance,
			access_count: 0, created_at: datetime()
		})`,
		map[string]interface{}{
			"id":         mem.ID,
			"agentId":    mem.AgentID,
			"content":    mem.Content,
			"importance": mem.Importance,
		})
	return err
}

// GetMemories returns memories for an agent.
func (s *Store) GetMemories(ctx context.Context, agentID string, limit int) ([]*Memory, error) {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	result, err := session.Run(ctx,
		`MATCH (m:Memory {agent_id: $agentId})
		 RETURN m.id, m.content, m.importance, m.access_count
		 ORDER BY m.importance DESC LIMIT $limit`,
		map[string]interface{}{"agentId": agentID, "limit": limit})
	if err != nil {
		return nil, err
	}

	var memories []*Memory
	for result.Next(ctx) {
		rec := result.Record()
		id, _ := rec.Get("m.id")
		content, _ := rec.Get("m.content")
		importance, _ := rec.Get("m.importance")
		accessCount, _ := rec.Get("m.access_count")
		memories = append(memories, &Memory{
			ID:          id.(string),
			AgentID:     agentID,
			Content:     content.(string),
			Importance:  importance.(float64),
			AccessCount: int(accessCount.(int64)),
		})
	}
	return memories, nil
}

// LinkMemoryToSchema creates an INSTANCE_OF relationship.
func (s *Store) LinkMemoryToSchema(ctx context.Context, memoryID, schemaID string) error {
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{})
	defer session.Close(ctx)

	_, err := session.Run(ctx,
		`MATCH (m:Memory {id: $memId}), (s:Schema {id: $schemaId})
		 MERGE (m)-[:INSTANCE_OF]->(s)`,
		map[string]interface{}{"memId": memoryID, "schemaId": schemaID})
	return err
}
