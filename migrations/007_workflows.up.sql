-- Workflow packs + runs + bindings

CREATE TABLE IF NOT EXISTS workflow_packs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tags        JSONB DEFAULT '[]',
  version     INT NOT NULL DEFAULT 1,
  pack_json   JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_bindings (
  platform    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  pack_id     TEXT NOT NULL REFERENCES workflow_packs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (platform, channel_id)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  platform     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  state        TEXT NOT NULL,
  pack_id      TEXT NOT NULL REFERENCES workflow_packs(id),
  run_json     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, channel_id, user_id) -- one active slot per user/channel (enforced at app-level too)
);

