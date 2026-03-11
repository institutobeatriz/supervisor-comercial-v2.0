import 'dotenv/config';
import pg from 'pg';
import { Queue } from 'bullmq';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const match = REDIS_URL.match(/redis:\/\/([^:]+):(\d+)/);
const connection = match ? { host: match[1], port: parseInt(match[2]) } : { host: 'localhost', port: 6379 };

const classifyQueue = new Queue('classify', { connection });

async function reprocess() {
  console.log('🔄 Buscando mensagens sem classificação...\n');
  
  const result = await pool.query(`
    SELECT m.id, m.conversation_id, m.text, m.seller_id, ct.display_name
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN message_labels ml ON ml.message_id = m.id
    WHERE ml.id IS NULL 
      AND m.text IS NOT NULL 
      AND m.text != ''
      AND m.direction = 'inbound'
    LIMIT 100
  `);
  
  console.log(`Encontradas ${result.rowCount} mensagens para classificar\n`);
  
  for (const msg of result.rows) {
    await classifyQueue.add('classify', {
      messageId: msg.id,
      conversationId: msg.conversation_id,
      text: msg.text,
      contactName: msg.display_name || 'Contato',
      sellerId: msg.seller_id
    });
  }
  
  console.log(`✅ ${result.rowCount} jobs adicionados à fila`);
  
  await pool.end();
  process.exit(0);
}

reprocess().catch(console.error);
