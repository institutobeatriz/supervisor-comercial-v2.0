import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const labels = await pool.query(`SELECT COUNT(*) as count FROM message_labels`);
  console.log('Labels:', labels.rows[0]);
  
  const stages = await pool.query(`
    SELECT funnel_stage, COUNT(*) as count 
    FROM message_labels 
    GROUP BY funnel_stage
  `);
  console.log('Estágios:', stages.rows);
  
  const outcomes = await pool.query(`SELECT COUNT(*) as count FROM sales_outcomes`);
  console.log('Outcomes:', outcomes.rows[0]);
  
  await pool.end();
}

check().catch(console.error);
