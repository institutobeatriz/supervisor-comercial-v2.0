import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor'
});

await client.connect();

const start = new Date(Date.UTC(2026, 2, 1, 0, 0, 0)); // 2026-03-01
const end = new Date(Date.UTC(2026, 2, 31, 23, 59, 59)); // 2026-03-31

// Quantas conversas ganhas vs quantos outcomes ganhos
const result = await client.query(`
  SELECT
    COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won') as conversas_ganhas,
    COUNT(*) FILTER (WHERE so.outcome = 'won') as outcomes_ganhos
  FROM sales_outcomes so
  JOIN conversations c ON c.id = so.conversation_id
  WHERE c.created_at >= $1 AND c.created_at <= $2
`, [start, end]);

console.log('Período: 2026-03');
console.log(`Conversas com outcome = 'won': ${result.rows[0].conversas_ganhas}`);
console.log(`Total outcomes = 'won': ${result.rows[0].outcomes_ganhos}`);
console.log(`Diferença: ${result.rows[0].outcomes_ganhos - result.rows[0].conversas_ganhas}`);

await client.end();
process.exit(0);
