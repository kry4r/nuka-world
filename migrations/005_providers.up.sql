-- Nuka World: Provider Dynamic Management
-- Adds columns for dynamic provider management with encrypted API keys.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS models   JSONB DEFAULT '[]';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS extra    JSONB DEFAULT '{}';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure only one default provider at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_default
    ON providers (is_default) WHERE is_default = true;
