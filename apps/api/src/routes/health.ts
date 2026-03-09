/**
 * Health Check Route
 */

import type { FastifyPluginAsync } from 'fastify';
import { ping } from '@supervisor/db';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  async function checkHealth() {
    const dbOk = await ping();

    if (!dbOk) {
      return {
        statusCode: 503,
        payload: {
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      statusCode: 200,
      payload: {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    };
  }

  fastify.get('/health', async (_request, reply) => {
    const result = await checkHealth();
    return reply.status(result.statusCode).send(result.payload);
  });

  // Readiness endpoint para orquestração/healthcheck
  fastify.get('/ready', async (_request, reply) => {
    const result = await checkHealth();
    if (result.statusCode !== 200) {
      return reply.status(503).send({
        status: 'not_ready',
        ...result.payload,
      });
    }

    return {
      status: 'ready',
      database: result.payload.database,
      timestamp: result.payload.timestamp,
    };
  });
};

export default healthRoutes;
