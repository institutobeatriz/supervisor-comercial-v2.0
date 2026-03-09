// Worker Entry Point - Mantém processo vivo
import 'dotenv/config';

console.log('[Worker] Starting compiled worker...');

// Import the compiled worker
import('./dist/worker.mjs').catch(err => {
  console.error('[Worker] Import error:', err);
  process.exit(1);
});

// Keep process alive explicitly
setInterval(() => {
  // Heartbeat
}, 60000);

process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled:', reason);
});
