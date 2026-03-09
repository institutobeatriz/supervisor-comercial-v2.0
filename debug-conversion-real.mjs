import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor'
});

await client.connect();

console.log('=== ANÁLISE PROFUNDA DA CONVERSÃO ===\n');

// Período do dia 2026-03-05 (como mostrado no screenshot)
const startDate = new Date(Date.UTC(2026, 2, 5, 3, 0, 0)); // 2026-03-05 03:00 UTC = 00:00 BRT
const endDate = new Date(Date.UTC(2026, 2, 6, 2, 59, 59)); // 2026-03-06 02:59:59 UTC = 23:59:59 BRT

console.log(`Período: ${startDate.toISOString()} até ${endDate.toISOString()}`);
console.log(`(Em horário local BRT)\n`);

// 1. Contar conversas criadas no período
const conversas = await client.query(`
  SELECT COUNT(DISTINCT c.id) as total
  FROM conversations c
  WHERE c.created_at >= $1 AND c.created_at <= $2
`, [startDate, endDate]);

console.log(`1. CONVERSAS CRIADAS NO PERÍODO:`);
console.log(`   Total: ${conversas.rows[0].total}\n`);

// 2. Contar vendas (sales_outcomes com outcome = 'won')
const vendas = await client.query(`
  SELECT 
    COUNT(*) as total_outcomes,
    COUNT(*) FILTER (WHERE outcome = 'won') as vendas_ganhas
  FROM sales_outcomes so
  WHERE so.updated_at >= $1 AND so.updated_at <= $2
`, [startDate, endDate]);

console.log(`2. SALES_OUTCOMES NO PERÍODO (so.updated_at):`);
console.log(`   Total outcomes: ${vendas.rows[0].total_outcomes}`);
console.log(`   Vendas ganhas: ${vendas.rows[0].vendas_ganhas}\n`);

// 3. Conversas com outcomes
const conversasComOutcomes = await client.query(`
  SELECT 
    COUNT(DISTINCT so.conversation_id) as conversas
  FROM sales_outcomes so
  WHERE so.updated_at >= $1 AND so.updated_at <= $2
`, [startDate, endDate]);

console.log(`3. CONVERSAS COM OUTCOMES NO PERÍODO:`);
console.log(`   Total: ${conversasComOutcomes.rows[0].conversas}\n`);

// 4. A query exata do getExecutiveKpis
const kpis = await client.query(`
  SELECT
    COALESCE(
      ROUND(100.0 * SUM(CASE WHEN so.outcome = 'won' 
        AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END)::numeric 
      / NULLIF(COUNT(DISTINCT c.id) FILTER 
        (WHERE c.created_at >= $1 AND c.created_at <= $2), 0)
      ), 0
    ) as conversion_rate,
    SUM(CASE WHEN so.outcome = 'won' 
      AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END) as vendas_ganhas,
    COUNT(DISTINCT c.id) FILTER 
      (WHERE c.created_at >= $1 AND c.created_at <= $2) as total_conversas
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
`, [startDate, endDate]);

console.log(`4. QUERY getExecutiveKpis (EXATA):`);
console.log(`   Conversão: ${kpis.rows[0].conversion_rate}%`);
console.log(`   Vendas ganhas: ${kpis.rows[0].vendas_ganhas}`);
console.log(`   Total conversas: ${kpis.rows[0].total_conversas}`);
if (kpis.rows[0].total_conversas > 0) {
  const taxa = Math.round((kpis.rows[0].vendas_ganhas / kpis.rows[0].total_conversas) * 100);
  console.log(`   Cálculo esperado: (${kpis.rows[0].vendas_ganhas} / ${kpis.rows[0].total_conversas}) × 100 = ${taxa}%\n`);
}

// 5. Query alternativa por getSellerRanking
const ranking = await client.query(`
  SELECT
    COALESCE(
      100.0 * COUNT(DISTINCT so.conversation_id) FILTER 
        (WHERE so.outcome = 'won' AND ($3::timestamptz IS NULL OR so.updated_at >= $3) 
         AND ($4::timestamptz IS NULL OR so.updated_at <= $4))
      / NULLIF(COUNT(DISTINCT so.conversation_id) FILTER 
        (WHERE ($3::timestamptz IS NULL OR so.updated_at >= $3) 
         AND ($4::timestamptz IS NULL OR so.updated_at <= $4)), 0),
      0
    ) as conversion_rate
  FROM sales_outcomes so
`, [null, null, startDate, endDate]);

console.log(`5. QUERY getSellerRanking (ALTERNATIVA):`);
console.log(`   Conversão: ${ranking.rows[0].conversion_rate}%\n`);

// 6. Comparação entre as duas abordagens
console.log(`6. COMPARAÇÃO DAS ABORDAGENS:`);
console.log(`   getExecutiveKpis: ${kpis.rows[0].conversion_rate}%`);
console.log(`   getSellerRanking: ${ranking.rows[0].conversion_rate}%`);
console.log(`   Diferença: ${Math.abs(kpis.rows[0].conversion_rate - ranking.rows[0].conversion_rate)}%\n`);

// 7. Dados brutos
console.log(`7. DADOS BRUTOS PARA ANÁLISE:`);
const brutos = await client.query(`
  SELECT
    COUNT(DISTINCT c.id) as total_conversas,
    COUNT(DISTINCT so.conversation_id) as conversas_com_outcomes,
    SUM(CASE WHEN so.outcome = 'won' THEN 1 ELSE 0 END) as total_vendas,
    COUNT(DISTINCT CASE WHEN so.outcome = 'won' THEN so.conversation_id END) as conversas_ganhas
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
  WHERE c.created_at >= $1 AND c.created_at <= $2
`, [startDate, endDate]);

console.log(`   Total conversas: ${brutos.rows[0].total_conversas}`);
console.log(`   Conversas com outcomes: ${brutos.rows[0].conversas_com_outcomes}`);
console.log(`   Total vendas (contagem): ${brutos.rows[0].total_vendas}`);
console.log(`   Conversas ganhas (distinct): ${brutos.rows[0].conversas_ganhas}\n`);

await client.end();
