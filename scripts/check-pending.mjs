import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const total = await pool.query(`SELECT COUNT(*) as count FROM messages WHERE direction = 'inbound' AND text IS NOT NULL`);
  const classified = await pool.query(`SELECT COUNT(*) as count FROM message_labels`);
  const pending = await pool.query(`
    SELECT COUNT(*) as count 
    FROM messages m 
    LEFT JOIN message_labels ml ON ml.message_id = m.id 
    WHERE m.direction = 'inbound' AND m.text IS NOT NULL AND ml.id IS NULL
  `);
  
  console.log('📊 Status das Mensagens:');
  console.log(`  Total inbound: ${total.rows[0].count}`);
  console.log(`  Classificadas: ${classified.rows[0].count}`);
  console.log(`  Pendentes: ${pending.rows[0].count}`);
  
  await pool.end();
}

check().catch(console.error);
