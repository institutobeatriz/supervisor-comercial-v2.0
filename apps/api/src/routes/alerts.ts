/**
 * Alertas em Tempo Real — Supervisor Comercial v2.0
 * Suporta REST (GET /alerts) e SSE (GET /alerts/stream)
 */

import { FastifyPluginAsync } from 'fastify';
import { query } from '@supervisor/db';

interface Alert {
  id: string;
  tipo: 'urgente' | 'alerta' | 'info';
  titulo: string;
  lead: string;
  telefone?: string;
  acao: string;
  tempo?: string;
  score?: number;
  seller_name?: string;
  conversation_id: string;
  created_at: Date;
}

const HIGH_URGENCY_THRESHOLD = 3; // Persistido em message_labels no range 1..3
const NEGATIVE_SENTIMENT_THRESHOLD = 2; // Escala 1..5

// ============================================================
// Função central: constrói todos os alertas a partir do DB
// Reutilizada pelo REST e pelo SSE
// ============================================================

async function buildAlerts(): Promise<{
  urgentes: number;
  alertas_count: number;
  infos: number;
  alertas: Alert[];
}> {
  const alerts: Alert[] = [];

  // ── 1. Leads quentes sem resposta há mais de 30 min ───────────────────────
  const hotLeadsNoResponse = await query<any>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164,
      EXTRACT(EPOCH FROM (NOW() - m.timestamp)) / 60 as minutes_since_last,
      ci.quality_score
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    JOIN LATERAL (
      SELECT m.timestamp, m.direction
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.timestamp DESC
      LIMIT 1
    ) m ON true
    WHERE c.status = 'open'
      AND ci.quality_score >= 80
      AND m.direction = 'inbound'
      AND m.timestamp < NOW() - INTERVAL '30 minutes'
    ORDER BY minutes_since_last DESC
    LIMIT 10`
  );

  for (const row of hotLeadsNoResponse.rows) {
    alerts.push({
      id: `hot-no-response-${row.conversation_id}`,
      tipo: 'urgente',
      titulo: 'Lead quente sem resposta',
      lead: row.contact_name,
      telefone: row.phone_e164?.substring(0, 8) + '...',
      acao: 'Responder agora',
      tempo: `${Math.round(row.minutes_since_last)}min`,
      score: row.quality_score,
      conversation_id: row.conversation_id,
      created_at: new Date(),
    });
  }

  // ── 2. Alta urgência detectada pela IA ───────────────────────────────────
  const highUrgency = await query<any>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164,
      ml.urgency,
      ml.attention_reason
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN messages m ON m.conversation_id = c.id
    JOIN message_labels ml ON ml.message_id = m.id
    WHERE c.status = 'open'
      AND ml.urgency >= $1
      AND ml.needs_attention = true
      AND m.timestamp > NOW() - INTERVAL '2 hours'
      AND m.direction = 'inbound'
    ORDER BY ml.urgency DESC, m.timestamp DESC
    LIMIT 5`,
    [HIGH_URGENCY_THRESHOLD]
  );

  for (const row of highUrgency.rows) {
    alerts.push({
      id: `urgent-${row.conversation_id}`,
      tipo: 'urgente',
      titulo: row.attention_reason || 'Alta urgência detectada',
      lead: row.contact_name,
      telefone: row.phone_e164?.substring(0, 8) + '...',
      acao: 'Atender agora',
      conversation_id: row.conversation_id,
      created_at: new Date(),
    });
  }

  // ── 3. Lead de alto valor estagnado (proposta/fechamento por 3+ dias) ────
  const stagnantLeads = await query<any>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164,
      c.funnel_stage,
      EXTRACT(EPOCH FROM (NOW() - c.last_message_at)) / 86400 as days_stagnant,
      COALESCE(so.value_cents, 0) as value_cents,
      COALESCE(ci.quality_score, 0) as quality_score
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE c.status = 'open'
      AND c.funnel_stage IN ('proposta', 'fechamento')
      AND c.last_message_at < NOW() - INTERVAL '3 days'
      AND (so.value_cents > 50000 OR ci.quality_score >= 70)
    ORDER BY value_cents DESC, days_stagnant DESC
    LIMIT 8`
  );

  for (const row of stagnantLeads.rows) {
    const stageLabel = row.funnel_stage === 'proposta' ? 'Proposta' : 'Fechamento';
    const valueFmt = row.value_cents > 0
      ? ` • R$ ${(row.value_cents / 100).toLocaleString('pt-BR')}`
      : '';
    alerts.push({
      id: `stagnant-${row.conversation_id}`,
      tipo: 'alerta',
      titulo: `Lead parado em ${stageLabel} há ${Math.round(row.days_stagnant)} dias${valueFmt}`,
      lead: row.contact_name,
      telefone: row.phone_e164?.substring(0, 8) + '...',
      acao: 'Avançar negociação',
      tempo: `${Math.round(row.days_stagnant)}d parado`,
      score: row.quality_score || undefined,
      conversation_id: row.conversation_id,
      created_at: new Date(),
    });
  }

  // ── 4. Conversas com sentimento negativo ─────────────────────────────────
  const negativeSentiment = await query<any>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN messages m ON m.conversation_id = c.id
    JOIN message_labels ml ON ml.message_id = m.id
    WHERE c.status = 'open'
      AND ml.sentiment <= $1
      AND m.timestamp > NOW() - INTERVAL '1 hour'
      AND m.direction = 'inbound'
    ORDER BY m.timestamp DESC
    LIMIT 5`,
    [NEGATIVE_SENTIMENT_THRESHOLD]
  );

  for (const row of negativeSentiment.rows) {
    alerts.push({
      id: `negative-${row.conversation_id}`,
      tipo: 'alerta',
      titulo: 'Conversa com sentimento negativo detectado',
      lead: row.contact_name,
      telefone: row.phone_e164?.substring(0, 8) + '...',
      acao: 'Ver conversa',
      conversation_id: row.conversation_id,
      created_at: new Date(),
    });
  }

  // ── 5. Follow-ups esquecidos (+7 dias) ───────────────────────────────────
  const forgottenFollowups = await query<any>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164,
      EXTRACT(EPOCH FROM (NOW() - c.last_message_at)) / 86400 as days_since
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.status = 'open'
      AND c.last_message_at < NOW() - INTERVAL '7 days'
    ORDER BY days_since DESC
    LIMIT 10`
  );

  for (const row of forgottenFollowups.rows) {
    alerts.push({
      id: `forgotten-${row.conversation_id}`,
      tipo: 'alerta',
      titulo: 'Lead esquecido há mais de 7 dias',
      lead: row.contact_name,
      telefone: row.phone_e164?.substring(0, 8) + '...',
      acao: 'Reativar conversa',
      tempo: `${Math.round(row.days_since)} dias`,
      conversation_id: row.conversation_id,
      created_at: new Date(),
    });
  }

  // ── 6. Vendedor abaixo do ritmo da meta ──────────────────────────────────
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  if (dayOfMonth >= 5) { // só depois do dia 5 para ter dados suficientes
    const paceCheck = await query<any>(
      `SELECT
        s.id as seller_id,
        s.name as seller_name,
        s.monthly_goal_cents,
        COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won'
          AND so.updated_at >= date_trunc('month', NOW())), 0) as revenue_mtd
      FROM sellers s
      LEFT JOIN conversations c ON c.seller_id = s.id
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
      WHERE s.active = true
      GROUP BY s.id, s.name, s.monthly_goal_cents`
    );

    for (const row of paceCheck.rows) {
      const goal = parseInt(row.monthly_goal_cents) || 5000000;
      const revenue = parseInt(row.revenue_mtd) || 0;
      const expectedByNow = goal * monthProgress;
      const pacePct = expectedByNow > 0 ? (revenue / expectedByNow) * 100 : 100;

      if (pacePct < 70) {
        const shortfall = Math.round((expectedByNow - revenue) / 100);
        alerts.push({
          id: `behind-pace-${row.seller_id}`,
          tipo: pacePct < 40 ? 'urgente' : 'info',
          titulo: `${row.seller_name} abaixo do ritmo da meta (${Math.round(pacePct)}% do esperado)`,
          lead: `Faltam R$ ${shortfall.toLocaleString('pt-BR')} para o ritmo esperado`,
          acao: 'Ver forecast',
          seller_name: row.seller_name,
          conversation_id: '',
          created_at: new Date(),
        });
      }
    }
  }

  // ── 7. Queda brusca de conversão esta semana vs semana anterior ──────────
  const conversionDrop = await query<any>(
    `SELECT
      c.seller_id,
      s.name as seller_name,
      COUNT(*) FILTER (WHERE so.outcome = 'won'
        AND so.updated_at >= NOW() - INTERVAL '7 days') as wins_this_week,
      COUNT(*) FILTER (WHERE so.outcome IN ('won','lost')
        AND so.updated_at >= NOW() - INTERVAL '7 days') as closed_this_week,
      COUNT(*) FILTER (WHERE so.outcome = 'won'
        AND so.updated_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') as wins_last_week,
      COUNT(*) FILTER (WHERE so.outcome IN ('won','lost')
        AND so.updated_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') as closed_last_week
    FROM sales_outcomes so
    JOIN conversations c ON c.id = so.conversation_id
    JOIN sellers s ON s.id = c.seller_id
    WHERE s.active = true
    GROUP BY c.seller_id, s.name`
  );

  for (const row of conversionDrop.rows) {
    const winsNow = parseInt(row.wins_this_week) || 0;
    const closedNow = parseInt(row.closed_this_week) || 0;
    const winsPrev = parseInt(row.wins_last_week) || 0;
    const closedPrev = parseInt(row.closed_last_week) || 0;

    if (closedPrev < 3) continue; // dados insuficientes

    const convNow = closedNow > 0 ? (winsNow / closedNow) * 100 : 0;
    const convPrev = closedPrev > 0 ? (winsPrev / closedPrev) * 100 : 0;

    if (convPrev > 0 && convNow < convPrev * 0.7) {
      const drop = Math.round(convPrev - convNow);
      alerts.push({
        id: `conv-drop-${row.seller_id}`,
        tipo: 'info',
        titulo: `Queda de ${drop}% na conversão de ${row.seller_name} esta semana`,
        lead: `${convPrev.toFixed(0)}% → ${convNow.toFixed(0)}% (vs semana anterior)`,
        acao: 'Analisar desempenho',
        seller_name: row.seller_name,
        conversation_id: '',
        created_at: new Date(),
      });
    }
  }

  // Ordenar por prioridade: urgente → alerta → info
  const priorityOrder: Record<string, number> = { urgente: 0, alerta: 1, info: 2 };
  alerts.sort((a, b) => priorityOrder[a.tipo] - priorityOrder[b.tipo]);

  return {
    urgentes: alerts.filter(a => a.tipo === 'urgente').length,
    alertas_count: alerts.filter(a => a.tipo === 'alerta').length,
    infos: alerts.filter(a => a.tipo === 'info').length,
    alertas: alerts,
  };
}

// ============================================================
// Rotas
// ============================================================

export const alertsRoutes: FastifyPluginAsync = async (fastify) => {

  // REST — snapshot de alertas
  fastify.get('/alerts', async (_request, _reply) => {
    return buildAlerts();
  });

  // SSE — stream de alertas em tempo real (a cada 30 segundos)
  fastify.get('/alerts/stream', (request, reply) => {
    const res = reply.raw;
    const req = request.raw;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    const sendAlerts = async () => {
      try {
        const data = await buildAlerts();
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // ignora erros temporários
      }
    };

    // Envio imediato
    sendAlerts();

    // Envio a cada 30 segundos
    const dataInterval = setInterval(sendAlerts, 30_000);

    // Keepalive a cada 15 segundos (evita timeout de proxies)
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15_000);

    // Cleanup quando o cliente desconecta
    req.on('close', () => {
      clearInterval(dataInterval);
      clearInterval(keepAlive);
    });

    // Mantém a promise aberta até o cliente fechar
    return new Promise<void>((resolve) => {
      req.on('close', resolve);
    });
  });

  // Histórico de alertas resolvidos
  fastify.get('/alerts/history', async (request, _reply) => {
    const limit = parseInt((request.query as any).limit) || 20;
    const result = await query<any>(
      `SELECT
        ah.*,
        COALESCE(ct.display_name, ct.phone_e164) as contact_name
      FROM alert_history ah
      LEFT JOIN conversations c ON c.id = ah.conversation_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      ORDER BY ah.resolved_at DESC
      LIMIT $1`,
      [limit]
    );
    return result.rows;
  });
};

export default alertsRoutes;
