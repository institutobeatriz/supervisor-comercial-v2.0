-- ============================================================
-- MIGRATION: Adiciona coluna monthly_goal_cents na tabela sellers
-- ============================================================
-- Permite que cada vendedor tenha sua própria meta mensal
-- Valor em centavos para evitar problemas de ponto flutuante

-- Adiciona coluna de meta mensal (em centavos)
ALTER TABLE sellers 
ADD COLUMN IF NOT EXISTS monthly_goal_cents INTEGER NOT NULL DEFAULT 5000000;
-- Default: R$ 50.000,00 (50.000 * 100 centavos)

-- Comentario para documentacao
COMMENT ON COLUMN sellers.monthly_goal_cents IS 'Meta mensal do vendedor em centavos (ex: 5000000 = R$ 50.000,00)';

-- Atualiza metas existentes com valores diferentes para demonstracao
-- Vendedor Padrao mantem R$ 50.000
UPDATE sellers SET monthly_goal_cents = 5000000 WHERE name = 'Vendedor Padrao';

-- ============================================================
-- FIM DA MIGRACAO
-- ============================================================
