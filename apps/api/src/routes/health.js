/**
 * Health Check Route
 */
import { ping } from '@supervisor/db';
const healthRoutes = async (fastify) => {
    fastify.get('/health', async (request, reply) => {
        const dbOk = await ping();
        if (!dbOk) {
            return reply.status(503).send({
                status: 'unhealthy',
                database: 'disconnected',
            });
        }
        return {
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString(),
        };
    });
};
export default healthRoutes;
//# sourceMappingURL=health.js.map