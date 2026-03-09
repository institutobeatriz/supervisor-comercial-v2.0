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

const sttQueue = new Queue('stt', { connection });

async function checkAudioFormat() {
  const result = await pool.query(`
    SELECT id, media_url, media_mime
    FROM messages
    WHERE direction = 'inbound' 
      AND type = 'audio'
    LIMIT 1
  `);
  
  if (result.rows.length > 0) {
    console.log('Áudio:', result.rows[0]);
    console.log('\nMIME:', result.rows[0].media_mime);
    console.log('URL:', result.rows[0].media_url?.substring(0, 100));
  }
  
  await pool.end();
}

checkAudioFormat().catch(console.error);
