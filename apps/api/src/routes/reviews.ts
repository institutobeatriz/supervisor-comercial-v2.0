/**
 * Rotas de Revisão Humana
 * Supervisor Comercial v2.0
 */

import { FastifyPluginAsync } from 'fastify';
import {
  getPendingReviews,
  getReviewById,
  approveReview,
  rejectReview,
  getReviewStats,
} from '@supervisor/db';

async function verifyAdmin(request: any, reply: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const isDev = process.env.NODE_ENV === 'development';

  if (!adminKey) {
    if (isDev) return true;
    reply.code(503).send({ error: 'ADMIN_API_KEY not configured' });
    return false;
  }

  const key = request.headers['x-admin-key'] || request.query?.adminKey;
  if (key !== adminKey) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export const reviewsRoutes: FastifyPluginAsync = async (fastify) => {
  // Listar revisões pendentes
  fastify.get('/reviews', async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const limit = parseInt((request.query as any).limit) || 50;
    const offset = parseInt((request.query as any).offset) || 0;

    const reviews = await getPendingReviews(limit, offset);
    return { value: reviews };
  });

  // Estatísticas de revisões
  fastify.get('/reviews/stats', async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const stats = await getReviewStats();
    return stats;
  });

  // Buscar revisão por ID
  fastify.get('/reviews/:id', async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const { id } = request.params as { id: string };
    const review = await getReviewById(id);

    if (!review) {
      reply.code(404).send({ error: 'Review not found' });
      return;
    }

    return review;
  });

  // Aprovar revisão
  fastify.post('/reviews/:id/approve', async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const { id } = request.params as { id: string };
    const body = request.body as {
      finalOutcome?: string;
      finalValueCents?: number;
      notes?: string;
    };

    const reviewer = (request.headers['x-reviewer-name'] as string) || 'Admin';

    const review = await approveReview(
      id,
      reviewer,
      body?.finalOutcome || 'approved',
      body?.finalValueCents,
      body?.notes
    );

    if (!review) {
      reply.code(404).send({ error: 'Review not found or already processed' });
      return;
    }

    return { success: true, review };
  });

  // Rejeitar revisão
  fastify.post('/reviews/:id/reject', async (request, reply) => {
    if (!(await verifyAdmin(request, reply))) return;

    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string };

    const reviewer = (request.headers['x-reviewer-name'] as string) || 'Admin';

    const review = await rejectReview(id, reviewer, body?.notes);

    if (!review) {
      reply.code(404).send({ error: 'Review not found or already processed' });
      return;
    }

    return { success: true, review };
  });
};

export default reviewsRoutes;
