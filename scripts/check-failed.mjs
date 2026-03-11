import 'dotenv/config';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const match = REDIS_URL.match(/redis:\/\/([^:]+):(\d+)/);
const connection = match ? { host: match[1], port: parseInt(match[2]) } : { host: 'localhost', port: 6379 };

const classifyQueue = new Queue('classify', { connection });

async function checkFailed() {
  const failed = await classifyQueue.getJobs(['failed'], 0, 10);
  
  for (const job of failed) {
    console.log('❌ Job ID:', job.id);
    console.log('Dados:', job.data);
    console.log('Erro:', job.failedReason);
    console.log('Stack:', job.stacktrace?.slice(0, 500));
    console.log('---');
  }
  
  process.exit(0);
}

checkFailed().catch(console.error);
