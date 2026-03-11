import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const audios = await pool.query(`
    SELECT id, type, LEFT(text, 100) as text_preview
    FROM messages
    WHERE direction = 'inbound' AND type = 'audio'
  `);
  
  console.log('📊 Áudios inbound:', audios.rowCount);
  audios.rows.forEach((a, i) => {
    console.log(`${i+1}. ${a.id.substring(0,8)}... - "${a.text_preview || 'sem texto'}"`);
  });
  
  await pool.end();
}

check().catch(console.error);
