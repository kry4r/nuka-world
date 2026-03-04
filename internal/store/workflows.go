package store

import (
	"context"
	"encoding/json"
	"fmt"
)

func (s *Store) UpsertWorkflowPack(ctx context.Context, id, name string, tags []string, packJSON string) (string, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return "", fmt.Errorf("marshal workflow_pack tags: %w", err)
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO workflow_packs (id, name, tags, pack_json, updated_at)
		VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
		ON CONFLICT (id) DO UPDATE SET
		  name = EXCLUDED.name,
		  tags = EXCLUDED.tags,
		  pack_json = EXCLUDED.pack_json,
		  updated_at = NOW()`,
		id, name, string(tagsJSON), packJSON,
	)
	if err != nil {
		return "", fmt.Errorf("upsert workflow_pack: %w", err)
	}
	return id, nil
}

func (s *Store) GetWorkflowPackJSON(ctx context.Context, id string) (string, error) {
	row := s.db.QueryRow(ctx, `SELECT pack_json::text FROM workflow_packs WHERE id = $1`, id)
	var out string
	if err := row.Scan(&out); err != nil {
		return "", fmt.Errorf("get workflow_pack: %w", err)
	}
	return out, nil
}

