import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor'
});

await client.connect();

const startDate = new Date(Date.UTC(2026, 2, 5, 3, 0, 0)); 
const endDate = new Date(Date.UTC(2026, 2, 6, 2, 59, 59)); 

console.log('Testando a query getExecutiveKpis exatamente como está\n');

// Query exata da função getExecutiveKpis (linhas 602-632 de queries.ts)
const result = await client.query(`
  SELECT
    SUM(CASE WHEN so.outcome = 'won' AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END) as sales_won,
    COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads_received,
    COALESCE(
      ROUND(100.0 * SUM(CASE WHEN so.outcome = 'won' 
        AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END)::numeric 
      / NULLIF(COUNT(DISTINCT c.id) FILTER 
        (WHERE c.created_at >= $1 AND c.created_at <= $2), 0)
      ), 0
    ) as conversion_rate
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
`, [startDate, endDate]);

console.log('Resultado da query getExecutiveKpis:');
console.log(JSON.stringify(result.rows[0], null, 2));

// Agora vamos tentar o cálculo manual
const sales_won = result.rows[0].sales_won;
const leads_received = result.rows[0].leads_received;
const manualCalc = Math.round((sales_won / Math.max(leads_received, 1)) * 100);

console.log(`\nCálculo manual em Node.js:`);
console.log(`  (${sales_won} / ${leads_received}) * 100 = ${manualCalc}%`);

// Agora testar a query COM um seller_id NULL (como no código real)
const resultWithSeller = await client.query(`
  SELECT
    SUM(CASE WHEN so.outcome = 'won' AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END) as sales_won,
    COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads_received,
    COALESCE(
      ROUND(100.0 * SUM(CASE WHEN so.outcome = 'won' 
        AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END)::numeric 
      / NULLIF(COUNT(DISTINCT c.id) FILTER 
        (WHERE c.created_at >= $1 AND c.created_at <= $2), 0)
      ), 0
    ) as conversion_rate
  FROM conversations c
  LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
  WHERE $3::text IS NULL OR c.seller_id = $3::uuid
`, [startDate, endDate, null]);

console.log('\nCom filtro seller_id (NULL):');
console.log(JSON.stringify(resultWithSeller.rows[0], null, 2));

await client.end();
