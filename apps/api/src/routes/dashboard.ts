/**
 * Dashboard Data Routes
 * Fornece dados em tempo real para o dashboard do Supervisor Comercial
 */

import type { FastifyInstance } from 'fastify';
import {
  query,
  getExecutiveKpis,
  getLeadsByTemperature,
  getDailyEvolution,
  getFunnelStages,
  getConversionByStage,
  getLossReasons,
  getSellerRanking,
  getConversationMetrics,
  getObjectionsDetected,
  getFollowupStats, getConversationsNeedingFollowup, getSellerPerformanceFull, getLossStats, getSellerDetailedAnalysis, getFollowupFull, getObjectionResolutionRate,
  getSellerById,
  getDefaultSeller,
} from '@supervisor/db';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
});
redis.on('error', () => {}); // Suprime unhandled error event quando Redis está offline
redis.connect().catch((err: Error) => console.warn('[Cache] Redis offline - cache desativado:', err.message));

const NEGATIVE_SENTIMENT_THRESHOLD = 2; // Escala 1..5 (1=muito negativo)

async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Cache miss or Redis offline — continue without cache
  }
  const result = await fn();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch {
    // Failed to save cache — not critical
  }
  return result;
}

// Helper para calcular datas a partir do filtro de periodo
// Todas as datas são interpretadas no fuso horário do Brasil (BRT = UTC-3)
// Normaliza sellerId: 'all' ou vazio → undefined (sem filtro no SQL)
function normalizeSellerId(id?: string): string | undefined {
  if (!id || id === 'all') return undefined;
  return id;
}

// Normaliza query params aceitando aliases legacy (period, startDate)
function parseQuery(raw: Record<string, unknown>): {
  sellerId?: string; periodMode: string; date?: string; month?: string;
} {
  const r = raw as Record<string, string | undefined>;
  return {
    sellerId: normalizeSellerId(r.sellerId),
    periodMode: r.periodMode || r.period || 'month',
    date: r.date,
    // month: preferência explícita; ou deriva de startDate (YYYY-MM-DD → YYYY-MM)
    month: r.month || (r.startDate ? r.startDate.slice(0, 7) : undefined),
  };
}

function getPeriodDates(periodMode: string, date?: string, month?: string): { startDate: Date; endDate: Date } {
  if (periodMode === 'day' && date) {
    // date é YYYY-MM-DD no fuso do Brasil (UTC-3)
    // Meia-noite BRT = 03:00 UTC; fim do dia BRT = dia seguinte 02:59:59 UTC
    const [year, mon, day] = date.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, mon - 1, day, 3, 0, 0, 0)),
      endDate:   new Date(Date.UTC(year, mon - 1, day + 1, 2, 59, 59, 999)),
    };
  } else if (periodMode === 'month' && month) {
    const [year, monthNum] = month.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)),
    };
  } else {
    const now = new Date();
    return {
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    };
  }
}

