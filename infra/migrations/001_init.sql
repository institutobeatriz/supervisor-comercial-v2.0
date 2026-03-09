-- ============================================================
-- SUPERVISOR COMERCIAL - Migração Inicial v2
-- ============================================================
-- PostgreSQL 16 + pgvector + pgcrypto
-- ============================================================

-- Extensões OBRIGATÓRIAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1) SELLERS (Vendedores)
-- ============================================================
CREATE TABLE IF NOT EXISTS sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2) CONTACTS (Contatos/Clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_e164 TEXT NOT NULL UNIQUE,
    display_name TEXT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3) CONVERSATIONS (Conversas)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES sellers(id),
    status TEXT NOT NULL DEFAULT 'open',
    funnel_stage TEXT NOT NULL DEFAULT 'lead',
    last_message_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4) MESSAGES (Mensagens)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seller_id UUID NULL REFERENCES sellers(id),
    direction TEXT NOT NULL, -- inbound|outbound
    type TEXT NOT NULL, -- text|audio|image|document
    text TEXT NULL,
    media_url TEXT NULL,
    media_mime TEXT NULL,
    media_sha256 TEXT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    raw_event JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5) AUDIO_TRANSCRIPTS (Transcrições STT)
-- ============================================================
CREATE TABLE IF NOT EXISTS audio_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    confidence REAL NULL,
    duration_sec REAL NULL,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6) MESSAGE_LABELS (Classificação LLM)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    intent TEXT NOT NULL,
    objection TEXT NOT NULL,
    urgency SMALLINT NOT NULL,
    sentiment SMALLINT NOT NULL,
    funnel_stage TEXT NOT NULL,
    language TEXT NOT NULL,
    needs_attention BOOLEAN NOT NULL,
    attention_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7) CONVERSATION_INSIGHTS (Análise de Conversa)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    quality_score SMALLINT NOT NULL,
    wins JSONB NOT NULL DEFAULT '[]'::jsonb,
    mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
    next_best_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8) SALES_OUTCOMES (Resultado de Venda)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL DEFAULT 'pending', -- won|lost|pending
    value_cents INTEGER NULL,
    loss_reason TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9) RAG_CHUNKS (Bíblia de Vendas)
-- ============================================================
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(1024) NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10) REPORTS_DAILY
-- ============================================================
CREATE TABLE IF NOT EXISTS reports_daily (
    report_date DATE NOT NULL,
    seller_id UUID NOT NULL REFERENCES sellers(id),
    kpis JSONB NOT NULL,
    heatmap JSONB NOT NULL,
    highlights JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, seller_id)
);

-- ============================================================
-- 11) REPORTS_WEEKLY
-- ============================================================
CREATE TABLE IF NOT EXISTS reports_weekly (
    week_start DATE NOT NULL,
    seller_id UUID NOT NULL REFERENCES sellers(id),
    kpis JSONB NOT NULL,
    heatmap JSONB NOT NULL,
    highlights JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (week_start, seller_id)
);

-- ============================================================
-- ÍNDICES OBRIGATÓRIOS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages (conversation_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_last_message ON conversations (seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_message_labels_intent ON message_labels (intent);
CREATE INDEX IF NOT EXISTS idx_message_labels_objection ON message_labels (objection);
CREATE INDEX IF NOT EXISTS idx_sales_outcomes_outcome ON sales_outcomes (outcome);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_conversation ON rag_chunks (conversation_id);

-- Índice vetorial para RAG (similaridade cosseno)
DROP INDEX IF EXISTS idx_rag_chunks_embedding;
CREATE INDEX idx_rag_chunks_embedding ON rag_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- Update updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_insights_updated_at ON conversation_insights;
CREATE TRIGGER update_conversation_insights_updated_at
    BEFORE UPDATE ON conversation_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_outcomes_updated_at ON sales_outcomes;
CREATE TRIGGER update_sales_outcomes_updated_at
    BEFORE UPDATE ON sales_outcomes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNÇÃO RAG RETRIEVAL (Similaridade Cosseno)
-- ============================================================

CREATE OR REPLACE FUNCTION find_similar_rag_chunks(
    query_embedding vector,
    p_objection TEXT DEFAULT NULL,
    p_top_k INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    chunk_text TEXT,
    metadata JSONB,
    distance FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc.id,
        rc.chunk_text,
        rc.metadata,
        (rc.embedding <=> query_embedding) AS distance
    FROM rag_chunks rc
    WHERE
        rc.embedding IS NOT NULL
        AND (p_objection IS NULL OR rc.metadata->>'objection' = p_objection)
    ORDER BY rc.embedding <=> query_embedding
    LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DADOS INICIAIS (Seller padrão)
-- ============================================================

INSERT INTO sellers (name, active)
VALUES ('Vendedor Padrão', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
