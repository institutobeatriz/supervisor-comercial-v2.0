-- Migration 011: Add sale_type and evidence tracking to sales_outcomes
-- Differentiates new sales from renewals/subscriptions.

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS sale_type TEXT NULL;
    -- 'nova_venda' | 'mensalidade' | 'renovacao' | NULL

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS evidence_message_ids UUID[] NULL;
    -- IDs of messages that prove the sale (comprovante + confirmation texts)

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS comprovante_analyzed_at TIMESTAMPTZ NULL;
    -- When the comprovante was analyzed by Vision OCR

-- Index for filtering by sale type in dashboard analytics
CREATE INDEX IF NOT EXISTS idx_sales_outcomes_sale_type
    ON sales_outcomes (sale_type, outcome)
    WHERE sale_type IS NOT NULL;
