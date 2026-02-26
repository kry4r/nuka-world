package store

import (
	"context"
	"fmt"
	"time"

	"github.com/nidhogg/nuka-world/internal/agent"
)

// SaveAgent upserts an agent into the database.
func (s *Store) SaveAgent(ctx context.Context, a *agent.Agent) error {
	now := time.Now()
	_, err := s.db.Exec(ctx, `
		INSERT INTO agents (id, name, role, personality, backstory, system_prompt, provider_id, model, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			role = EXCLUDED.role,
			personality = EXCLUDED.personality,
			backstory = EXCLUDED.backstory,
			system_prompt = EXCLUDED.system_prompt,
			provider_id = EXCLUDED.provider_id,
			model = EXCLUDED.model,
			status = EXCLUDED.status,
			updated_at = EXCLUDED.updated_at`,
		a.Persona.ID, a.Persona.Name, a.Persona.Role,
		a.Persona.Personality, a.Persona.Backstory, a.Persona.SystemPrompt,
		a.ProviderID, a.Model, string(a.Status), now,
	)
	if err != nil {
		return fmt.Errorf("save agent %s: %w", a.Persona.ID, err)
	}
	return nil
}

// GetAgent retrieves a single agent by ID.
func (s *Store) GetAgent(ctx context.Context, id string) (*agent.Agent, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, name, role, personality, backstory, system_prompt,
		       COALESCE(provider_id,''), COALESCE(model,''), status, created_at, updated_at
		FROM agents WHERE id = $1`, id)

	var a agent.Agent
	err := row.Scan(
		&a.Persona.ID, &a.Persona.Name, &a.Persona.Role,
		&a.Persona.Personality, &a.Persona.Backstory, &a.Persona.SystemPrompt,
		&a.ProviderID, &a.Model, &a.Status, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get agent %s: %w", id, err)
	}
	return &a, nil
}

// ListAgents returns all non-deleted agents.
func (s *Store) ListAgents(ctx context.Context) ([]*agent.Agent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, name, role, personality, backstory, system_prompt,
		       COALESCE(provider_id,''), COALESCE(model,''), status, created_at, updated_at
		FROM agents WHERE status != 'deleted'
		ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var agents []*agent.Agent
	for rows.Next() {
		var a agent.Agent
		if err := rows.Scan(
			&a.Persona.ID, &a.Persona.Name, &a.Persona.Role,
			&a.Persona.Personality, &a.Persona.Backstory, &a.Persona.SystemPrompt,
			&a.ProviderID, &a.Model, &a.Status, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		agents = append(agents, &a)
	}
	return agents, nil
}

// DeleteAgent soft-deletes an agent by setting status to 'deleted'.
func (s *Store) DeleteAgent(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE agents SET status = 'deleted', updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete agent %s: %w", id, err)
	}
	return nil
}
