-- Migration 006: Add raw_event_id FK to messages
-- Links each message back to the original raw event that created it.

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS raw_event_id UUID NULL;

-- Note: we use an index for the FK effect rather than ADD CONSTRAINT
-- since ADD CONSTRAINT is not idempotent (no IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_messages_raw_event_id
    ON messages (raw_event_id) WHERE raw_event_id IS NOT NULL;
