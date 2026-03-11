/**
 * Conversations Routes - Dados reais
 * Suporta: search, stage filter, paginação e detalhe de mensagens
 */
import type { FastifyInstance } from 'fastify';
import { query } from '@supervisor/db';

interface ConversationRow {
  id: string;
  contact_id: string;
  seller_id: string;
  status: string;
  funnel_stage: string;
  last_message_at: Date | null;
  created_at: Date;
  phone_e164: string;
  contact_name: string;
  seller_name: string;
  outcome: string | null;
  quality_score: number | null;
  temperature: string | null;
  urgency_score: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  text: string | null;
  timestamp: Date;
  media_type: string | null;
  sentiment: string | null;
  is_purchase_intent: boolean | null;
}

export async function conversationsRoutes(app: FastifyInstance) {
  // ─── GET /conversations — lista com filtros, busca e paginação ─────────────
  app.get('/conversations', async (request) => {
    const q = request.query as {
      sellerId?: string
      search?: string
      stage?: string
      limit?: string
      offset?: string
      periodMode?: string
      date?: string
      month?: string
    };

    const limit = Math.min(parseInt(q.limit || '50'), 200);
    const offset = parseInt(q.offset || '0');

    let sql = `
      SELECT
        c.id, c.contact_id, c.seller_id, c.status, c.funnel_stage,
        c.last_message_at, c.created_at,
        ct.phone_e164,
        COALESCE(ct.display_name, ct.phone_e164, 'Cliente') as contact_name,
        s.name as seller_name,
        so.outcome,
        ci.quality_score,
        ci.temperature,
        ci.urgency_score
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      JOIN sellers s ON s.id = c.seller_id
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
      LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let idx = 1;

    if (q.sellerId && q.sellerId !== 'all') {
      sql += ` AND c.seller_id = $${idx++}`;
      params.push(q.sellerId);
    }

    // Filtro de período
    if (q.periodMode === 'day' && q.date) {
      sql += ` AND c.last_message_at::date = $${idx++}`;
      params.push(q.date);
    } else if (q.periodMode === 'month' && q.month) {
      sql += ` AND to_char(c.last_message_at, 'YYYY-MM') = $${idx++}`;
      params.push(q.month);
    }

    // Busca por nome ou telefone
    if (q.search && q.search.trim()) {
      const term = `%${q.search.trim()}%`;
      sql += ` AND (ct.display_name ILIKE $${idx} OR ct.phone_e164 ILIKE $${idx} OR s.name ILIKE $${idx})`;
      params.push(term);
      idx++;
    }

    // Filtro por estágio
    if (q.stage && q.stage !== 'all') {
      sql += ` AND c.funnel_stage = $${idx++}`;
      params.push(q.stage);
    }

    // Contagem total (para paginação)
    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM conversations c/,
      'SELECT COUNT(*) as total FROM conversations c'
    );
    const countResult = await query<{ total: string }>(countSql, params);
    const total = parseInt(countResult.rows[0]?.total || '0');

    sql += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query<ConversationRow>(sql, params);
    const ids = result.rows.map(r => r.id);

    let lastMessages: Record<string, string> = {};
    let msgCounts: Record<string, number> = {};

    if (ids.length > 0) {
      const [lastMsgResult, countMsgResult] = await Promise.all([
        query<{ conversation_id: string; text: string }>(
          `SELECT DISTINCT ON (conversation_id) conversation_id,
            COALESCE(text, '[mídia]') as text
           FROM messages
           WHERE conversation_id = ANY($1)
           ORDER BY conversation_id, timestamp DESC`,
          [ids]
        ),
        query<{ conversation_id: string; count: string }>(
          `SELECT conversation_id, COUNT(*) as count
           FROM messages WHERE conversation_id = ANY($1)
           GROUP BY conversation_id`,
          [ids]
        ),
      ]);
      lastMessages = lastMsgResult.rows.reduce((acc, m) => {
        acc[m.conversation_id] = m.text;
        return acc;
      }, {} as Record<string, string>);
      msgCounts = countMsgResult.rows.reduce((acc, r) => {
        acc[r.conversation_id] = parseInt(r.count);
        return acc;
      }, {} as Record<string, number>);
    }

    const formatted = result.rows.map(c => ({
      id: c.id,
      contact_name: c.contact_name || 'Cliente',
      contact_phone: c.phone_e164 || '',
      seller_name: c.seller_name || 'Vendedor',
      seller_id: c.seller_id,
      last_message: lastMessages[c.id]?.substring(0, 120) || 'Sem mensagens',
      last_message_at: c.last_message_at || c.created_at,
      message_count: msgCounts[c.id] || 0,
      stage: c.funnel_stage || 'novo',
      status: c.status || 'aberta',
      outcome: c.outcome || null,
      quality_score: c.quality_score || null,
      temperature: c.temperature || null,
      urgency_score: c.urgency_score || null,
    }));

    return { value: formatted, count: formatted.length, total, offset, limit };
  });

  // ─── GET /conversations/:id — detalhe completo ────────────────────────────
  app.get('/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const convResult = await query<ConversationRow>(`
      SELECT
        c.id, c.contact_id, c.seller_id, c.status, c.funnel_stage,
        c.last_message_at, c.created_at,
        ct.phone_e164,
        COALESCE(ct.display_name, ct.phone_e164, 'Cliente') as contact_name,
        s.name as seller_name,
        so.outcome,
        ci.quality_score, ci.temperature, ci.urgency_score
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      JOIN sellers s ON s.id = c.seller_id
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
      LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
      WHERE c.id = $1
    `, [id]);

    if (convResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Conversa não encontrada' });
    }

    const conv = convResult.rows[0];

    // Mensagens da conversa
    const msgResult = await query<MessageRow>(`
      SELECT
        m.id,
        m.conversation_id,
        CASE WHEN m.direction = 'outbound' THEN 'assistant' ELSE 'user' END as role,
        COALESCE(m.text, '[mídia]') as text,
        m.timestamp,
        m.type as media_type,
        CASE
          WHEN ml.sentiment >= 4 THEN 'positive'
          WHEN ml.sentiment <= 2 THEN 'negative'
          WHEN ml.sentiment IS NULL THEN NULL
          ELSE 'neutral'
        END as sentiment,
        CASE WHEN ml.intent = 'compra' THEN true ELSE false END as is_purchase_intent
      FROM messages m
      LEFT JOIN message_labels ml ON ml.message_id = m.id
      WHERE m.conversation_id = $1
      ORDER BY m.timestamp ASC
      LIMIT 500
    `, [id]);

    // Insights de mensagens classificadas
    const insightsResult = await query<{
      total: string; classified: string; purchase_intents: string; avg_sentiment: string
    }>(`
      SELECT
        COUNT(m.id) as total,
        COUNT(ml.message_id) as classified,
        SUM(CASE WHEN ml.intent = 'compra' THEN 1 ELSE 0 END) as purchase_intents,
        AVG(ml.sentiment::numeric) as avg_sentiment
      FROM messages m
      LEFT JOIN message_labels ml ON ml.message_id = m.id
      WHERE m.conversation_id = $1
    `, [id]);

    const insights = insightsResult.rows[0];

    return {
      conversation: {
        id: conv.id,
        contact_name: conv.contact_name,
        contact_phone: conv.phone_e164,
        seller_name: conv.seller_name,
        seller_id: conv.seller_id,
        stage: conv.funnel_stage || 'novo',
        status: conv.status,
        outcome: conv.outcome,
        quality_score: conv.quality_score,
        temperature: conv.temperature,
        urgency_score: conv.urgency_score,
        created_at: conv.created_at,
        last_message_at: conv.last_message_at,
      },
      messages: msgResult.rows.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        media_type: m.media_type,
        sentiment: m.sentiment,
        is_purchase_intent: m.is_purchase_intent,
      })),
      stats: {
        total_messages: parseInt(insights.total || '0'),
        classified: parseInt(insights.classified || '0'),
        purchase_intents: parseInt(insights.purchase_intents || '0'),
        avg_sentiment: parseFloat(insights.avg_sentiment || '0'),
      },
    };
  });
}
