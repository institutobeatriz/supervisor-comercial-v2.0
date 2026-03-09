import { Queue } from 'bullmq';
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'app',
  password: 'app',
  database: 'sales_supervisor',
});

const SELLER_ID = '7ac25038-9649-43b2-b0a5-abd89a750a5f'; // Instituto Beatriz Oliveira
const BATCH_SIZE = 50;
const MAX_MESSAGES = 5000; // Todas as mensagens

async function queueMessages() {
  const connection = { host: 'localhost', port: 6379 };
  const classifyQueue = new Queue('classify', { connection });

  console.log('Buscando mensagens do Instituto-Vendas...');
  const result = await pool.query(`
    SELECT m.id, m.conversation_id, m.text, m.direction, m.timestamp, m.raw_event
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.seller_id = $1
    AND m.direction = 'inbound'
    AND m.text IS NOT NULL
    ORDER BY m.timestamp DESC
    LIMIT $2
  `, [SELLER_ID, MAX_MESSAGES]);

  console.log(`Total de mensagens inbound com texto: ${result.rows.length}`);

  let count = 0;
  for (const msg of result.rows) {
    await classifyQueue.add('classify', {
      messageId: msg.id,
      conversationId: msg.conversation_id,
      text: msg.text,
      sellerId: SELLER_ID,
    });
    count++;
    if (count % 10 === 0) {
      console.log(`  ${count}/${result.rows.length} mensagens enfileiradas...`);
    }
  }

  console.log(`\n✅ ${count} mensagens enfileiradas para classificação!`);
  await pool.end();
}

queueMessages().catch(console.error);
