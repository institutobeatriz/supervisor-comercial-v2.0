-- Migration 016: Alert history table for resolved/archived alerts
-- Supports GET /alerts/history with a versioned schema.

CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_key TEXT,
    alert_type TEXT,
    title TEXT,
    lead TEXT,
    phone_e164 TEXT,
    action_label TEXT,
    seller_id UUID NULL REFERENCES sellers(id) ON DELETE SET NULL,
    seller_name TEXT,
    conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_by TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alert_history
    ADD COLUMN IF NOT EXISTS alert_key TEXT,
    ADD COLUMN IF NOT EXISTS alert_type TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS lead TEXT,
    ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
    ADD COLUMN IF NOT EXISTS action_label TEXT,
    ADD COLUMN IF NOT EXISTS seller_id UUID NULL REFERENCES sellers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS seller_name TEXT,
    ADD COLUMN IF NOT EXISTS conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS resolved_by TEXT,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alert_history_resolved_at ON alert_history (resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_conversation_id ON alert_history (conversation_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_seller_id ON alert_history (seller_id);
