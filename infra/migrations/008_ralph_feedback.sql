-- Tabela de feedback do Ralph Loop
-- Registra acertos/erros para aprendizado

CREATE TABLE IF NOT EXISTS ralph_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  trace_id VARCHAR(255) NOT NULL,
  decision VARCHAR(50) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  was_correct BOOLEAN,
  corrected_by VARCHAR(255),
  correction_notes TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ralph_feedback_conversation ON ralph_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ralph_feedback_timestamp ON ralph_feedback(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ralph_feedback_decision ON ralph_feedback(decision, timestamp);

-- Comentários
COMMENT ON TABLE ralph_feedback IS 'Feedback para aprendizado do Ralph Loop';
