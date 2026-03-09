import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor'
});

await client.connect();

console.log('=== ANÁLISE CORRIGIDA DE CONVERSÃO ===\n');

// Período do dia 2026-03-05 (como mostrado no screenshot)
const dayStart = new Date(Date.UTC(2026, 2, 5, 3, 0, 0)); // 2026-03-05 03:00 UTC = 00:00 BRT
const dayEnd = new Date(Date.UTC(2026, 2, 6, 2, 59, 59)); // 2026-03-06 02:59:59 UTC = 23:59:59 BRT

console.log(`PERÍODO DIÁRIO (2026-03-05):`);
console.log(`  ${dayStart.toISOString()} até ${dayEnd.toISOString()}\n`);

// Dados no período diário
const daily = await client.query(`
  SELECT
    COUNT(DISTINCT c.id) as conversas,
    COUNT(DISTINCT CASE WHEN so.outcome = 'won' THEN c.id END) as vendas,
    SUM(CASE WHEN so.outcome = 'won' THEN 1 ELSE 0 END) as vendas_count
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
  WHERE c.created_at >= $1 AND c.created_at <= $2
`, [dayStart, dayEnd]);

console.log(`DADOS DIÁRIOS:`);
console.log(`  Conversas: ${daily.rows[0].conversas}`);
console.log(`  Vendas (distinct): ${daily.rows[0].vendas}`);
console.log(`  Vendas (count): ${daily.rows[0].vendas_count}`);
console.log(`  Taxa correta: 1/16 = 6.25% ou 0/16 = 0%\n`);

// Agora testar período mensal
const monthStart = new Date(Date.UTC(2026, 2, 1, 0, 0, 0)); // 2026-03-01 00:00:00 UTC
const monthEnd = new Date(Date.UTC(2026, 2, 31, 23, 59, 59)); // 2026-03-31 23:59:59 UTC

console.log(`PERÍODO MENSAL (2026-03):`);
console.log(`  ${monthStart.toISOString()} até ${monthEnd.toISOString()}\n`);

const monthly = await client.query(`
  SELECT
    COUNT(DISTINCT c.id) as conversas,
    COUNT(DISTINCT CASE WHEN so.outcome = 'won' THEN c.id END) as vendas,
    SUM(CASE WHEN so.outcome = 'won' THEN 1 ELSE 0 END) as vendas_count
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
  WHERE c.created_at >= $1 AND c.created_at <= $2
`, [monthStart, monthEnd]);

console.log(`DADOS MENSAIS:`);
console.log(`  Conversas: ${monthly.rows[0].conversas}`);
console.log(`  Vendas (distinct): ${monthly.rows[0].vendas}`);
console.log(`  Vendas (count): ${monthly.rows[0].vendas_count}`);

const taxaMensal = monthly.rows[0].conversas > 0 
  ? ((monthly.rows[0].vendas / monthly.rows[0].conversas) * 100).toFixed(2)
  : 0;
console.log(`  Taxa: ${taxaMensal}%\n`);

// Dados sem LEFT JOIN (só conversas com sales_outcomes)
const onlyWithOutcomes = await client.query(`
  SELECT
    COUNT(DISTINCT so.conversation_id) as conversas,
    COUNT(DISTINCT CASE WHEN so.outcome = 'won' THEN so.conversation_id END) as vendas
  FROM sales_outcomes so
  WHERE so.updated_at >= $1 AND so.updated_at <= $2
`, [monthStart, monthEnd]);

console.log(`DADOS MENSAIS (APENAS CONVERSAS COM OUTCOMES):`);
console.log(`  Conversas com outcomes: ${onlyWithOutcomes.rows[0].conversas}`);
console.log(`  Vendas: ${onlyWithOutcomes.rows[0].vendas}`);

const taxaComOutcomes = onlyWithOutcomes.rows[0].conversas > 0
  ? ((onlyWithOutcomes.rows[0].vendas / onlyWithOutcomes.rows[0].conversas) * 100).toFixed(2)
  : 0;
console.log(`  Taxa: ${taxaComOutcomes}%\n`);

// Testar a query getSellerRanking corrigida
const ranking = await client.query(`
  SELECT
    COALESCE(
      100.0 * COUNT(DISTINCT so.conversation_id) FILTER 
        (WHERE so.outcome = 'won' AND so.updated_at >= $1 AND so.updated_at <= $2)
      / NULLIF(COUNT(DISTINCT so.conversation_id) FILTER 
        (WHERE so.updated_at >= $1 AND so.updated_at <= $2), 0),
      0
    )::integer as conversion_rate
  FROM sales_outcomes so
`, [monthStart, monthEnd]);

console.log(`QUERY getSellerRanking (CORRIGIDA):`);
console.log(`  Conversão: ${ranking.rows[0].conversion_rate}%\n`);

await client.end();
