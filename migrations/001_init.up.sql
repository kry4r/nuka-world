-- Nuka World: Initial Schema
-- Phase 1 Migration

CREATE TABLE IF NOT EXISTS providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(50) NOT NULL,
    endpoint    VARCHAR(500),
    api_key_enc BYTEA,
    config      JSONB,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    role        VARCHAR(100),
    personality TEXT,
    backstory   TEXT,
    system_prompt TEXT,
    sprite_config JSONB,
    provider_id TEXT,
    model       VARCHAR(100),
    status      VARCHAR(20) DEFAULT 'idle',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    steward_id  UUID REFERENCES agents(id),
    workflow    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID REFERENCES agents(id),
    platform    VARCHAR(50),
    channel_id  VARCHAR(200),
    status      VARCHAR(20) DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, platform, channel_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID REFERENCES sessions(id),
    role           VARCHAR(20) NOT NULL,
    content        TEXT NOT NULL,
    tool_calls     JSONB,
    thinking_chain JSONB,
    tokens_used    INT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
