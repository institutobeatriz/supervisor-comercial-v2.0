/**
 * SSE (Server-Sent Events) - Real-time dashboard updates
 * GET /events?sellerId=xxx
 *
 * Clients connect and receive events when conversations update.
 * Worker calls POST /internal/emit to push events.
 */
import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
});
redis.connect().catch((err: Error) => console.warn('[Cache] Redis cache connection failed in events.ts', err));

interface SseClient {
  id: string;
  sellerId: string | null;
  write: (data: string) => void;
  close: () => void;
}

// In-memory store of connected SSE clients
// In production, use Redis pub/sub for multi-instance deployments
const clients = new Map<string, SseClient>();

/**
 * Emit an event to all connected clients matching the sellerId filter.
 * Call this from worker processes via POST /internal/emit.
 */
export function emitSseEvent(
  event: string,
  data: unknown,
  sellerId?: string
): void {
  // Invalidate KPI cache on conversation updates so next request gets fresh data
  if (event === 'conversation_updated') {
    const today = new Date().toISOString().slice(0, 10);          // e.g. 2026-03-06
    const monthStart = today.slice(0, 8) + '01';                  // e.g. 2026-03-01

    // Invalidate both today-based and month-start-based keys (covers all period modes)
    for (const date of [today, monthStart]) {
      if (sellerId) {
        redis.del(`kpis:${sellerId}:${date}`).catch(() => {});
        redis.del(`funnel:${sellerId}:${date}`).catch(() => {});
        redis.del(`ranking:${sellerId}:${date}`).catch(() => {});
        redis.del(`losses:${sellerId}:${date}`).catch(() => {});
      }
      redis.del(`kpis:all:${date}`).catch(() => {});
      redis.del(`funnel:all:${date}`).catch(() => {});
      redis.del(`ranking:all:${date}`).catch(() => {});
      redis.del(`losses:all:${date}`).catch(() => {});
    }
  }

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;

  clients.forEach((client) => {
    // Send to all clients, or filter by sellerId if provided
    if (!sellerId || !client.sellerId || client.sellerId === sellerId) {
      try {
        client.write(payload);
        delivered++;
      } catch {
        // Client disconnected — clean up
        clients.delete(client.id);
      }
    }
  });

  if (delivered > 0) {
    console.log(`[SSE] Emitted event "${event}" to ${delivered} client(s)`);
  }
}

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /events — SSE stream ──────────────────────────────────────────────
  fastify.get('/events', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
    });
    reply.raw.flushHeaders();

    const clientId = crypto.randomUUID();

    const client: SseClient = {
      id: clientId,
      sellerId: sellerId || null,
      write: (data: string) => reply.raw.write(data),
      close: () => {
        try { reply.raw.end(); } catch { /* ignore */ }
      },
    };

    clients.set(clientId, client);
    console.log(`[SSE] Client connected: ${clientId} (seller: ${sellerId || 'all'})`);

    // Send initial connection confirmation
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ clientId, connectedAt: new Date().toISOString() })}\n\n`);

    // Keepalive ping every 25 seconds
    const pingInterval = setInterval(() => {
      try {
        reply.raw.write(`: ping\n\n`);
      } catch {
        clearInterval(pingInterval);
        clients.delete(clientId);
      }
    }, 25000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(pingInterval);
      clients.delete(clientId);
      console.log(`[SSE] Client disconnected: ${clientId}`);
    });

    // Keep the request open — never resolve this promise
    await new Promise<never>(() => {});
  });

  // ─── POST /internal/emit — called by workers to push events ───────────────
  // This endpoint should only be accessible internally (bind to 127.0.0.1 or use auth)
  fastify.post('/internal/emit', async (request, reply) => {
    const internalKey = process.env.INTERNAL_API_KEY;
    if (internalKey && request.headers['x-internal-key'] !== internalKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { event, data, sellerId } = request.body as {
      event: string;
      data: unknown;
      sellerId?: string;
    };

    if (!event || typeof event !== 'string') {
      return reply.status(400).send({ error: 'event is required' });
    }

    emitSseEvent(event, data, sellerId);
    return { ok: true, clients: clients.size };
  });

  // ─── GET /events/stats — debug endpoint ───────────────────────────────────
  fastify.get('/events/stats', async () => {
    return {
      connected_clients: clients.size,
      clients: Array.from(clients.values()).map(c => ({
        id: c.id,
        sellerId: c.sellerId,
      })),
    };
  });
};

export default eventsRoutes;
