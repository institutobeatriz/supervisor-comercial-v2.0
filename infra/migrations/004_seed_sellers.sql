-- ============================================================
-- SEED: Vendedores com metas individuais
-- ============================================================
-- Executar após a migration 003_add_monthly_goal.sql

-- Limpar vendedores existentes (opcional, cuidado em produção)
-- DELETE FROM sellers;

-- Inserir vendedores com metas diferentes (em centavos)
INSERT INTO sellers (name, active, monthly_goal_cents) VALUES
  ('Ana Silva', true, 6000000),      -- Meta: R$ 60.000,00
  ('Carlos Santos', true, 4500000),  -- Meta: R$ 45.000,00
  ('Maria Oliveira', true, 7500000), -- Meta: R$ 75.000,00
  ('Pedro Costa', true, 5000000),    -- Meta: R$ 50.000,00
  ('Julia Ferreira', true, 5500000), -- Meta: R$ 55.000,00
  ('Vendedor Padrao', true, 5000000) -- Meta: R$ 50.000,00 (default)
ON CONFLICT DO NOTHING;

-- Verificar inserção
SELECT name, monthly_goal_cents/100 as meta_reais FROM sellers WHERE active = true ORDER BY monthly_goal_cents DESC;
