package store

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// SkillRow represents a skill record in the database.
type SkillRow struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	PromptFragment string   `json:"prompt_fragment"`
	ToolNames      []string `json:"tool_names"`
	Source         string   `json:"source"`
}

// Store wraps a PostgreSQL connection pool.
type Store struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// New creates a Store with a pgx connection pool.
func New(dsn string, logger *zap.Logger) (*Store, error) {
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	logger.Info("PostgreSQL connected")
	return &Store{db: pool, logger: logger}, nil
}

// Migrate reads and executes all .sql files from the migrations directory.
func (s *Store) Migrate(ctx context.Context, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".up.sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, f := range files {
		data, err := os.ReadFile(filepath.Join(migrationsDir, f))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", f, err)
		}
		if _, err := s.db.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("exec migration %s: %w", f, err)
		}
		s.logger.Info("Migration applied", zap.String("file", f))
	}
	return nil
}

// Close shuts down the connection pool.
func (s *Store) Close() {
	s.db.Close()
}

// SaveSkill inserts a new skill into the database.
func (s *Store) SaveSkill(ctx context.Context, sk *SkillRow) error {
	toolJSON, err := json.Marshal(sk.ToolNames)
	if err != nil {
		return fmt.Errorf("marshal tool_names: %w", err)
	}
	_, err = s.db.Exec(ctx,
		`INSERT INTO skills (name, description, prompt_fragment, tool_names, source)
		 VALUES ($1, $2, $3, $4, $5)`,
		sk.Name, sk.Description, sk.PromptFragment, toolJSON, sk.Source,
	)
	if err != nil {
		return fmt.Errorf("insert skill: %w", err)
	}
	return nil
}

// ListSkills returns all skills from the database.
func (s *Store) ListSkills(ctx context.Context) ([]*SkillRow, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, description, prompt_fragment, tool_names, source FROM skills`)
	if err != nil {
		return nil, fmt.Errorf("query skills: %w", err)
	}
	defer rows.Close()

	var skills []*SkillRow
	for rows.Next() {
		var sk SkillRow
		var toolJSON []byte
		if err := rows.Scan(&sk.ID, &sk.Name, &sk.Description, &sk.PromptFragment, &toolJSON, &sk.Source); err != nil {
			return nil, fmt.Errorf("scan skill: %w", err)
		}
		if err := json.Unmarshal(toolJSON, &sk.ToolNames); err != nil {
			return nil, fmt.Errorf("unmarshal tool_names: %w", err)
		}
		skills = append(skills, &sk)
	}
	return skills, rows.Err()
}

// AssignSkill links a skill to an agent, ignoring duplicates.
func (s *Store) AssignSkill(ctx context.Context, agentID, skillID string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO agent_skills (agent_id, skill_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`,
		agentID, skillID,
	)
	if err != nil {
		return fmt.Errorf("assign skill: %w", err)
	}
	return nil
}

// UnassignSkill removes a skill-to-agent link.
func (s *Store) UnassignSkill(ctx context.Context, agentID, skillID string) error {
	_, err := s.db.Exec(ctx,
		`DELETE FROM agent_skills WHERE agent_id = $1 AND skill_id = $2`,
		agentID, skillID,
	)
	if err != nil {
		return fmt.Errorf("unassign skill: %w", err)
	}
	return nil
}

// GetAgentSkillIDs returns the skill IDs assigned to an agent.
func (s *Store) GetAgentSkillIDs(ctx context.Context, agentID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT skill_id FROM agent_skills WHERE agent_id = $1`, agentID)
	if err != nil {
		return nil, fmt.Errorf("query agent skills: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan skill_id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
