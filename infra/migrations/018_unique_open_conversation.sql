-- Migration 018: enforce a single open conversation per contact
-- Prevents race conditions creating two open conversations for the same contact,
-- which can bypass webhook dedup keyed by (conversation_id, whatsapp_message_id).

-- 1) Normalize existing data: keep newest "open" conversation per contact.
WITH ranked AS (
    SELECT
        id,
        contact_id,
        ROW_NUMBER() OVER (
            PARTITION BY contact_id
            ORDER BY COALESCE(last_message_at, created_at) DESC, created_at DESC, id DESC
        ) AS rn
    FROM conversations
    WHERE status = 'open'
)
UPDATE conversations c
SET
    status = 'closed',
    funnel_stage = CASE
        WHEN c.funnel_stage IN ('closed_won', 'closed_lost') THEN c.funnel_stage
        ELSE 'closed_lost'
    END
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 2) Enforce invariant at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_open_per_contact
    ON conversations (contact_id)
    WHERE status = 'open';
