import { Pool } from 'pg';
import { Queue } from 'bullmq';

const db = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });
const queue = new Queue('classify', { connection: { host: 'localhost', port: 6379 } });

const result = await db.query(`
  SELECT m.id as message_id, m.conversation_id, m.text, c.display_name as contact_name, conv.seller_id
  FROM messages m
  JOIN conversations conv ON m.conversation_id = conv.id
  JOIN contacts c ON conv.contact_id = c.id
  WHERE m.direction = 'inbound' 
    AND m.type = 'text' 
    AND m.text IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id = m.id)
`);

console.log(`Enfileirando ${result.rows.length} mensagens...`);

let count = 0;
for (const row of result.rows) {
  await queue.add('classify', {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    text: row.text,
    contactName: row.contact_name,
    sellerId: row.seller_id,
  });
  count++;
  if (count % 50 === 0) console.log(`  ${count} mensagens...`);
}

console.log(`✅ ${count} mensagens enfileiradas!`);
await db.end();
process.exit(0);
