/**
 * API Server - Fastify
 * Supervisor Comercial
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { migrate, ping } from '@supervisor/db';
// Routes
import webhookRoutes from './routes/webhook.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';
// ============================================================
// CONFIG
// ============================================================
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.API_HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
// ============================================================
// FASTIFY APP
// ============================================================
async function buildApp() {
    const fastify = Fastify({
        logger: {
            level: NODE_ENV === 'production' ? 'info' : 'debug',
            transport: NODE_ENV === 'development' ? {
                target: 'pino-pretty',
                options: { colorize: true }
            } : undefined,
        },
    });
    // Plugins
    await fastify.register(helmet);
    await fastify.register(cors);
    // ============================================================
    // MIDDLEWARE - Timing
    // ============================================================
    fastify.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
    });
    fastify.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - (request.startTime || 0);
        reply.header('X-Response-Time', `${duration}ms`);
    });
    // ============================================================
    // ROUTES
    // ============================================================
    await fastify.register(healthRoutes);
    await fastify.register(webhookRoutes, { prefix: '/webhooks' });
    await fastify.register(adminRoutes, { prefix: '/admin' });
    // ============================================================
    // ERROR HANDLER
    // ============================================================
    fastify.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode || 500;
        fastify.log.error({
            error: error.message,
            stack: error.stack,
            url: request.url,
            method: request.method,
        });
        reply.status(statusCode).send({
            error: error.message,
            statusCode,
        });
    });
    return fastify;
}
// ============================================================
// START
// ============================================================
async function start() {
    console.log('[API] Starting...');
    // Test DB connection
    const dbOk = await ping();
    if (!dbOk) {
        console.error('[API] ✗ Database connection failed');
        process.exit(1);
    }
    console.log('[API] ✓ Database connected');
    // Run migrations
    try {
        await migrate();
        console.log('[API] ✓ Migrations applied');
    }
    catch (error) {
        console.error('[API] ✗ Migration failed:', error);
        process.exit(1);
    }
    // Build app
    const fastify = await buildApp();
    // Start server
    try {
        await fastify.listen({ port: PORT, host: HOST });
        console.log(`[API] ✓ Server running on http://${HOST}:${PORT}`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
        process.on(signal, async () => {
            console.log(`[API] ${signal} received, closing server...`);
            await fastify.close();
            process.exit(0);
        });
    });
}
// Export for testing
export { buildApp };
// Start if main
start();
//# sourceMappingURL=index.js.map