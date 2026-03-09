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

async function processAudios() {
  console.log('🔊 Buscando áudios sem transcrição...\n');
  
  const result = await pool.query(`
    SELECT id, media_url, type
    FROM messages
    WHERE direction = 'inbound' 
      AND type = 'audio'
      AND (text IS NULL OR text = '')
      AND media_url IS NOT NULL
  `);
  
  console.log(`Encontrados ${result.rowCount} áudios para transcrever\n`);
  
  for (const audio of result.rows) {
    await sttQueue.add('transcribe', {
      messageId: audio.id,
      mediaUrl: audio.media_url
    });
    console.log(`✓ ${audio.id.substring(0, 8)}... - ${audio.media_url.substring(0, 50)}...`);
  }
  
  console.log(`\n✅ ${result.rowCount} jobs adicionados à fila STT`);
  
  await pool.end();
  process.exit(0);
}

processAudios().catch(console.error);