export async function dashboardRoutes(app: FastifyInstance) {
  // ============================================================
  // KPIs principais (com filtros de periodo)
  // ============================================================
  app.get('/dashboard/kpis', async (request, reply) => {
    const { sellerId, periodMode, date, month } = parseQuery(request.query as Record<string, unknown>);
    
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);
    console.log('[KPIs] periodMode:', periodMode, 'month:', month, 'date:', date, 'startDate:', startDate?.toISOString(), 'endDate:', endDate?.toISOString());
    const cacheKey = `kpis:${sellerId || 'all'}:${startDate.toISOString().slice(0, 10)}`;
    const kpis = await cachedQuery(cacheKey, 30, () => getExecutiveKpis(sellerId, startDate, endDate));
    
    // Buscar meta do vendedor do banco
    let metaMes = 50000;
    if (sellerId) {
      const seller = await getSellerById(sellerId);
      if (seller && seller.monthly_goal_cents) {
        metaMes = seller.monthly_goal_cents / 100;
      }
    } else {
      const defaultSeller = await getDefaultSeller();
      if (defaultSeller && defaultSeller.monthly_goal_cents) {
        metaMes = defaultSeller.monthly_goal_cents / 100;
      }
    }
    
    // Buscar contatados (conversas iniciadas pelo vendedor) - query inline
    const contatadosResult = await query(`
      WITH primeira_msg AS (
        SELECT 
          m.conversation_id,
          m.direction,
          m.seller_id,
          m.timestamp,
          ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
        FROM messages m
      )
      SELECT COUNT(DISTINCT pm.conversation_id) as period
      FROM primeira_msg pm
      WHERE pm.rn = 1 
        AND pm.direction = 'outbound'
        AND ($1::uuid IS NULL OR pm.seller_id = $1)
        AND pm.timestamp >= $2 AND pm.timestamp <= $3
    `, [sellerId || null, startDate, endDate]);
    const contatados = parseInt((contatadosResult.rows[0] as { period: string })?.period || '0');

    // Reusa a mesma regra da camada DB: won / (won + lost) * 100
    const taxaConversao = Math.round((kpis.conversion_rate || 0) * 10) / 10;

    return {
      faturamentoMes: kpis.revenue_cents / 100,
      vendasQtd: kpis.sales_won,
      leadsRecebidos: kpis.leads_received,
      leadsAtendidos: kpis.leads_attended,
      leadsPerdidos: kpis.leads_lost,
      contatados: contatados,
      taxaConversao: taxaConversao,
      ticketMedio: kpis.ticket_avg_cents / 100,
      tempoMedioResposta: Math.round(kpis.avg_first_response_min) + 'min',
      metaMes: metaMes,
      metaAtingida: Math.round((kpis.revenue_cents / 100 / metaMes) * 100) + '%',
      resolucaoRate: '0%',
    };
  });

  // ============================================================
  // Funil comercial
  // ============================================================
  app.get('/dashboard/funnel', async (request, reply) => {
    const { sellerId, periodMode, date, month } = parseQuery(request.query as Record<string, unknown>);
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);

    const funnelCacheKey = `funnel:${sellerId || 'all'}:${startDate.toISOString().slice(0, 10)}`;
    const stages = await cachedQuery(funnelCacheKey, 30, () => getFunnelStages(sellerId));
    
    const temperatureResult = await query<any>(
      `SELECT 
        CASE 
          WHEN ci.quality_score >= 80 THEN 'quente'
          WHEN ci.quality_score >= 50 THEN 'morno'
          ELSE 'frio'
        END as temperature,
        COUNT(*) as count
      FROM conversations c
      LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
      WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY 1
      ORDER BY 1`,
      [sellerId || null]
    );
    
    const statsResult = await query<any>(
      `SELECT 
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT ml.id) as classified_messages,
        COUNT(DISTINCT CASE WHEN ml.intent IN ('compra', 'negociacao') THEN m.id END) as purchase_intents
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN message_labels ml ON ml.message_id = m.id
      WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)`,
      [sellerId || null]
    );
    
    const stageLabels: Record<string, string> = {
      lead: 'Lead',
      qualificacao: 'Qualificacao',
      proposta: 'Proposta',
      fechamento: 'Fechamento',
      pos_venda: 'Pos-venda',
    };
    
    const stageOrder = ['lead', 'qualificacao', 'proposta', 'fechamento', 'pos_venda'];
    const allStages = stageOrder.map(stage => {
      const found = stages.find(s => s.stage === stage);
      return {
        status: stageLabels[stage] || stage,
        qtd: found ? found.count.toString() : '0',
        valor: 'R$ ' + ((found?.value_cents || 0) / 100).toLocaleString('pt-BR'),
      };
    });
    
    const stats = statsResult.rows[0] || {};
    const temperatures = temperatureResult.rows.reduce((acc: any, t: any) => {
      acc[t.temperature] = parseInt(t.count) || 0;
      return acc;
    }, { quente: 0, morno: 0, frio: 0 });
    
    return {
      stages: allStages,
      temperature: temperatures,
      stats: {
        total_conversations: parseInt(stats.total_conversations) || 0,
        total_messages: parseInt(stats.total_messages) || 0,
        classified_messages: parseInt(stats.classified_messages) || 0,
        purchase_intents: parseInt(stats.purchase_intents) || 0,
      },
    };
  });

  // ============================================================
  // Vendedores / Performance
  // ============================================================
  app.get('/dashboard/sellers', async (request, reply) => {
    const { sellerId, periodMode, date, month } = request.query as { sellerId?: string; periodMode?: string; date?: string; month?: string; };
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);
    const rankingCacheKey = `ranking:${sellerId || 'all'}:${startDate.toISOString().slice(0, 10)}`;
    const ranking = await cachedQuery(rankingCacheKey, 30, () => getSellerRanking('revenue', 10, sellerId));
    
    const sellers = ranking.map(s => ({
      id: s.seller_id,
      name: s.seller_name,
      total_conversations: s.leads.toString(),
      vendas: s.conversions.toString(),
      faturamento: 'R$ ' + (s.revenue_cents / 100).toLocaleString('pt-BR'),
      qualidade_score: s.avg_quality.toFixed(1),
    }));
    
    return { value: sellers };
  });

  // ============================================================
  // Performance detalhada de vendedores
  // ============================================================
  app.get('/dashboard/sellers/detailed', async (request, reply) => {
    const { sellerId, periodMode, date, month } = request.query as { sellerId?: string; periodMode?: string; date?: string; month?: string; };
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);
    const ranking = await getSellerRanking('revenue', 10, sellerId);
    
    const sellers = ranking.map(s => ({
      seller_id: s.seller_id,
      seller_name: s.seller_name,
      leads: s.leads,
      conversations: s.leads,
      vendas: s.conversions,
      revenue_cents: s.revenue_cents,
      ticket_medio_cents: s.revenue_cents / Math.max(s.conversions, 1),
      conversion_rate: s.conversion_rate,
      avg_quality: s.avg_quality,
      meta_mensal: 5000000,
      projecao_mensal: 0,
      dias_trabalhados: 1,
      dias_uteis_mes: 22,
      daily_stats: [],
    }));
    
    return { value: sellers };
  });

  // ============================================================
  // Conversas recentes
  // ============================================================
  app.get('/dashboard/conversations/recent', async (request, reply) => {
    const { sellerId, limit = 10 } = request.query as { sellerId?: string; limit?: number };
    const conversations = await getConversationsNeedingFollowup(sellerId, limit);
    
    return conversations.map(c => ({
      id: c.conversation_id,
      contact_name: c.contact_name,
      contact_phone: '',
      status: 'pending',
      score: c.quality_score,
      last_message: c.next_action,
      last_message_at: c.last_message_at.toISOString(),
    }));
  });

  // ============================================================
  // Objeções detectadas
  // ============================================================
  app.get('/dashboard/objections', async (request, reply) => {
    const { sellerId, limit = 10 } = request.query as { sellerId?: string; limit?: number; };
    const objections = await getObjectionsDetected(sellerId, limit);
    return objections.map(o => ({ objeção: o.objection, count: o.count.toString(), resolucao_rate: '0%' }));
  });

  // ============================================================
  // Motivos de ganho/perda
  // ============================================================
  app.get('/dashboard/win-loss-reasons', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string; };
    const today = new Date().toISOString().slice(0, 10);
    const lossCacheKey = `losses:${sellerId || 'all'}:${today}`;
    const lossReasons = await cachedQuery(lossCacheKey, 30, () => getLossReasons(sellerId, 10));
    return {
      wins: [],
      losses: lossReasons.map(r => ({ motivo: r.reason, count: r.count.toString(), percentual: r.percentage + '%' })),
    };
  });

  // ============================================================
  // Follow-ups pendentes
  // ============================================================
  app.get('/dashboard/followups', async (request, reply) => {
    const { sellerId, limit = 20 } = request.query as { sellerId?: string; limit?: number };
    const conversations = await getConversationsNeedingFollowup(sellerId, limit);
    
    return conversations.map(c => {
      const daysSince = Math.floor((Date.now() - c.last_message_at.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: c.conversation_id,
        contact_name: c.contact_name,
        contact_phone: '',
        score: c.quality_score,
        temperature: c.quality_score >= 80 ? 'hot' : c.quality_score >= 50 ? 'warm' : 'cold',
        last_contact: c.last_message_at.toISOString(),
        days_since_contact: daysSince.toString(),
      };
    });
  });

  // ============================================================
  // Alertas em tempo real
  // ============================================================
  app.get('/dashboard/alerts', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    const conversations = await getConversationsNeedingFollowup(sellerId, 5);
    return conversations.map(c => ({
      tipo: 'followup',
      titulo: 'Lead aguardando follow-up',
      lead: c.contact_name,
      ação: c.next_action,
      conversationId: c.conversation_id,
    }));
  });

  // ============================================================
  // Evolução diária
  // ============================================================
  app.get('/dashboard/daily-evolution', async (request, reply) => {
    const { sellerId, days = 30 } = request.query as { sellerId?: string; days?: number; };
    const evolution = await getDailyEvolution(sellerId, days);
    return evolution.map(e => ({ date: e.date, leads: e.leads, conversions: e.conversions, revenue: e.revenue / 100 }));
  });

  // ============================================================
  // Visão Executiva
  // ============================================================
  app.get('/dashboard/executive', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string; };
    const [kpis, temperature, evolution] = await Promise.all([
      getExecutiveKpis(sellerId),
      getLeadsByTemperature(sellerId),
      getDailyEvolution(sellerId, 30),
    ]);
    return { kpis, temperature, evolution };
  });

  // ============================================================
  // Funil Comercial Detalhado
  // ============================================================
  app.get('/dashboard/funnel-detailed', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    const [stages, conversion, lossReasons] = await Promise.all([
      getFunnelStages(sellerId),
      getConversionByStage(sellerId),
      getLossReasons(sellerId),
    ]);
    const pipelineValue = stages.reduce((sum, s) => sum + s.value_cents, 0);
    return { stages, conversion, lossReasons, pipelineValue };
  });

  // ============================================================
  // Performance Vendedores
  // ============================================================
  app.get('/dashboard/performance', async (request, reply) => {
    const { sellerId, sortBy = 'revenue', limit = 10 } = request.query as { sellerId?: string; sortBy?: 'revenue' | 'conversion' | 'leads'; limit?: number; };
    const ranking = await getSellerRanking(sortBy, limit, sellerId);
    return { ranking, sortBy };
  });

  // ============================================================
  // Conversas e IA
  // ============================================================
  app.get('/dashboard/conversations', async (request, reply) => {
    const { sellerId, days = 7 } = request.query as { sellerId?: string; days?: number };
    const [metrics, objections] = await Promise.all([
      getConversationMetrics(sellerId, days),
      getObjectionsDetected(sellerId),
    ]);
    return { metrics, objections };
  });

  // ============================================================
  // Follow-up
  // ============================================================
  app.get('/dashboard/followup', async (request, reply) => {
    const { sellerId, limit = 20 } = request.query as { sellerId?: string; limit?: number };
    const [stats, needingFollowup] = await Promise.all([
      getFollowupStats(sellerId),
      getConversationsNeedingFollowup(sellerId, limit),
    ]);
    return { stats, needingFollowup };
  });

  // Follow-up completo
  app.get('/dashboard/followup/full', async (request, reply) => {
    const { sellerId, limit = 50, offset = 0 } = request.query as { sellerId?: string; limit?: number; offset?: number };
    const result = await getFollowupFull(sellerId, { limit, offset });
    return result;
  });

  // ============================================================
  // Resumo Geral
  // ============================================================
  app.get('/dashboard/summary', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    const [kpis, followupStats] = await Promise.all([
      getExecutiveKpis(sellerId),
      getFollowupStats(sellerId),
    ]);
    return {
      leads: kpis.leads_received,
      conversion: kpis.conversion_rate,
      revenue: kpis.revenue_cents,
      quality: kpis.avg_quality_score,
      pending: followupStats.pending,
      overdue: followupStats.overdue + followupStats.forgotten,
    };
  });

  // ============================================================
  // Estatísticas de Perda
  // ============================================================
  app.get('/dashboard/loss-stats', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    
    const negativeSentimentResult = await query<any>(
      `SELECT ml.intent, COUNT(*) as count
      FROM message_labels ml
      JOIN messages m ON m.id = ml.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.status = 'open' AND m.direction = 'inbound' AND ml.sentiment <= $2
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY ml.intent ORDER BY count DESC`,
      [sellerId || null, NEGATIVE_SENTIMENT_THRESHOLD]
    );
    
    const noResponseResult = await query<any>(
      `SELECT 
        CASE WHEN c.last_message_at < NOW() - INTERVAL '7 days' THEN 'esquecidos'
          WHEN c.last_message_at < NOW() - INTERVAL '3 days' THEN 'atrasados'
          ELSE 'recentes' END as status, COUNT(*) as count
      FROM conversations c
      WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY CASE WHEN c.last_message_at < NOW() - INTERVAL '7 days' THEN 'esquecidos'
          WHEN c.last_message_at < NOW() - INTERVAL '3 days' THEN 'atrasados'
          ELSE 'recentes' END`,
      [sellerId || null]
    );
    
    const objectionsResult = await query<any>(
      `SELECT ml.objection, COUNT(*) as count
      FROM message_labels ml
      JOIN messages m ON m.id = ml.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.status = 'open' AND m.direction = 'inbound' AND ml.objection IS NOT NULL
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY ml.objection ORDER BY count DESC LIMIT 10`,
      [sellerId || null]
    );
    
    const totalResult = await query<any>(
      `SELECT COUNT(*) as total FROM conversations WHERE status = 'open' AND ($1::uuid IS NULL OR seller_id = $1)`,
      [sellerId || null]
    );
    
    const total = parseInt(totalResult.rows[0]?.total) || 0;
    const noResponse = noResponseResult.rows.reduce((acc: any, r: any) => {
      acc[r.status] = parseInt(r.count) || 0;
      return acc;
    }, { esquecidos: 0, atrasados: 0, recentes: 0 });
    
    return {
      by_stage: [
        { stage: 'lead', total: total, lost: noResponse.esquecidos, loss_rate: total > 0 ? (noResponse.esquecidos / total) * 100 : 0 },
        { stage: 'qualificacao', total: 0, lost: 0, loss_rate: 0 },
        { stage: 'proposta', total: 0, lost: 0, loss_rate: 0 },
        { stage: 'fechamento', total: 0, lost: 0, loss_rate: 0 },
      ],
      by_objection: objectionsResult.rows.map((r: any) => ({
        objection: r.objection || 'none',
        total: parseInt(r.count) || 0,
        won: 0,
        lost: parseInt(r.count) || 0,
        win_rate: 0,
      })),
      objection_breakdown: objectionsResult.rows.map((r: any) => ({
        objection: r.objection || 'none',
        appeared: parseInt(r.count) || 0,
        overcome: 0,
        overcome_rate: 0,
      })),
      loss_reasons: [
        { reason: 'Sem resposta há mais de 7 dias', count: noResponse.esquecidos, percentage: total > 0 ? Math.round((noResponse.esquecidos / total) * 100) : 0 },
        { reason: 'Sem resposta há 3-7 dias', count: noResponse.atrasados, percentage: total > 0 ? Math.round((noResponse.atrasados / total) * 100) : 0 },
        { reason: 'Sentimento negativo detectado', count: negativeSentimentResult.rows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0), percentage: 0 },
      ].filter(r => r.count > 0),
      summary: {
        total_conversations: total,
        lost_at_lead: noResponse.esquecidos,
        lost_at_qualificacao: 0,
        lost_at_proposta: 0,
        lost_at_fechamento: 0,
        overall_loss_rate: total > 0 ? ((noResponse.esquecidos + noResponse.atrasados) / total) * 100 : 0,
      },
    };
  });

  // ============================================================
  // Análise Detalhada de Vendedores
  // ============================================================
  app.get('/dashboard/sellers/analysis', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    const ranking = await getSellerRanking('revenue', 10, sellerId);
    const seller = ranking.find(s => s.seller_id === sellerId) || ranking[0];
    
    const sellers = await Promise.all(ranking.map(async (s) => {
      const conversionStages = await getConversionByStage(s.seller_id);
      const leadToQual = conversionStages.find(c => c.stage_from === 'lead')?.rate || 0;
      const qualToProp = conversionStages.find(c => c.stage_from === 'qualificacao')?.rate || 0;
      const propToClose = conversionStages.find(c => c.stage_from === 'proposta')?.rate || 0;
      
      return {
        seller_id: s.seller_id,
        seller_name: s.seller_name,
        leads: s.leads,
        conversations: s.leads,
        vendas: s.conversions,
        revenue_cents: s.revenue_cents,
        ticket_medio_cents: s.revenue_cents / Math.max(s.conversions, 1),
        conversion_by_stage: { 
          lead_to_qualificacao: Math.round(leadToQual * 100), 
          qualificacao_to_proposta: Math.round(qualToProp * 100), 
          proposta_to_fechamento: Math.round(propToClose * 100),
          overall_conversion: s.conversion_rate 
        },
        weak_stage: propToClose < leadToQual ? 'proposta_to_fechamento' : qualToProp < leadToQual ? 'qualificacao_to_proposta' : 'lead_to_qualificacao',
        strong_stage: leadToQual >= qualToProp && leadToQual >= propToClose ? 'lead_to_qualificacao' : qualToProp >= propToClose ? 'qualificacao_to_proposta' : 'proposta_to_fechamento',
        avg_first_response_min: 15,
        avg_response_time_category: 'Bom',
        objections_strong: [],
        objections_weak: [],
        team_avg_conversion: ranking.reduce((sum, s) => sum + s.conversion_rate, 0) / Math.max(ranking.length, 1),
        team_avg_revenue: ranking.reduce((sum, s) => sum + s.revenue_cents, 0) / Math.max(ranking.length, 1),
        team_avg_response_time: 20,
        performance_vs_team: 0,
        ranking_position: ranking.findIndex(r => r.seller_id === s.seller_id) + 1,
        total_sellers: ranking.length,
        monthly_evolution: [],
        trend: 'stable',
        peak_hours: [],
        best_hour: 10,
        avg_time_in_stage: { lead_days: 1, qualificacao_days: 2, proposta_days: 3, fechamento_days: 1 },
        followup_rate: 80,
        avg_followups_per_conversation: 2,
        daily_productivity: { 
          avg_conversations_per_day: s.leads, 
          avg_vendas_per_day: s.conversions / 22, 
          avg_revenue_per_day: s.revenue_cents / 100 / 22 
        },
      };
    }));
    
    const team_totals = {
      total_leads: ranking.reduce((sum, s) => sum + s.leads, 0),
      total_vendas: ranking.reduce((sum, s) => sum + s.conversions, 0),
      total_revenue: ranking.reduce((sum, s) => sum + s.revenue_cents, 0),
      avg_conversion: ranking.reduce((sum, s) => sum + s.conversion_rate, 0) / Math.max(ranking.length, 1),
      avg_response_time: 20,
    };
    
    return { sellers, team_totals };
  });

  // ============================================================
  // Comparativo: mês atual vs mês anterior
  // ============================================================
  app.get('/dashboard/kpis-comparison', async (request, reply) => {
    const { sellerId, month } = request.query as { sellerId?: string; month?: string };

    // Mês de referência (atual ou selecionado)
    const refMonth = month || new Date().toISOString().slice(0, 7);
    const [year, monthNum] = refMonth.split('-').map(Number);

    // Mês anterior
    const prevDate = new Date(Date.UTC(year, monthNum - 2, 1));
    const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

    const { startDate: curStart, endDate: curEnd } = getPeriodDates('month', undefined, refMonth);
    const { startDate: prevStart, endDate: prevEnd } = getPeriodDates('month', undefined, prevMonth);

    const [current, previous] = await Promise.all([
      getExecutiveKpis(sellerId, curStart, curEnd),
      getExecutiveKpis(sellerId, prevStart, prevEnd),
    ]);

    // Calcular variações percentuais
    function pctChange(cur: number, prev: number): number {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }

    return {
      current: {
        revenue_cents: current.revenue_cents,
        sales_won: current.sales_won,
        leads_received: current.leads_received,
        leads_attended: current.leads_attended,
        leads_lost: current.leads_lost,
        conversion_rate: Math.round(current.conversion_rate * 100),
        ticket_avg_cents: current.ticket_avg_cents,
        avg_first_response_min: Math.round(current.avg_first_response_min),
      },
      previous: {
        revenue_cents: previous.revenue_cents,
        sales_won: previous.sales_won,
        leads_received: previous.leads_received,
        leads_attended: previous.leads_attended,
        leads_lost: previous.leads_lost,
        conversion_rate: Math.round(previous.conversion_rate * 100),
        ticket_avg_cents: previous.ticket_avg_cents,
        avg_first_response_min: Math.round(previous.avg_first_response_min),
      },
      changes: {
        revenue: pctChange(current.revenue_cents, previous.revenue_cents),
        sales: pctChange(current.sales_won, previous.sales_won),
        leads: pctChange(current.leads_received, previous.leads_received),
        conversion: pctChange(current.conversion_rate, previous.conversion_rate),
        ticket: pctChange(current.ticket_avg_cents, previous.ticket_avg_cents),
        response_time: pctChange(previous.avg_first_response_min, current.avg_first_response_min), // invertido: menor é melhor
      },
      ref_month: refMonth,
      prev_month: prevMonth,
    };
  });

  // ============================================================
  // Pipeline com valor ponderado por probabilidade
  // ============================================================
  app.get('/dashboard/pipeline-weighted', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };

    // Probabilidades de fechamento por estágio
    const STAGE_PROBABILITY: Record<string, number> = {
      lead: 0.10,
      qualificacao: 0.30,
      proposta: 0.60,
      fechamento: 0.85,
      pos_venda: 1.00,
    };

    const stages = await getFunnelStages(sellerId);

    const weighted = stages.map(s => ({
      stage: s.stage,
      count: s.count,
      value_cents: s.value_cents,
      probability: Math.round((STAGE_PROBABILITY[s.stage] || 0) * 100),
      weighted_value_cents: Math.round(s.value_cents * (STAGE_PROBABILITY[s.stage] || 0)),
    }));

    const total_pipeline = weighted.reduce((sum, s) => sum + s.value_cents, 0);
    const total_weighted = weighted.reduce((sum, s) => sum + s.weighted_value_cents, 0);
    const total_count = weighted.reduce((sum, s) => sum + s.count, 0);

    return { stages: weighted, total_pipeline, total_weighted, total_count };
  });

  // ============================================================
  // Análise Completa de Vendedores (Fase 3)
  // Funil individual, tempo por estágio, evolução semanal, melhores horários
  // ============================================================
  app.get('/dashboard/sellers/full', async (request, reply) => {
    const { sellerId, periodMode, date, month } = request.query as { sellerId?: string; periodMode?: string; date?: string; month?: string; };
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);

    // 1. Base ranking (filtrado por instância e período)
    const ranking = await getSellerRanking('revenue', 20, sellerId, startDate, endDate);

    // 2. Funil por vendedor (período selecionado)
    const funnelResult = await query<any>(
      `SELECT c.seller_id,
        COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage = 'lead') as lead_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage = 'qualificacao') as qualificacao_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage = 'proposta') as proposta_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage = 'fechamento') as fechamento_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage IN ('closed_won','pos_venda')) as fechado_count
      FROM conversations c
      WHERE c.created_at >= $2 AND c.created_at <= $3
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY c.seller_id`,
      [sellerId || null, startDate, endDate]
    );

    // 3. Tempo médio por estágio (últimos 90 dias)
    const stageTimeResult = await query<any>(
      `SELECT c.seller_id,
        AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(c.last_message_at, NOW()) - c.created_at)) / 86400)) FILTER (WHERE c.funnel_stage = 'lead') as avg_days_lead,
        AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(c.last_message_at, NOW()) - c.created_at)) / 86400)) FILTER (WHERE c.funnel_stage = 'qualificacao') as avg_days_qual,
        AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(c.last_message_at, NOW()) - c.created_at)) / 86400)) FILTER (WHERE c.funnel_stage = 'proposta') as avg_days_prop,
        AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(c.last_message_at, NOW()) - c.created_at)) / 86400)) FILTER (WHERE c.funnel_stage = 'fechamento') as avg_days_fech
      FROM conversations c
      WHERE c.created_at >= $2 AND c.created_at <= $3
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY c.seller_id`,
      [sellerId || null, startDate, endDate]
    );

    // 4. Evolução semanal (período selecionado)
    const weeklyResult = await query<any>(
      `SELECT c.seller_id,
        DATE_TRUNC('week', so.updated_at) as week_start,
        COUNT(*) FILTER (WHERE so.outcome = 'won') as vendas,
        COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won'), 0) as revenue_cents
      FROM sales_outcomes so
      JOIN conversations c ON c.id = so.conversation_id
      WHERE so.updated_at >= $2 AND so.updated_at <= $3
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY c.seller_id, DATE_TRUNC('week', so.updated_at)
      ORDER BY c.seller_id, week_start`,
      [sellerId || null, startDate, endDate]
    );

    // 5. Melhores horários por vendedor (período selecionado, somente wins)
    const hoursResult = await query<any>(
      `SELECT c.seller_id,
        EXTRACT(HOUR FROM so.updated_at) as hour,
        COUNT(*) as wins
      FROM sales_outcomes so
      JOIN conversations c ON c.id = so.conversation_id
      WHERE so.outcome = 'won' AND so.updated_at >= $2 AND so.updated_at <= $3
        AND ($1::uuid IS NULL OR c.seller_id = $1)
      GROUP BY c.seller_id, EXTRACT(HOUR FROM so.updated_at)
      ORDER BY c.seller_id, wins DESC`,
      [sellerId || null, startDate, endDate]
    );

    // Montar mapas auxiliares
    const funnelMap: Record<string, any> = {};
    funnelResult.rows.forEach((r: any) => {
      funnelMap[r.seller_id] = {
        lead: parseInt(r.lead_count) || 0,
        qualificacao: parseInt(r.qualificacao_count) || 0,
        proposta: parseInt(r.proposta_count) || 0,
        fechamento: parseInt(r.fechamento_count) || 0,
        fechado: parseInt(r.fechado_count) || 0,
      };
    });

    const stageTimeMap: Record<string, any> = {};
    stageTimeResult.rows.forEach((r: any) => {
      stageTimeMap[r.seller_id] = {
        lead_days: Math.round((parseFloat(r.avg_days_lead) || 0) * 10) / 10,
        qualificacao_days: Math.round((parseFloat(r.avg_days_qual) || 0) * 10) / 10,
        proposta_days: Math.round((parseFloat(r.avg_days_prop) || 0) * 10) / 10,
        fechamento_days: Math.round((parseFloat(r.avg_days_fech) || 0) * 10) / 10,
      };
    });

    const weeklyMap: Record<string, any[]> = {};
    weeklyResult.rows.forEach((r: any) => {
      if (!weeklyMap[r.seller_id]) weeklyMap[r.seller_id] = [];
      weeklyMap[r.seller_id].push({
        week: new Date(r.week_start).toISOString().slice(0, 10),
        vendas: parseInt(r.vendas) || 0,
        revenue_cents: parseInt(r.revenue_cents) || 0,
      });
    });

    const hoursMap: Record<string, any[]> = {};
    hoursResult.rows.forEach((r: any) => {
      if (!hoursMap[r.seller_id]) hoursMap[r.seller_id] = [];
      if (hoursMap[r.seller_id].length < 3) {
        hoursMap[r.seller_id].push({
          hour: parseInt(r.hour),
          wins: parseInt(r.wins),
        });
      }
    });

    // Média global de qualidade (para adjusted rank)
    const globalAvgQuality = ranking.length > 0
      ? ranking.reduce((sum, s) => sum + s.avg_quality, 0) / ranking.length
      : 50;

    // Montar lista de vendedores
    const sellers = ranking.map((s, idx) => {
      const funnel = funnelMap[s.seller_id] || { lead: 0, qualificacao: 0, proposta: 0, fechamento: 0, fechado: 0 };
      const stageTime = stageTimeMap[s.seller_id] || { lead_days: 0, qualificacao_days: 0, proposta_days: 0, fechamento_days: 0 };
      const weekly = (weeklyMap[s.seller_id] || []).sort((a, b) => a.week.localeCompare(b.week));
      const bestHours = hoursMap[s.seller_id] || [];

      // Taxa ajustada pela qualidade dos leads recebidos
      const adjustedRate = globalAvgQuality > 0 && s.avg_quality > 0
        ? s.conversion_rate * (globalAvgQuality / s.avg_quality)
        : s.conversion_rate;

      // Tendência semanal: comparar semana mais recente vs anterior
      const trend: 'up' | 'down' | 'stable' = (() => {
        if (weekly.length < 2) return 'stable';
        const recent = weekly[weekly.length - 1]?.vendas || 0;
        const prev = weekly[weekly.length - 2]?.vendas || 0;
        if (recent > prev * 1.1) return 'up';
        if (recent < prev * 0.9) return 'down';
        return 'stable';
      })();

      return {
        seller_id: s.seller_id,
        seller_name: s.seller_name,
        rank: idx + 1,
        leads: s.leads,
        conversions: s.conversions,
        revenue_cents: s.revenue_cents,
        conversion_rate: Math.round(s.conversion_rate * 10) / 10,
        avg_quality: Math.round(s.avg_quality),
        ticket_medio_cents: s.conversions > 0 ? Math.round(s.revenue_cents / s.conversions) : 0,
        adjusted_rate: Math.round(adjustedRate * 10) / 10,
        adjusted_rank: 0, // preenchido abaixo
        trend,
        funnel,
        stage_time: stageTime,
        weekly_evolution: weekly,
        best_hours: bestHours,
      };
    });

    // Preencher adjusted_rank
    const sortedByAdj = [...sellers].sort((a, b) => b.adjusted_rate - a.adjusted_rate);
    sortedByAdj.forEach((s, i) => {
      const found = sellers.find(x => x.seller_id === s.seller_id);
      if (found) found.adjusted_rank = i + 1;
    });

    const team_totals = {
      total_leads: sellers.reduce((sum, s) => sum + s.leads, 0),
      total_conversions: sellers.reduce((sum, s) => sum + s.conversions, 0),
      total_revenue_cents: sellers.reduce((sum, s) => sum + s.revenue_cents, 0),
      avg_conversion_rate: sellers.length > 0
        ? Math.round(sellers.reduce((sum, s) => sum + s.conversion_rate, 0) / sellers.length * 10) / 10
        : 0,
      global_avg_quality: Math.round(globalAvgQuality),
      total_sellers: sellers.length,
    };

    return { sellers, team_totals };
  });

  // ============================================================
  // Análise Comparativa por Produto/Instância (Fase 4)
  // ============================================================
  app.get('/dashboard/products/comparison', async (request, reply) => {
    const { periodMode, date, month } = request.query as { periodMode?: string; date?: string; month?: string; };
    const { startDate, endDate } = getPeriodDates(periodMode || 'month', date, month);

    // 1. KPIs por produto (período selecionado)
    const kpisResult = await query<any>(
      `SELECT
        s.id as seller_id,
        s.name as seller_name,
        s.monthly_goal_cents,
        COUNT(DISTINCT c.id) as leads,
        COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won') as conversions,
        COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won'), 0) as revenue_cents,
        COALESCE(
          100.0 * COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won')
          / NULLIF(COUNT(DISTINCT c.id), 0), 0
        ) as conversion_rate,
        COALESCE(AVG(ci.quality_score), 0) as avg_quality
      FROM sellers s
      LEFT JOIN conversations c ON c.seller_id = s.id
        AND c.created_at >= $1 AND c.created_at <= $2
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
      LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
      WHERE s.active = true
      GROUP BY s.id, s.name, s.monthly_goal_cents
      ORDER BY revenue_cents DESC`,
      [startDate, endDate]
    );

    // 2. Top objeções por produto (últimos 30 dias)
    const objectionsResult = await query<any>(
      `SELECT c.seller_id, ml.objection, COUNT(*) as cnt
      FROM message_labels ml
      JOIN messages m ON m.id = ml.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE ml.objection IS NOT NULL AND ml.objection != ''
        AND m.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY c.seller_id, ml.objection
      ORDER BY c.seller_id, cnt DESC`,
      []
    );

    // 3. Sensibilidade a preço por produto (últimos 30 dias)
    const priceResult = await query<any>(
      `SELECT c.seller_id,
        COUNT(*) FILTER (
          WHERE ml.objection ILIKE '%preco%' OR ml.objection ILIKE '%caro%'
               OR ml.objection ILIKE '%valor%' OR ml.objection ILIKE '%custo%'
               OR ml.intent ILIKE '%price%' OR ml.intent ILIKE '%preco%'
        ) as price_objections,
        COUNT(*) as total_labels
      FROM message_labels ml
      JOIN messages m ON m.id = ml.message_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY c.seller_id`,
      []
    );

    // 4. Taxa de reativação — contatos que voltaram após conversa anterior
    const reactivationResult = await query<any>(
      `SELECT c.seller_id, COUNT(DISTINCT c.contact_id) as reactivated
      FROM conversations c
      WHERE c.created_at >= NOW() - INTERVAL '30 days'
        AND EXISTS (
          SELECT 1 FROM conversations c2
          WHERE c2.contact_id = c.contact_id
            AND c2.id != c.id
            AND c2.created_at < c.created_at - INTERVAL '1 day'
        )
      GROUP BY c.seller_id`,
      []
    );

    // 5. Perdas — motivos mais frequentes por produto
    const lossResult = await query<any>(
      `SELECT c.seller_id,
        COALESCE(so.loss_reason, 'Não informado') as reason,
        COUNT(*) as cnt
      FROM sales_outcomes so
      JOIN conversations c ON c.id = so.conversation_id
      WHERE so.outcome = 'lost'
        AND so.updated_at >= $1 AND so.updated_at <= $2
      GROUP BY c.seller_id, reason
      ORDER BY c.seller_id, cnt DESC`,
      [startDate, endDate]
    );

    // Montar mapas auxiliares
    const objectionsMap: Record<string, Array<{ objection: string; count: number }>> = {};
    objectionsResult.rows.forEach((r: any) => {
      if (!objectionsMap[r.seller_id]) objectionsMap[r.seller_id] = [];
      if (objectionsMap[r.seller_id].length < 3) {
        objectionsMap[r.seller_id].push({ objection: r.objection, count: parseInt(r.cnt) });
      }
    });

    const priceMap: Record<string, { price_objections: number; total_labels: number; sensitivity_pct: number }> = {};
    priceResult.rows.forEach((r: any) => {
      const total = parseInt(r.total_labels) || 1;
      const price = parseInt(r.price_objections) || 0;
      priceMap[r.seller_id] = {
        price_objections: price,
        total_labels: total,
        sensitivity_pct: Math.round((price / total) * 100),
      };
    });

    const reactivationMap: Record<string, number> = {};
    reactivationResult.rows.forEach((r: any) => {
      reactivationMap[r.seller_id] = parseInt(r.reactivated) || 0;
    });

    const lossMap: Record<string, Array<{ reason: string; count: number }>> = {};
    lossResult.rows.forEach((r: any) => {
      if (!lossMap[r.seller_id]) lossMap[r.seller_id] = [];
      if (lossMap[r.seller_id].length < 3) {
        lossMap[r.seller_id].push({ reason: r.reason, count: parseInt(r.cnt) });
      }
    });

    const products = kpisResult.rows.map((r: any) => {
      const leads = parseInt(r.leads) || 0;
      const conversions = parseInt(r.conversions) || 0;
      const revenueCents = parseInt(r.revenue_cents) || 0;
      const goalCents = parseInt(r.monthly_goal_cents) || 5000000;
      const reactivated = reactivationMap[r.seller_id] || 0;
      const price = priceMap[r.seller_id] || { price_objections: 0, total_labels: 0, sensitivity_pct: 0 };

      return {
        seller_id: r.seller_id,
        seller_name: r.seller_name,
        leads,
        conversions,
        revenue_cents: revenueCents,
        conversion_rate: Math.round(parseFloat(r.conversion_rate) * 10) / 10,
        avg_quality: Math.round(parseFloat(r.avg_quality)),
        ticket_medio_cents: conversions > 0 ? Math.round(revenueCents / conversions) : 0,
        goal_cents: goalCents,
        goal_progress_pct: Math.round((revenueCents / goalCents) * 100),
        reactivation_count: reactivated,
        reactivation_rate_pct: leads > 0 ? Math.round((reactivated / leads) * 100) : 0,
        price_sensitivity_pct: price.sensitivity_pct,
        top_objections: objectionsMap[r.seller_id] || [],
        top_loss_reasons: lossMap[r.seller_id] || [],
      };
    });

    const totals = {
      total_leads: products.reduce((s: number, p: any) => s + p.leads, 0),
      total_revenue_cents: products.reduce((s: number, p: any) => s + p.revenue_cents, 0),
      total_goal_cents: products.reduce((s: number, p: any) => s + p.goal_cents, 0),
      total_conversions: products.reduce((s: number, p: any) => s + p.conversions, 0),
    };

    return { products, totals };
  });

  // ============================================================
  // Registro Manual de Venda
  // Permite o usuário registrar uma venda manualmente quando o
  // sistema não detectou o comprovante automaticamente.
  // ============================================================
  app.post('/dashboard/sales/manual', async (request, reply) => {
    const { conversationId, valueCents, sellerId: sellerIdBody } = request.body as {
      conversationId: string;
      valueCents?: number;
      sellerId?: string;
    };

    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId é obrigatório' });
    }

    // Verificar se a conversa existe e pertence ao seller
    const convCheck = await query<any>(
      `SELECT c.id, c.funnel_stage, c.seller_id FROM conversations c WHERE c.id = $1`,
      [conversationId]
    );
    if (!convCheck.rows[0]) {
      return reply.status(404).send({ error: 'Conversa não encontrada' });
    }

    // Avançar para closed_won
    await query(
      `UPDATE conversations SET funnel_stage = 'closed_won'
       WHERE id = $1 AND funnel_stage NOT IN ('closed_lost')`,
      [conversationId]
    );

    // Upsert sales_outcome como won com valor
    await query(
      `INSERT INTO sales_outcomes (id, conversation_id, outcome, value_cents, updated_at)
       VALUES (gen_random_uuid(), $1, 'won', $2, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET outcome = 'won', value_cents = $2, updated_at = NOW()`,
      [conversationId, valueCents || null]
    );

    // Atualizar conversation_insights se existir
    await query(
      `UPDATE conversation_insights SET quality_score = GREATEST(quality_score, 85)
       WHERE conversation_id = $1`,
      [conversationId]
    );

    console.log('[Sales] ✓ Venda registrada manualmente:', conversationId, 'valor:', valueCents);

    return {
      success: true,
      conversationId,
      outcome: 'won',
      valueCents: valueCents || null,
      message: 'Venda registrada com sucesso',
    };
  });

  // ============================================================
  // ALIASES de compatibilidade — rotas chamadas pelo frontend
  // ============================================================

  // /dashboard/ranking → alias para /dashboard/sellers (ranking de vendedores)
  app.get('/dashboard/ranking', async (request, reply) => {
    const { sellerId, sortBy = 'revenue', limit = 10 } = request.query as {
      sellerId?: string; sortBy?: 'revenue' | 'conversion' | 'leads'; limit?: number;
    };
    const normalizedSellerId = normalizeSellerId(sellerId);
    const ranking = await getSellerRanking(sortBy, Number(limit), normalizedSellerId);
    return { ranking, sortBy };
  });

  // /dashboard/loss-reasons → alias para /dashboard/loss-stats
  app.get('/dashboard/loss-reasons', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };
    const normalizedSellerId = normalizeSellerId(sellerId);
    const lossReasons = await getLossReasons(normalizedSellerId, 10);
    return {
      losses: lossReasons.map(r => ({
        motivo: r.reason,
        count: r.count.toString(),
        percentual: r.percentage + '%',
      })),
    };
  });
}
