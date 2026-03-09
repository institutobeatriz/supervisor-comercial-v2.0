// Debug Worker - Versão mínima
import 'dotenv/config';
import { Worker } from 'bullmq';

console.log('1. Starting...');
console.log('2. PID:', process.pid);

const connection = { host: 'localhost', port: 6379 };

console.log('3. Creating worker...');
const worker = new Worker('test', async () => {}, { connection });
console.log('4. Worker created');

worker.on('error', (err) => console.log('ERROR:', err));

console.log('5. Setting up keep-alive...');

// Critical test
const keepAlive = setInterval(() => {
  console.log('HEARTBEAT');
}, 5000);

console.log('6. Interval set');
console.log('7. About to call resume...');

process.stdin.resume();

console.log('8. Resume called');
console.log('9. End of script');
