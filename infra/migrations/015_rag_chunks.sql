-- Migration 015: RAG chunks for conversation search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(1536) NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rag_chunks_conv_text UNIQUE (conversation_id, chunk_text)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_conversation_id ON rag_chunks (conversation_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
    ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    WHERE embedding IS NOT NULL;
