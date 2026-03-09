-- Migration 009: Message Deduplication
-- Prevents duplicate messages from Evolution API webhook re-deliveries.
-- Strategy 1: unique index on (conversation_id, whatsapp_message_id) for structured dedup.
-- Strategy 2: unique index on correct JSON path for backward compatibility with existing rows.

-- 1. Add whatsapp_message_id column (idempotent)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT NULL;

-- 2. Unique index on whatsapp_message_id (partial - ignores NULLs, idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_dedup
    ON messages (conversation_id, whatsapp_message_id)
    WHERE whatsapp_message_id IS NOT NULL;

-- 3. Unique index on correct JSON path raw_event->'key'->>'id'
--    NOTE: raw_event->>'key.id' is WRONG (looks for literal key named "key.id")
--          raw_event->'key'->>'id' is CORRECT (nested path: key object -> id field)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_raw_event_key_id
    ON messages (conversation_id, (raw_event->'key'->>'id'))
    WHERE (raw_event->'key'->>'id') IS NOT NULL;
