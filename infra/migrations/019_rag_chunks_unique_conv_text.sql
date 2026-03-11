-- Migration 019: ensure unique key used by ON CONFLICT in rag-index worker
-- Legacy databases may have rag_chunks without the (conversation_id, chunk_text) unique key,
-- causing "no unique or exclusion constraint matching the ON CONFLICT specification".

-- 1) Deduplicate legacy rows before creating unique index.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY conversation_id, chunk_text
            ORDER BY created_at DESC, id DESC
        ) AS rn
    FROM rag_chunks
)
DELETE FROM rag_chunks rc
USING ranked r
WHERE rc.id = r.id
  AND r.rn > 1;

-- 2) Enforce uniqueness required by worker upsert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_chunks_conv_text_unique
    ON rag_chunks (conversation_id, chunk_text);
