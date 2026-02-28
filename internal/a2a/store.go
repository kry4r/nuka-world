package a2a

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store handles A2A task and message persistence.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates a new A2A store.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// CreateTask inserts a new A2A task.
func (s *Store) CreateTask(ctx context.Context, t *Task) error {
	proposed, _ := json.Marshal(t.ProposedAgents)
	confirmed, _ := json.Marshal(t.ConfirmedAgents)
	return s.pool.QueryRow(ctx,
		`INSERT INTO a2a_tasks (description, status, proposed_agents, confirmed_agents, max_rounds)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
		t.Description, t.Status, proposed, confirmed, t.MaxRounds,
	).Scan(&t.ID, &t.CreatedAt)
}

// UpdateTaskStatus updates a task's status and optionally its result.
func (s *Store) UpdateTaskStatus(ctx context.Context, id string, status Status, result string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE a2a_tasks SET status=$1, result=$2, updated_at=NOW() WHERE id=$3`,
		string(status), result, id)
	return err
}

// SetConfirmedAgents updates the confirmed agent list for a task.
func (s *Store) SetConfirmedAgents(ctx context.Context, id string, agents []string) error {
	data, _ := json.Marshal(agents)
	_, err := s.pool.Exec(ctx,
		`UPDATE a2a_tasks SET confirmed_agents=$1, updated_at=NOW() WHERE id=$2`, data, id)
	return err
}

// SetProposedAgents updates the proposed agent list for a task.
func (s *Store) SetProposedAgents(ctx context.Context, id string, agents []string) error {
	data, _ := json.Marshal(agents)
	_, err := s.pool.Exec(ctx,
		`UPDATE a2a_tasks SET proposed_agents=$1, updated_at=NOW() WHERE id=$2`, data, id)
	return err
}

// GetTask retrieves a task by ID.
func (s *Store) GetTask(ctx context.Context, id string) (*Task, error) {
	t := &Task{}
	var proposed, confirmed []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, description, status, proposed_agents, confirmed_agents, result, max_rounds, created_at, updated_at
		 FROM a2a_tasks WHERE id=$1`, id,
	).Scan(&t.ID, &t.Description, &t.Status, &proposed, &confirmed, &t.Result, &t.MaxRounds, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(proposed, &t.ProposedAgents)
	_ = json.Unmarshal(confirmed, &t.ConfirmedAgents)
	return t, nil
}

// ListTasks returns all tasks ordered by creation time desc.
func (s *Store) ListTasks(ctx context.Context) ([]*Task, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, description, status, proposed_agents, confirmed_agents, result, max_rounds, created_at, updated_at
		 FROM a2a_tasks ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*Task
	for rows.Next() {
		t := &Task{}
		var proposed, confirmed []byte
		if err := rows.Scan(&t.ID, &t.Description, &t.Status, &proposed, &confirmed, &t.Result, &t.MaxRounds, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(proposed, &t.ProposedAgents)
		_ = json.Unmarshal(confirmed, &t.ConfirmedAgents)
		tasks = append(tasks, t)
	}
	return tasks, nil
}

// Message represents a single message in an A2A conversation.
type Message struct {
	ID        string    `json:"id"`
	TaskID    string    `json:"task_id"`
	FromAgent string    `json:"from_agent"`
	Content   string    `json:"content"`
	Round     int       `json:"round"`
	MsgType   string    `json:"msg_type"`
	CreatedAt time.Time `json:"created_at"`
}

// AddMessage inserts a conversation message.
func (s *Store) AddMessage(ctx context.Context, m *Message) error {
	return s.pool.QueryRow(ctx,
		`INSERT INTO a2a_messages (task_id, from_agent, content, round, msg_type)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
		m.TaskID, m.FromAgent, m.Content, m.Round, m.MsgType,
	).Scan(&m.ID, &m.CreatedAt)
}

// GetMessages returns all messages for a task ordered by round and time.
func (s *Store) GetMessages(ctx context.Context, taskID string) ([]*Message, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, task_id, from_agent, content, round, msg_type, created_at
		 FROM a2a_messages WHERE task_id=$1 ORDER BY round, created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []*Message
	for rows.Next() {
		m := &Message{}
		if err := rows.Scan(&m.ID, &m.TaskID, &m.FromAgent, &m.Content, &m.Round, &m.MsgType, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, nil
}
