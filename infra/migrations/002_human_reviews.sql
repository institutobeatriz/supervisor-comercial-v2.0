-- Tabela de revisões humanas
-- Vendas/decisões que precisam de aprovação manual

CREATE TABLE IF NOT EXISTS human_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referência à conversa/mensagem
  conversation_id VARCHAR(100) NOT NULL,
  message_id VARCHAR(100),
  contact_name VARCHAR(200),
  
  -- Decisão sugerida pelo sistema
  suggested_outcome VARCHAR(20) NOT NULL, -- 'won', 'lost', 'in_progress'
  suggested_value_cents INTEGER,
  confidence DECIMAL(3,2),
  
  -- Motivo da revisão
  reason TEXT NOT NULL,
  rule_id VARCHAR(50),
  
  -- Contexto
  message_text TEXT,
  trace_id VARCHAR(100),
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  
  -- Decisão humana
  reviewed_by VARCHAR(200),
  reviewed_at TIMESTAMPTZ,
  final_outcome VARCHAR(20), -- 'won', 'lost', 'in_progress'
  final_value_cents INTEGER,
  review_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_human_reviews_status ON human_reviews(status);
CREATE INDEX IF NOT EXISTS idx_human_reviews_created ON human_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_human_reviews_conversation ON human_reviews(conversation_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_human_reviews_updated_at ON human_reviews;
CREATE TRIGGER update_human_reviews_updated_at
  BEFORE UPDATE ON human_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
