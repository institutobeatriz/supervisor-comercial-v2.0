/**
 * Worker - BullMQ Jobs
 * Supervisor Comercial
 */
import { Worker, Queue } from 'bullmq';
import cron from 'node-cron';
import { ping } from '@supervisor/db';
// Jobs
import { sttJob } from './jobs/stt.js';
import { classifyJob } from './jobs/classify.js';
import { analyzeJob } from './jobs/analyze.js';
import { ragIndexJob } from './jobs/rag-index.js';
import { reportDailyJob, reportWeeklyJob } from './jobs/report.js';
// ============================================================
// CONFIG
// ============================================================
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');
const TIMEZONE = process.env.SCHEDULER_TIMEZONE || 'America/Sao_Paulo';
// Parse Redis URL
function parseRedisUrl(url) {
    const match = url.match(/redis:\/\/([^:]+):(\d+)/);
    if (match) {
        return { host: match[1], port: parseInt(match[2]) };
    }
    return { host: 'localhost', port: 6379 };
}
const redisConfig = parseRedisUrl(REDIS_URL);
// ============================================================
// QUEUES
// ============================================================
const connection = {
    host: redisConfig.host,
    port: redisConfig.port,
};
export const queues = {
    stt: new Queue('stt', { connection }),
    classify: new Queue('classify', { connection }),
    analyze: new Queue('analyze', { connection }),
    ragIndex: new Queue('rag-index', { connection }),
    report: new Queue('report', { connection }),
};
// ============================================================
// WORKERS
// ============================================================
function createWorkers() {
    // STT Worker
    const sttWorker = new Worker('stt', async (job) => sttJob(job.data), { connection, concurrency: CONCURRENCY });
    // Classify Worker
    const classifyWorker = new Worker('classify', async (job) => classifyJob(job.data), { connection, concurrency: CONCURRENCY });
    // Analyze Worker
    const analyzeWorker = new Worker('analyze', async (job) => analyzeJob(job.data), { connection, concurrency: 2 } // Menos concorrência para análise
    );
    // RAG Index Worker
    const ragIndexWorker = new Worker('rag-index', async (job) => ragIndexJob(job.data), { connection, concurrency: 2 });
    // Report Worker
    const reportWorker = new Worker('report', async (job) => {
        if (job.name === 'daily') {
            return reportDailyJob(job.data);
        }
        else if (job.name === 'weekly') {
            return reportWeeklyJob(job.data);
        }
    }, { connection, concurrency: 1 });
    // Error handlers
    const workers = [sttWorker, classifyWorker, analyzeWorker, ragIndexWorker, reportWorker];
    workers.forEach(worker => {
        worker.on('completed', (job) => {
            console.log(`[Worker] ✓ Job ${job.name} completed`);
        });
        worker.on('failed', (job, err) => {
            console.error(`[Worker] ✗ Job ${job?.name} failed:`, err.message);
        });
    });
    return workers;
}
// ============================================================
// SCHEDULER (Cron)
// ============================================================
function startScheduler() {
    // Daily report - 23:55 America/Sao_Paulo
    const dailyTime = process.env.REPORT_DAILY_TIME || '23:55';
    const [dailyHour, dailyMin] = dailyTime.split(':');
    cron.schedule(`${dailyMin} ${dailyHour} * * *`, async () => {
        console.log('[Scheduler] Running daily report job...');
        await queues.report.add('daily', { date: new Date().toISOString().split('T')[0] });
    }, { timezone: TIMEZONE });
    // Weekly report - Sunday 23:58
    const weeklyTime = process.env.REPORT_WEEKLY_TIME || '23:58';
    const [weeklyHour, weeklyMin] = weeklyTime.split(':');
    cron.schedule(`${weeklyMin} ${weeklyHour} * * 0`, async () => {
        console.log('[Scheduler] Running weekly report job...');
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day;
        const weekStart = new Date(now.setDate(diff)).toISOString().split('T')[0];
        await queues.report.add('weekly', { weekStart });
    }, { timezone: TIMEZONE });
    console.log(`[Scheduler] Started with timezone ${TIMEZONE}`);
}
// ============================================================
// START
// ============================================================
async function start() {
    console.log('[Worker] Starting...');
    // Test DB
    const dbOk = await ping();
    if (!dbOk) {
        console.error('[Worker] ✗ Database connection failed');
        process.exit(1);
    }
    console.log('[Worker] ✓ Database connected');
    // Create workers
    const workers = createWorkers();
    console.log(`[Worker] ✓ ${workers.length} workers started`);
    // Start scheduler
    startScheduler();
    console.log('[Worker] ✓ Ready to process jobs');
    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
        process.on(signal, async () => {
            console.log(`[Worker] ${signal} received, shutting down...`);
            await Promise.all(workers.map(w => w.close()));
            await Promise.all(Object.values(queues).map(q => q.close()));
            process.exit(0);
        });
    });
}
start();
//# sourceMappingURL=index.js.map