-- Migration 017: Normalize rag_chunks.embedding dimension to 1536
-- 001_init created vector(1024), while newer RAG pipeline expects 1536.
-- If conversion is needed, embeddings are reset to NULL and must be regenerated.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
    embedding_type TEXT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rag_chunks'
          AND column_name = 'embedding'
    ) THEN
        SELECT format_type(a.atttypid, a.atttypmod)
        INTO embedding_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'rag_chunks'
          AND a.attname = 'embedding'
          AND a.attnum > 0
          AND NOT a.attisdropped;

        IF embedding_type <> 'vector(1536)' THEN
            DROP INDEX IF EXISTS idx_rag_chunks_embedding;
            ALTER TABLE rag_chunks
                ALTER COLUMN embedding TYPE vector(1536)
                USING NULL;
        END IF;

        CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
            ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
            WHERE embedding IS NOT NULL;
    END IF;
END $$;
