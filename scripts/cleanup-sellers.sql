-- Limpar vendedores indesejados, mantendo apenas Vendedor Padrão e Instituto-Vendas

-- Primeiro, atualizar conversas para o vendedor padrão
UPDATE conversations 
SET seller_id = (SELECT id FROM sellers WHERE name = 'Vendedor Padrão')
WHERE seller_id NOT IN (
  SELECT id FROM sellers WHERE name IN ('Vendedor Padrão', 'Instituto-Vendas')
);

-- Atualizar mensagens
UPDATE messages 
SET seller_id = (SELECT id FROM sellers WHERE name = 'Vendedor Padrão')
WHERE seller_id NOT IN (
  SELECT id FROM sellers WHERE name IN ('Vendedor Padrão', 'Instituto-Vendas')
);

-- Deletar vendedores indesejados
DELETE FROM sellers 
WHERE name NOT IN ('Vendedor Padrão', 'Instituto-Vendas');

-- Verificar resultado
SELECT id, name FROM sellers;
