-- Migration 005: Raw Events (append-only store)
-- IMMUTABLE: never DELETE or UPDATE rows in this table.
-- Acts as the source of truth for all incoming webhook events.

CREATE TABLE IF NOT EXISTS raw_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event           TEXT NOT NULL,
    instance        TEXT NOT NULL,
    data            JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- WhatsApp message ID extracted from payload for deduplication
    -- Matches data->'key'->>'id' for message events
    whatsapp_id     TEXT NULL,
    -- FK to the message created from this event (nullable — not all events create messages)
    message_id      UUID NULL  -- Will add FK constraint after messages table exists
);

-- Deduplication: same whatsapp_id cannot be processed twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_events_whatsapp_id
    ON raw_events (whatsapp_id) WHERE whatsapp_id IS NOT NULL;

-- Audit queries
CREATE INDEX IF NOT EXISTS idx_raw_events_received_at
    ON raw_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_events_instance
    ON raw_events (instance, received_at DESC);
