import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const result = await pool.query(`
    SELECT m.id, m.direction, m.type, LEFT(m.text, 60) as preview
    FROM messages m
    LEFT JOIN message_labels ml ON ml.message_id = m.id
    WHERE ml.id IS NULL
    ORDER BY m.direction, m.timestamp DESC
  `);
  
  console.log(`Mensagens pendentes: ${result.rowCount}\n`);
  
  result.rows.forEach((r, i) => {
    console.log(`${i+1}. [${r.direction}] ${r.type} - "${r.preview || 'sem texto'}${r.preview?.length === 60 ? '...' : ''}"`);
  });
  
  await pool.end();
}

check().catch(console.error);
