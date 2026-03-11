import 'dotenv/config';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const match = REDIS_URL.match(/redis:\/\/([^:]+):(\d+)/);
const connection = match ? { host: match[1], port: parseInt(match[2]) } : { host: 'localhost', port: 6379 };

const classifyQueue = new Queue('classify', { connection });
const sttQueue = new Queue('stt', { connection });

async function check() {
  const classifyCounts = await classifyQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  const sttCounts = await sttQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  
  console.log('📊 Fila de Classificação:', classifyCounts);
  console.log('🎤 Fila de STT:', sttCounts);
  
  process.exit(0);
}

check().catch(console.error);
