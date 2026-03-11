import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const result = await pool.query(`
    SELECT ml.funnel_stage, ml.intent, ml.needs_attention, 
           LEFT(m.text, 100) as text_preview
    FROM message_labels ml
    JOIN messages m ON m.id = ml.message_id
  `);
  
  console.log('Mensagens classificadas:');
  result.rows.forEach((r, i) => {
    console.log(`${i+1}. [${r.funnel_stage}] ${r.intent} - "${r.text_preview}..."`);
  });
  
  await pool.end();
}

check().catch(console.error);
