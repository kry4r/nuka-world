package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/nidhogg/nuka-world/internal/provider"
)

// FindOrCreateSession returns an existing session or creates a new one.
func (s *Store) FindOrCreateSession(ctx context.Context, agentID, channelID, platform string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO sessions (id, agent_id, platform, channel_id, status)
		VALUES (gen_random_uuid(), $1, $2, $3, 'active')
		ON CONFLICT (agent_id, platform, channel_id)
		DO UPDATE SET status = 'active'
		RETURNING id`,
		agentID, platform, channelID,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("find or create session: %w", err)
	}
	return id, nil
}

// AppendMessage stores a message in the given session.
func (s *Store) AppendMessage(ctx context.Context, sessionID string, msg provider.Message) error {
	var toolCallsJSON []byte
	if len(msg.ToolCalls) > 0 {
		var err error
		toolCallsJSON, err = json.Marshal(msg.ToolCalls)
		if err != nil {
			return fmt.Errorf("marshal tool_calls: %w", err)
		}
	}

	_, err := s.db.Exec(ctx, `
		INSERT INTO messages (id, session_id, role, content, tool_calls)
		VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
		sessionID, msg.Role, msg.Content, toolCallsJSON,
	)
	if err != nil {
		return fmt.Errorf("append message: %w", err)
	}
	return nil
}

// GetMessages retrieves recent messages for a session, ordered by creation time.
func (s *Store) GetMessages(ctx context.Context, sessionID string, limit int) ([]provider.Message, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(ctx, `
		SELECT role, content, tool_calls
		FROM messages
		WHERE session_id = $1
		ORDER BY created_at ASC
		LIMIT $2`, sessionID, limit)
	if err != nil {
		return nil, fmt.Errorf("get messages: %w", err)
	}
	defer rows.Close()

	var msgs []provider.Message
	for rows.Next() {
		var msg provider.Message
		var toolCallsJSON []byte

		if err := rows.Scan(&msg.Role, &msg.Content, &toolCallsJSON); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		if len(toolCallsJSON) > 0 {
			json.Unmarshal(toolCallsJSON, &msg.ToolCalls)
		}
		msgs = append(msgs, msg)
	}
	return msgs, nil
}
