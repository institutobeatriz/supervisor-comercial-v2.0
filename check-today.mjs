import { Client } from 'pg';
const client = new Client({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });
await client.connect();

const hoje = new Date('2026-03-05T03:00:00.000Z');

// Mídias de hoje
const midia = await client.query(`
  SELECT m.id, m.conversation_id, m.media_mime, m.media_url, m.created_at, ml.intent
  FROM messages m
  LEFT JOIN message_labels ml ON ml.message_id = m.id
  WHERE m.created_at >= $1 AND m.media_mime IS NOT NULL
  ORDER BY m.created_at DESC LIMIT 20
`, [hoje]);

console.log('MÍDIAS DE HOJE:');
if (midia.rows.length === 0) console.log('  NENHUMA MÍDIA!');
midia.rows.forEach(r => {
  console.log(`  [${r.media_mime?.split('/')[0]}] ${r.created_at?.toISOString()?.slice(11,19)} conv:${r.conversation_id?.slice(0,8)} intent=${r.intent||'null'}`);
});

// Sales outcomes
const vendas = await client.query(`
  SELECT so.outcome, so.updated_at, so.value_cents
  FROM sales_outcomes so WHERE so.updated_at >= $1
  ORDER BY so.updated_at DESC LIMIT 10
`, [hoje]);

console.log('\nSALES OUTCOMES DE HOJE:');
if (vendas.rows.length === 0) console.log('  NENHUM!');
else vendas.rows.forEach(r => console.log(`  ${r.outcome} ${r.updated_at?.toISOString()?.slice(11,19)} R$${(r.value_cents||0)/100}`));

// Intents de hoje
const intents = await client.query(`
  SELECT ml.intent, COUNT(*) as total
  FROM message_labels ml
  JOIN messages m ON m.id = ml.message_id
  WHERE m.created_at >= $1
  GROUP BY ml.intent ORDER BY total DESC LIMIT 10
`, [hoje]);

console.log('\nINTENTS DE HOJE:');
intents.rows.forEach(r => console.log(`  ${r.intent}: ${r.total}`));

// Total de msgs hoje
const total = await client.query(`
  SELECT COUNT(*) as total_msgs,
    COUNT(CASE WHEN media_mime IS NOT NULL THEN 1 END) as total_midia
  FROM messages WHERE created_at >= $1
`, [hoje]);

const t = total.rows[0];
console.log(`\nTOTAL HOJE: Msgs=${t.total_msgs} Mídia=${t.total_midia}`);

await client.end(); process.exit(0);
