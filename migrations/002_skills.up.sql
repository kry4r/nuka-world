-- Nuka World: Skills Schema

CREATE TABLE IF NOT EXISTS skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    prompt_fragment TEXT,
    tool_names      JSONB DEFAULT '[]',
    source          VARCHAR(20) DEFAULT 'db',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id  VARCHAR(100) NOT NULL,
    skill_id  UUID REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
);
