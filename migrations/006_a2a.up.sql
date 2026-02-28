-- A2A-Lite: task collaboration tables

CREATE TABLE IF NOT EXISTS a2a_tasks (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    description   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted','planning','confirmed','working','completed','failed','canceled')),
    proposed_agents JSONB DEFAULT '[]',
    confirmed_agents JSONB DEFAULT '[]',
    result        TEXT DEFAULT '',
    max_rounds    INT DEFAULT 10,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS a2a_messages (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id    TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
    from_agent TEXT NOT NULL,
    content    TEXT NOT NULL,
    round      INT NOT NULL DEFAULT 0,
    msg_type   TEXT NOT NULL DEFAULT 'agent' CHECK (msg_type IN ('agent','moderator')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_messages_task ON a2a_messages(task_id, round);
