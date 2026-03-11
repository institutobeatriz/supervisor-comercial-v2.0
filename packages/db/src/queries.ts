/**
 * Database Queries
 * Supervisor Comercial - All required queries
 */

import { db, query, transaction } from './pool.js';
import type {
  Seller,
  Contact,
  Conversation,
  Message,
  AudioTranscript,
  MessageLabel,
  ConversationInsight,
  SalesOutcome,
  RagChunk,
  ReportWeekly,
  UpsertContactInput,
  UpsertConversationInput,
  InsertMessageInput,
  InsertTranscriptInput,
  InsertLabelsInput,
  UpsertConversationInsightsInput,
  SetOutcomeInput,
  SaveRagChunkInput,
} from './types.js';

// ============================================================
// SELLERS
// ============================================================

export async function getDefaultSeller(): Promise<Seller | null> {
  const result = await query<Seller>(
    'SELECT * FROM sellers WHERE active = true ORDER BY created_at LIMIT 1'
  );
  return result.rows[0] || null;
}

export async function getSellerById(id: string): Promise<Seller | null> {
  const result = await query<Seller>(
    'SELECT * FROM sellers WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getSellerByInstance(instance: string): Promise<Seller | null> {
  const result = await query<Seller>(
    `SELECT s.* FROM sellers s
     JOIN instance_seller_map ism ON ism.seller_id = s.id
     WHERE ism.instance = $1 AND ism.active = TRUE AND s.active = TRUE
     LIMIT 1`,
    [instance]
  );
  return result.rows[0] || null;
}

// ============================================================
// RAW EVENTS — append-only store
// ============================================================

export async function insertRawEvent(input: {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  whatsapp_id?: string | null;
}): Promise<{ id: string } | null> {
  const result = await query<{ id: string }>(
    `INSERT INTO raw_events (event, instance, data, whatsapp_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (whatsapp_id) WHERE whatsapp_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [input.event, input.instance, input.data, input.whatsapp_id ?? null]
  );

  // ON CONFLICT fired — duplicate event, return null to signal caller
  if (result.rows.length === 0) {
    if (input.whatsapp_id) {
      // Fetch existing ID for reference
      const existing = await query<{ id: string }>(
        'SELECT id FROM raw_events WHERE whatsapp_id = $1',
        [input.whatsapp_id]
      );
      return existing.rows[0] || null;
    }
    return null;
  }

  return result.rows[0];
}

// ============================================================
// CONTACTS - upsertContact
// ============================================================

export async function upsertContact(input: UpsertContactInput): Promise<Contact> {
  const result = await query<Contact>(
    `INSERT INTO contacts (phone_e164, display_name, tags)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_e164) 
     DO UPDATE SET 
       display_name = COALESCE($2, contacts.display_name),
       tags = CASE 
         WHEN $3::jsonb = '[]'::jsonb THEN contacts.tags 
         ELSE $3::jsonb 
       END
     RETURNING *`,
    [input.phone_e164, input.display_name || null, JSON.stringify(input.tags || [])]
  );
  return result.rows[0];
}

export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const result = await query<Contact>(
    'SELECT * FROM contacts WHERE phone_e164 = $1',
    [phone]
  );
  return result.rows[0] || null;
}

// ============================================================
// CONVERSATIONS - upsertConversation
// ============================================================

export async function upsertConversation(
  input: UpsertConversationInput
): Promise<Conversation> {
  // Buscar conversa aberta existente
  const existing = await query<Conversation>(
    `SELECT * FROM conversations 
     WHERE contact_id = $1 AND status = 'open'
     ORDER BY created_at DESC 
     LIMIT 1`,
    [input.contact_id]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  // Criar nova conversa
  const result = await query<Conversation>(
    `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage)
     VALUES ($1, $2, 'open', 'lead')
     RETURNING *`,
    [input.contact_id, input.seller_id]
  );
  return result.rows[0];
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const result = await query<Conversation>(
    'SELECT * FROM conversations WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function updateConversationLastMessage(id: string): Promise<void> {
  await query(
    'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
    [id]
  );
}

// ============================================================
// MESSAGES - insertMessage
// ============================================================

export async function insertMessage(input: InsertMessageInput): Promise<Message> {
  const result = await query<Message>(
    `INSERT INTO messages
     (conversation_id, seller_id, direction, type, text, media_url, media_mime, media_sha256, timestamp, raw_event, whatsapp_message_id, raw_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (conversation_id, whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      input.conversation_id,
      input.seller_id || null,
      input.direction,
      input.type,
      input.text || null,
      input.media_url || null,
      input.media_mime || null,
      input.media_sha256 || null,
      input.timestamp,
      JSON.stringify(input.raw_event),
      input.whatsapp_message_id || null,
      input.raw_event_id || null,
    ]
  );
  return result.rows[0];
}

export async function getMessageById(id: string): Promise<Message | null> {
  const result = await query<Message>(
    'SELECT * FROM messages WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getMessagesByConversation(
  conversationId: string,
  limit = 50
): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT * FROM messages 
     WHERE conversation_id = $1 
     ORDER BY timestamp ASC 
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

export async function getRecentMessagesForContext(
  conversationId: string,
  beforeTimestamp: Date,
  limit = 3
): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT * FROM messages 
     WHERE conversation_id = $1 AND timestamp < $2
     ORDER BY timestamp DESC 
     LIMIT $3`,
    [conversationId, beforeTimestamp, limit]
  );
  return result.rows.reverse(); // Ordem cronolÃ³gica
}

export async function getMessagesForAnalysis(
  conversationId: string,
  limit = 40
): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT * FROM messages 
     WHERE conversation_id = $1 
     ORDER BY timestamp ASC 
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

// ============================================================
// AUDIO_TRANSCRIPTS - insertTranscript (com cache)
// ============================================================

export async function getTranscriptByMediaSha256(sha256: string): Promise<AudioTranscript | null> {
  const result = await query<AudioTranscript>(
    `SELECT at.* FROM audio_transcripts at
     JOIN messages m ON m.id = at.message_id
     WHERE m.media_sha256 = $1
     LIMIT 1`,
    [sha256]
  );
  return result.rows[0] || null;
}

export async function insertTranscript(input: InsertTranscriptInput): Promise<AudioTranscript> {
  const result = await query<AudioTranscript>(
    `INSERT INTO audio_transcripts 
     (message_id, transcript, confidence, duration_sec, provider)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.message_id,
      input.transcript,
      input.confidence || null,
      input.duration_sec || null,
      input.provider,
    ]
  );
  return result.rows[0];
}

export async function getTranscriptByMessageId(messageId: string): Promise<AudioTranscript | null> {
  const result = await query<AudioTranscript>(
    'SELECT * FROM audio_transcripts WHERE message_id = $1',
    [messageId]
  );
  return result.rows[0] || null;
}

// ============================================================
// MESSAGE_LABELS - insertLabels
// ============================================================

export async function insertLabels(input: InsertLabelsInput): Promise<MessageLabel> {
  const result = await query<MessageLabel>(
    `INSERT INTO message_labels 
     (message_id, intent, objection, urgency, sentiment, funnel_stage, language, needs_attention, attention_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (message_id) 
     DO UPDATE SET 
       intent = $2, objection = $3, urgency = $4, sentiment = $5,
       funnel_stage = $6, language = $7, needs_attention = $8, attention_reason = $9
     RETURNING *`,
    [
      input.message_id,
      input.intent,
      input.objection,
      input.urgency,
      input.sentiment,
      input.funnel_stage,
      input.language,
      input.needs_attention,
      input.attention_reason,
    ]
  );
  return result.rows[0];
}

export async function getLabelsByMessageId(messageId: string): Promise<MessageLabel | null> {
  const result = await query<MessageLabel>(
    'SELECT * FROM message_labels WHERE message_id = $1',
    [messageId]
  );
  return result.rows[0] || null;
}

// ============================================================
// CONVERSATION_INSIGHTS - upsertConversationInsights
// ============================================================

export async function upsertConversationInsights(
  input: UpsertConversationInsightsInput
): Promise<ConversationInsight> {
  const result = await query<ConversationInsight>(
    `INSERT INTO conversation_insights 
     (conversation_id, quality_score, wins, mistakes, next_best_actions, summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (conversation_id) 
     DO UPDATE SET 
       quality_score = $2, wins = $3, mistakes = $4, 
       next_best_actions = $5, summary = $6, updated_at = NOW()
     RETURNING *`,
    [
      input.conversation_id,
      input.quality_score,
      JSON.stringify(input.wins),
      JSON.stringify(input.mistakes),
      JSON.stringify(input.next_best_actions),
      input.summary,
    ]
  );
  return result.rows[0];
}

export async function getInsightsByConversationId(
  conversationId: string
): Promise<ConversationInsight | null> {
  const result = await query<ConversationInsight>(
    'SELECT * FROM conversation_insights WHERE conversation_id = $1',
    [conversationId]
  );
  return result.rows[0] || null;
}

// ============================================================
// SALES_OUTCOMES - setOutcome
// ============================================================

export async function setOutcome(input: SetOutcomeInput): Promise<SalesOutcome> {
  const result = await query<SalesOutcome>(
    `INSERT INTO sales_outcomes 
     (conversation_id, outcome, value_cents, loss_reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id) 
     DO UPDATE SET 
       outcome = $2, value_cents = $3, loss_reason = $4, updated_at = NOW()
     RETURNING *`,
    [
      input.conversation_id,
      input.outcome,
      input.value_cents || null,
      input.loss_reason || null,
    ]
  );
  return result.rows[0];
}

export async function getOutcomeByConversationId(
  conversationId: string
): Promise<SalesOutcome | null> {
  const result = await query<SalesOutcome>(
    'SELECT * FROM sales_outcomes WHERE conversation_id = $1',
    [conversationId]
  );
  return result.rows[0] || null;
}

// ============================================================
// RAG_CHUNKS - saveRagChunk + findSimilarRagChunks
// ============================================================

export async function saveRagChunk(input: SaveRagChunkInput): Promise<RagChunk> {
  const result = await query<RagChunk>(
    `INSERT INTO rag_chunks 
     (conversation_id, chunk_text, embedding, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.conversation_id,
      input.chunk_text,
      input.embedding ? `[${input.embedding.join(',')}]` : null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return result.rows[0];
}

export async function findSimilarRagChunks(
  queryEmbedding: number[],
  objection?: string,
  topK = 5
): Promise<Array<{ id: string; chunk_text: string; metadata: Record<string, unknown>; distance: number }>> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  let sql = `
    SELECT id, chunk_text, metadata, (embedding <=> $1::vector) AS distance
    FROM rag_chunks
    WHERE embedding IS NOT NULL
  `;
  
  const params: unknown[] = [embeddingStr];
  
  if (objection) {
    sql += ` AND metadata->>'objection' = $2`;
    params.push(objection);
  }
  
  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(topK);
  
  const result = await query<{
    id: string;
    chunk_text: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>(sql, params);
  
  return result.rows;
}

// Fallback textual search when RAG_VECTOR=false
export async function findRagChunksByText(
  searchText: string,
  objection?: string,
  topK = 5
): Promise<RagChunk[]> {
  let sql = `
    SELECT * FROM rag_chunks
    WHERE chunk_text ILIKE $1
  `;
  const params: unknown[] = [`%${searchText}%`];
  
  if (objection) {
    sql += ` AND metadata->>'objection' = $2`;
    params.push(objection);
  }
  
  sql += ` LIMIT $${params.length + 1}`;
  params.push(topK);
  
  const result = await query<RagChunk>(sql, params);
  return result.rows;
}

// ============================================================
// REPORTS
// ============================================================

export async function saveDailyReport(
  reportDate: string,
  sellerId: string,
  kpis: Record<string, unknown>,
  heatmap: Record<string, unknown>,
  highlights: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO reports_daily (report_date, seller_id, kpis, heatmap, highlights)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (report_date, seller_id) 
     DO UPDATE SET kpis = $3, heatmap = $4, highlights = $5`,
    [reportDate, sellerId, JSON.stringify(kpis), JSON.stringify(heatmap), JSON.stringify(highlights)]
  );
}

export async function getDailyReport(
  reportDate: string,
  sellerId: string
): Promise<Record<string, unknown> | null> {
  const result = await query<Record<string, unknown>>(
    'SELECT * FROM reports_daily WHERE report_date = $1 AND seller_id = $2',
    [reportDate, sellerId]
  );
  return result.rows[0] || null;
}

export async function saveWeeklyReport(
  weekStart: string,
  sellerId: string,
  kpis: Record<string, unknown>,
  heatmap: Record<string, unknown>,
  highlights: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO reports_weekly (week_start, seller_id, kpis, heatmap, highlights)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_start, seller_id) 
     DO UPDATE SET kpis = $3, heatmap = $4, highlights = $5`,
    [weekStart, sellerId, JSON.stringify(kpis), JSON.stringify(heatmap), JSON.stringify(highlights)]
  );
}

// ============================================================
// ADMIN QUERIES
// ============================================================

export async function getConversationsForAdmin(filters: {
  status?: string;
  stage?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<Conversation[]> {
  let sql = `
    SELECT c.*, 
           ct.phone_e164, ct.display_name as contact_name,
           s.name as seller_name,
           so.outcome, so.value_cents,
           ci.quality_score
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN sellers s ON s.id = c.seller_id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE 1=1
  `;
  
  const params: unknown[] = [];
  let paramIndex = 1;
  
  if (filters.status) {
    sql += ` AND c.status = $${paramIndex++}`;
    params.push(filters.status);
  }
  
  if (filters.stage) {
    sql += ` AND c.funnel_stage = $${paramIndex++}`;
    params.push(filters.stage);
  }
  
  if (filters.q) {
    sql += ` AND (ct.phone_e164 ILIKE $${paramIndex} OR ct.display_name ILIKE $${paramIndex})`;
    params.push(`%${filters.q}%`);
    paramIndex++;
  }
  
  sql += ` ORDER BY c.last_message_at DESC NULLS LAST`;
  
  if (filters.limit) {
    sql += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }
  
  if (filters.offset) {
    sql += ` OFFSET $${paramIndex++}`;
    params.push(filters.offset);
  }
  
  const result = await query<Conversation>(sql, params);
  return result.rows;
}

export async function getConversationDetail(conversationId: string): Promise<Record<string, unknown> | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT 
      c.*,
      ct.phone_e164, ct.display_name as contact_name, ct.tags as contact_tags,
      s.name as seller_name,
      so.outcome, so.value_cents, so.loss_reason,
      ci.quality_score, ci.wins, ci.mistakes, ci.next_best_actions, ci.summary
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN sellers s ON s.id = c.seller_id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE c.id = $1`,
    [conversationId]
  );
  return result.rows[0] || null;
}

// ============================================================
// EXPORT
export async function getWeeklyReport(
  sellerId: string,
  startDate: Date,
  endDate: Date
): Promise<ReportWeekly | null> {
  const result = await query<ReportWeekly>(
    `SELECT * FROM reports_weekly 
     WHERE seller_id = $1 AND period_start = $2 AND period_end = $3`,
    [sellerId, startDate, endDate]
  );
  return result.rows[0] || null;
}

export function isRagVectorEnabled(): boolean {
  return process.env.RAG_VECTOR === 'true';
}

// ============================================================
// DASHBOARD QUERIES
// ============================================================

// Aba 1: VisÃ£o Executiva
export async function getExecutiveKpis(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  leads_received: number;
  leads_attended: number;
  leads_lost: number;
  sales_won: number;
  conversion_rate: number;
  revenue_cents: number;
  ticket_avg_cents: number;
  avg_first_response_min: number;
  avg_quality_score: number;
}> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  const result = await query<{
    leads_received: string;
    leads_attended: string;
    leads_lost: string;
    sales_won: string;
    conversion_rate: string;
    revenue_cents: string;
    ticket_avg_cents: string;
    avg_first_response_min: string;
    avg_quality_score: string;
  }>(
    `SELECT
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads_received,
      COUNT(DISTINCT c.id) FILTER (WHERE c.last_message_at IS NOT NULL AND c.created_at >= $1 AND c.created_at <= $2) as leads_attended,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'lost' AND so.updated_at >= $1 AND so.updated_at <= $2) as leads_lost,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND so.updated_at >= $1 AND so.updated_at <= $2) as sales_won,
      -- Taxa de conversão = vendas ganhas / (vendas ganhas + perdas) * 100
      -- Denominador: APENAS conversas fechadas (won + lost), NÃO total de conversas
      -- Exclui conversas ainda em andamento (sem outcome ou outcome = 'pending')
      COALESCE(ROUND(100.0 * COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND so.updated_at >= $1 AND so.updated_at <= $2)::numeric / NULLIF(COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome IN ('won', 'lost') AND so.updated_at >= $1 AND so.updated_at <= $2), 0)), 0) as conversion_rate,
      COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won' AND so.updated_at >= $1 AND so.updated_at <= $2), 0) as revenue_cents,
      COALESCE(AVG(so.value_cents) FILTER (WHERE so.outcome = 'won' AND so.updated_at >= $1 AND so.updated_at <= $2), 0) as ticket_avg_cents,
      COALESCE(AVG(
        GREATEST(0, EXTRACT(EPOCH FROM (m_out.timestamp - m_in.timestamp)) / 60)
      ) FILTER (WHERE m_in.timestamp IS NOT NULL AND m_out.timestamp IS NOT NULL AND c.created_at >= $1 AND c.created_at <= $2), 0) as avg_first_response_min,
      COALESCE(AVG(ci.quality_score), 0) as avg_quality_score
    FROM conversations c
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    LEFT JOIN LATERAL (
      SELECT m.timestamp
      FROM messages m
      WHERE m.conversation_id = c.id AND m.direction = 'inbound'
      ORDER BY m.timestamp ASC
      LIMIT 1
    ) m_in ON true
    LEFT JOIN LATERAL (
      SELECT m.timestamp
      FROM messages m
      WHERE m.conversation_id = c.id AND m.direction = 'outbound'
        AND m.timestamp > m_in.timestamp
      ORDER BY m.timestamp ASC
      LIMIT 1
    ) m_out ON true
    WHERE ($3::uuid IS NULL OR c.seller_id = $3)`,
    [start, end, sellerId || null]
  );

  const row = result.rows[0];
  console.log('[DEBUG getExecutiveKpis]', new Date().toISOString(), 'Raw row:', JSON.stringify(row));
  const kpisResult = {
    leads_received: parseInt(row.leads_received) || 0,
    leads_attended: parseInt(row.leads_attended) || 0,
    leads_lost: parseInt(row.leads_lost) || 0,
    sales_won: parseInt(row.sales_won) || 0,
    conversion_rate: parseFloat(row.conversion_rate) || 0,
    revenue_cents: parseInt(row.revenue_cents) || 0,
    ticket_avg_cents: parseInt(row.ticket_avg_cents) || 0,
    avg_first_response_min: parseFloat(row.avg_first_response_min) || 0,
    avg_quality_score: parseFloat(row.avg_quality_score) || 0,
  };
  console.log('[DEBUG getExecutiveKpis] Parsed:', JSON.stringify(kpisResult));
  return kpisResult;
}

export async function getLeadsByTemperature(
  sellerId?: string
): Promise<Array<{ temperature: string; count: number }>> {
  const result = await query<{ temperature: string; count: string }>(
    `SELECT
      CASE
        WHEN ci.quality_score >= 80 THEN 'hot'
        WHEN ci.quality_score >= 50 THEN 'warm'
        ELSE 'cold'
      END as temperature,
      COUNT(DISTINCT c.id) as count
    FROM conversations c
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)
    GROUP BY temperature
    ORDER BY temperature`,
    [sellerId || null]
  );

  return result.rows.map(r => ({
    temperature: r.temperature,
    count: parseInt(r.count) || 0,
  }));
}

export async function getDailyEvolution(
  sellerId?: string,
  days = 30
): Promise<Array<{ date: string; leads: number; conversions: number; revenue: number }>> {
  const result = await query<{ date: string; leads: string; conversions: string; revenue: string }>(
    `SELECT
      DATE(c.created_at AT TIME ZONE 'America/Sao_Paulo') as date,
      COUNT(DISTINCT c.id) as leads,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won') as conversions,
      COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won'), 0) as revenue
    FROM conversations c
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
      AND DATE(so.updated_at AT TIME ZONE 'America/Sao_Paulo') = DATE(c.created_at AT TIME ZONE 'America/Sao_Paulo')
    WHERE c.created_at >= NOW() - INTERVAL '1 day' * $2
      AND ($1::uuid IS NULL OR c.seller_id = $1)
    GROUP BY DATE(c.created_at AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY date DESC
    LIMIT $2`,
    [sellerId || null, days]
  );

  return result.rows.map(r => ({
    date: r.date,
    leads: parseInt(r.leads) || 0,
    conversions: parseInt(r.conversions) || 0,
    revenue: parseInt(r.revenue) || 0,
  }));
}

// Aba 2: Funil Comercial
export async function getFunnelStages(
  sellerId?: string
): Promise<Array<{ stage: string; count: number; value_cents: number }>> {
  const result = await query<{ stage: string; count: string; value_cents: string }>(
    `SELECT
      c.funnel_stage as stage,
      COUNT(DISTINCT c.id) as count,
      COALESCE(SUM(so.value_cents), 0) as value_cents
    FROM conversations c
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id AND so.outcome = 'pending'
    WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)
    GROUP BY c.funnel_stage
    ORDER BY 
      CASE c.funnel_stage
        WHEN 'lead' THEN 1
        WHEN 'qualificacao' THEN 2
        WHEN 'proposta' THEN 3
        WHEN 'fechamento' THEN 4
        WHEN 'pos_venda' THEN 5
      END`,
    [sellerId || null]
  );

  return result.rows.map(r => ({
    stage: r.stage,
    count: parseInt(r.count) || 0,
    value_cents: parseInt(r.value_cents) || 0,
  }));
}

export async function getConversionByStage(
  sellerId?: string
): Promise<Array<{ stage_from: string; stage_to: string; rate: number }>> {
  // Calcular conversao baseada em mensagens e outcomes
  const result = await query<{
    total_leads: string;
    qualified: string;
    proposed: string;
    closed: string;
  }>(
    `SELECT
      COUNT(DISTINCT c.id) as total_leads,
      COUNT(DISTINCT CASE WHEN ml.funnel_stage IN ('qualificacao', 'proposta', 'fechamento') THEN c.id END) as qualified,
      COUNT(DISTINCT CASE WHEN ml.funnel_stage IN ('proposta', 'fechamento') THEN c.id END) as proposed,
      COUNT(DISTINCT CASE WHEN so.outcome = 'won' THEN c.id END) as closed
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN message_labels ml ON ml.message_id = m.id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    WHERE ($1::uuid IS NULL OR c.seller_id = $1)`,
    [sellerId || null]
  );

  const row = result.rows[0];
  const total = parseInt(row.total_leads) || 1;
  const qualified = parseInt(row.qualified) || 0;
  const proposed = parseInt(row.proposed) || 0;
  const closed = parseInt(row.closed) || 0;

  return [
    { stage_from: 'lead', stage_to: 'qualificacao', rate: total > 0 ? qualified / total : 0 },
    { stage_from: 'qualificacao', stage_to: 'proposta', rate: qualified > 0 ? proposed / qualified : 0 },
    { stage_from: 'proposta', stage_to: 'fechamento', rate: proposed > 0 ? closed / proposed : 0 },
  ];
}

export async function getLossReasons(
  sellerId?: string,
  limit = 10
): Promise<Array<{ reason: string; count: number; percentage: number }>> {
  const result = await query<{ reason: string; count: string; percentage: string }>(
    `SELECT
      COALESCE(so.loss_reason, 'NÃ£o informado') as reason,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
    FROM sales_outcomes so
    JOIN conversations c ON c.id = so.conversation_id
    WHERE so.outcome = 'lost'
      AND ($1::uuid IS NULL OR c.seller_id = $1)
    GROUP BY so.loss_reason
    ORDER BY count DESC
    LIMIT $2`,
    [sellerId || null, limit]
  );

  return result.rows.map(r => ({
    reason: r.reason,
    count: parseInt(r.count) || 0,
    percentage: parseFloat(r.percentage) || 0,
  }));
}

// Aba 3: Performance Vendedores
export async function getSellerRanking(
  sortBy: 'revenue' | 'conversion' | 'leads' = 'revenue',
  limit = 10,
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<Array<{
  seller_id: string;
  seller_name: string;
  leads: number;
  conversions: number;
  revenue_cents: number;
  conversion_rate: number;
  avg_quality: number;
}>> {
  const orderBy = {
    revenue: 'revenue_cents DESC',
    conversion: 'conversion_rate DESC',
    leads: 'leads DESC',
  }[sortBy];

  const result = await query<{
    seller_id: string;
    seller_name: string;
    leads: string;
    conversions: string;
    revenue_cents: string;
    conversion_rate: string;
    avg_quality: string;
  }>(
    `SELECT
      s.id as seller_id,
      s.name as seller_name,
      COUNT(DISTINCT c.id) FILTER (WHERE ($3::timestamptz IS NULL OR c.created_at >= $3) AND ($4::timestamptz IS NULL OR c.created_at <= $4)) as leads,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND ($3::timestamptz IS NULL OR so.updated_at >= $3) AND ($4::timestamptz IS NULL OR so.updated_at <= $4)) as conversions,
      COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won' AND ($3::timestamptz IS NULL OR so.updated_at >= $3) AND ($4::timestamptz IS NULL OR so.updated_at <= $4)), 0) as revenue_cents,
      -- Taxa de conversão = vendas ganhas / (vendas ganhas + perdas) * 100
      -- Denominador: APENAS conversas fechadas (won + lost), NÃO total de conversas
      -- Exclui conversas ainda em andamento (sem outcome ou outcome = 'pending')
      COALESCE(
        100.0 * COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND ($3::timestamptz IS NULL OR so.updated_at >= $3) AND ($4::timestamptz IS NULL OR so.updated_at <= $4))
        / NULLIF(COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome IN ('won', 'lost') AND ($3::timestamptz IS NULL OR so.updated_at >= $3) AND ($4::timestamptz IS NULL OR so.updated_at <= $4)), 0),
        0
      ) as conversion_rate,
      COALESCE(AVG(ci.quality_score) FILTER (WHERE ($3::timestamptz IS NULL OR c.created_at >= $3) AND ($4::timestamptz IS NULL OR c.created_at <= $4)), 0) as avg_quality
    FROM sellers s
    LEFT JOIN conversations c ON c.seller_id = s.id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE s.active = true
      AND ($2::uuid IS NULL OR s.id = $2)
    GROUP BY s.id, s.name
    ORDER BY ${orderBy}
    LIMIT $1`,
    [limit, sellerId || null, startDate || null, endDate || null]
  );

  return result.rows.map(r => ({
    seller_id: r.seller_id,
    seller_name: r.seller_name,
    leads: parseInt(r.leads) || 0,
    conversions: parseInt(r.conversions) || 0,
    revenue_cents: parseInt(r.revenue_cents) || 0,
    conversion_rate: parseFloat(r.conversion_rate) || 0,
    avg_quality: parseFloat(r.avg_quality) || 0,
  }));
}

// Aba 4: Conversas e IA
export async function getConversationMetrics(
  sellerId?: string,
  days = 7
): Promise<{
  total_conversations: number;
  total_messages: number;
  avg_response_time_min: number;
  objection_count: number;
}> {
  const result = await query<{
    total_conversations: string;
    total_messages: string;
    avg_response_time_min: string;
    objection_count: string;
  }>(
    `SELECT
      COUNT(DISTINCT c.id) as total_conversations,
      COUNT(m.id) as total_messages,
      COALESCE(AVG(
        EXTRACT(EPOCH FROM (m_out.timestamp - m_in.timestamp)) / 60
      ), 0) as avg_response_time_min,
      COUNT(ml.id) FILTER (WHERE ml.objection IS NOT NULL AND ml.objection != '') as objection_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN message_labels ml ON ml.message_id = m.id
    LEFT JOIN LATERAL (
      SELECT m2.timestamp
      FROM messages m2
      WHERE m2.conversation_id = c.id
        AND m2.direction = 'outbound'
        AND m2.timestamp > m.timestamp
      ORDER BY m2.timestamp ASC
      LIMIT 1
    ) m_out ON m.direction = 'inbound'
    LEFT JOIN LATERAL (
      SELECT m_in2.timestamp
      FROM messages m_in2
      WHERE m_in2.conversation_id = c.id
        AND m_in2.direction = 'inbound'
        AND m_in2.timestamp < m_out.timestamp
      ORDER BY m_in2.timestamp DESC
      LIMIT 1
    ) m_in ON true
    WHERE c.created_at >= NOW() - INTERVAL '1 day' * $2
      AND ($1::uuid IS NULL OR c.seller_id = $1)`,
    [sellerId || null, days]
  );

  const row = result.rows[0];
  return {
    total_conversations: parseInt(row.total_conversations) || 0,
    total_messages: parseInt(row.total_messages) || 0,
    avg_response_time_min: parseFloat(row.avg_response_time_min) || 0,
    objection_count: parseInt(row.objection_count) || 0,
  };
}

export async function getObjectionsDetected(
  sellerId?: string,
  limit = 10
): Promise<Array<{ objection: string; count: number }>> {
  const result = await query<{ objection: string; count: string }>(
    `SELECT
      ml.objection,
      COUNT(*) as count
    FROM message_labels ml
    JOIN messages m ON m.id = ml.message_id
    JOIN conversations c ON c.id = m.conversation_id
    WHERE ml.objection IS NOT NULL AND ml.objection != ''
      AND ($1::uuid IS NULL OR c.seller_id = $1)
    GROUP BY ml.objection
    ORDER BY count DESC
    LIMIT $2`,
    [sellerId || null, limit]
  );

  return result.rows.map(r => ({
    objection: r.objection,
    count: parseInt(r.count) || 0,
  }));
}

// Aba 5: Follow-up
export async function getFollowupStats(
  sellerId?: string
): Promise<{
  pending: number;
  overdue: number;
  forgotten: number;
  avg_followup_conversion: number;
}> {
  const result = await query<{
    pending: string;
    overdue: string;
    forgotten: string;
    avg_followup_conversion: string;
  }>(
    `SELECT
      COUNT(DISTINCT c.id) FILTER (
        WHERE c.status = 'open'
        AND c.last_message_at >= NOW() - INTERVAL '7 days'
      ) as pending,
      COUNT(DISTINCT c.id) FILTER (
        WHERE c.status = 'open'
        AND c.last_message_at < NOW() - INTERVAL '7 days'
        AND c.last_message_at >= NOW() - INTERVAL '14 days'
      ) as overdue,
      COUNT(DISTINCT c.id) FILTER (
        WHERE c.status = 'open'
        AND c.last_message_at < NOW() - INTERVAL '14 days'
      ) as forgotten,
      COALESCE(AVG(
        CASE WHEN so.outcome = 'won' THEN 1 ELSE 0 END
      ) FILTER (WHERE so.outcome IS NOT NULL), 0) as avg_followup_conversion
    FROM conversations c
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    WHERE ($1::uuid IS NULL OR c.seller_id = $1)`,
    [sellerId || null]
  );

  const row = result.rows[0];
  return {
    pending: parseInt(row.pending) || 0,
    overdue: parseInt(row.overdue) || 0,
    forgotten: parseInt(row.forgotten) || 0,
    avg_followup_conversion: parseFloat(row.avg_followup_conversion) || 0,
  };
}

export async function getConversationsNeedingFollowup(
  sellerId?: string,
  limit = 20
): Promise<Array<{
  conversation_id: string;
  contact_name: string;
  last_message_at: Date;
  quality_score: number;
  next_action: string;
}>> {
  const result = await query<{
    conversation_id: string;
    contact_name: string;
    last_message_at: Date;
    quality_score: string;
    next_action: string;
  }>(
    `SELECT
      c.id as conversation_id,
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      c.last_message_at,
      COALESCE(ci.quality_score, 0) as quality_score,
      COALESCE(
        ci.next_best_actions->0->>'action',
        'Reativar conversa'
      ) as next_action
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    WHERE c.status = 'open'
      AND c.last_message_at < NOW() - INTERVAL '3 days'
      AND ($1::uuid IS NULL OR c.seller_id = $1)
    ORDER BY c.last_message_at ASC
    LIMIT $2`,
    [sellerId || null, limit]
  );

  return result.rows.map(r => ({
    conversation_id: r.conversation_id,
    contact_name: r.contact_name,
    last_message_at: r.last_message_at,
    quality_score: parseFloat(r.quality_score) || 0,
    next_action: r.next_action,
  }));
}

// ============================================================

export const queries = {
  // Sellers
  getDefaultSeller,
  getSellerById,
  
  // Contacts
  upsertContact,
  getContactByPhone,
  
  // Conversations
  upsertConversation,
  getConversationById,
  updateConversationLastMessage,
  
  // Messages
  insertMessage,
  getMessageById,
  getMessagesByConversation,
  getRecentMessagesForContext,
  getMessagesForAnalysis,
  
  // Transcripts
  getTranscriptByMediaSha256,
  insertTranscript,
  getTranscriptByMessageId,
  
  // Labels
  insertLabels,
  getLabelsByMessageId,
  
  // Insights
  upsertConversationInsights,
  getInsightsByConversationId,
  
  // Outcomes
  setOutcome,
  getOutcomeByConversationId,
  
  // RAG
  saveRagChunk,
  findSimilarRagChunks,
  findRagChunksByText,
  
  // Reports
  saveDailyReport,
  getDailyReport,
  saveWeeklyReport,
  getWeeklyReport,
  
  // Config
  isRagVectorEnabled,
  
  // Admin
  getConversationsForAdmin,
  getConversationDetail,
  
  // Dashboard
  getExecutiveKpis,
  getLeadsByTemperature,
  getDailyEvolution,
  getFunnelStages,
  getConversionByStage,
  getLossReasons,
  getSellerRanking,
  getConversationMetrics,
  getObjectionsDetected,
  getFollowupStats,
  getConversationsNeedingFollowup,
};

export default queries;

// ============================================================
// FUNCOES AVANCADAS COM FILTROS DE PERIODO
// ============================================================

export async function getSellerPerformanceFull(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<Array<any>> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const result = await query<any>(
    `SELECT s.id as seller_id, s.name as seller_name, s.monthly_goal_cents,
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $2) as leads,
      COUNT(DISTINCT c.id) as conversations,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND c.created_at >= $2) as vendas,
      COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won' AND c.created_at >= $2), 0) as revenue_cents,
      -- Taxa de conversão = vendas ganhas / (vendas ganhas + perdas) * 100
      -- Denominador: APENAS conversas fechadas (won + lost), NÃO total de conversas
      -- Exclui conversas ainda em andamento (sem outcome ou outcome = 'pending')
      COALESCE(100.0 * COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND c.created_at >= $2) / NULLIF(COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome IN ('won', 'lost') AND c.created_at >= $2), 0), 0) as conversion_rate
    FROM sellers s
    LEFT JOIN conversations c ON c.seller_id = s.id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    WHERE s.active = true AND ($1::uuid IS NULL OR s.id = $1)
    GROUP BY s.id, s.name
    ORDER BY revenue_cents DESC`,
    [sellerId || null, startDate || startOfMonth]
  );
  
  return result.rows.map((r: any) => ({
    seller_id: r.seller_id,
    seller_name: r.seller_name,
    leads: parseInt(r.leads) || 0,
    conversations: parseInt(r.conversations) || 0,
    vendas: parseInt(r.vendas) || 0,
    revenue_cents: parseInt(r.revenue_cents) || 0,
    ticket_medio_cents: 0,
    conversion_rate: parseFloat(r.conversion_rate) || 0,
    avg_quality: 0,
    meta_mensal: parseInt(r.monthly_goal_cents) || 5000000,
    projecao_mensal: 0,
    dias_trabalhados: 1,
    dias_uteis_mes: 22,
    daily_stats: [],
  }));
}

export async function getLossStats(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<any> {
  const stageResult = await query<any>(
    `SELECT c.funnel_stage as stage, COUNT(DISTINCT c.id) as total,
      COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'lost') as lost
    FROM conversations c
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    WHERE ($1::uuid IS NULL OR c.seller_id = $1)
      AND ($2::timestamp IS NULL OR c.created_at >= $2)
      AND ($3::timestamp IS NULL OR c.created_at <= $3)
    GROUP BY c.funnel_stage`,
    [sellerId || null, startDate || null, endDate || null]
  );

  const lossReasonsResult = await query<any>(
    `SELECT COALESCE(so.loss_reason, 'Nao informado') as reason, COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as percentage
    FROM sales_outcomes so
    JOIN conversations c ON c.id = so.conversation_id
    WHERE so.outcome = 'lost'
      AND ($1::uuid IS NULL OR c.seller_id = $1)
      AND ($2::timestamp IS NULL OR so.updated_at >= $2)
      AND ($3::timestamp IS NULL OR so.updated_at <= $3)
    GROUP BY so.loss_reason
    ORDER BY count DESC LIMIT 10`,
    [sellerId || null, startDate || null, endDate || null]
  );

  return {
    by_stage: stageResult.rows.map((r: any) => ({ stage: r.stage, total: parseInt(r.total) || 0, lost: parseInt(r.lost) || 0, loss_rate: parseInt(r.total) > 0 ? (parseInt(r.lost) / parseInt(r.total)) * 100 : 0 })),
    by_objection: [],
    objection_breakdown: [],
    loss_reasons: lossReasonsResult.rows.map((r: any) => ({ reason: r.reason, count: parseInt(r.count) || 0, percentage: parseFloat(r.percentage) || 0 })),
    summary: { total_conversations: 0, lost_at_lead: 0, lost_at_qualificacao: 0, lost_at_proposta: 0, lost_at_fechamento: 0, overall_loss_rate: 0 },
  };
}

export async function getSellerDetailedAnalysis(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<any> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  const sellerResult = await query<any>(
    `SELECT s.id as seller_id, s.name as seller_name,
      COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage = 'lead') as lead_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage IN ('qualificacao', 'proposta', 'fechamento', 'closed_won')) as qualificacao_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage IN ('proposta', 'fechamento', 'closed_won')) as proposta_count,
      COUNT(DISTINCT c.id) FILTER (WHERE c.funnel_stage IN ('fechamento', 'closed_won')) as fechamento_count
    FROM sellers s
    LEFT JOIN conversations c ON c.seller_id = s.id AND c.created_at >= $1 AND c.created_at <= $2
    WHERE ($3::uuid IS NULL OR s.id = $3)
    GROUP BY s.id, s.name`,
    [start, end, sellerId || null]
  );

  const row = sellerResult.rows[0];
  const leadCount = parseInt(row?.lead_count) || 0;
  const qualificacaoCount = parseInt(row?.qualificacao_count) || 0;
  const propostaCount = parseInt(row?.proposta_count) || 0;
  const fechamentoCount = parseInt(row?.fechamento_count) || 0;

  return {
    seller_id: row?.seller_id || sellerId || '',
    seller_name: row?.seller_name || 'Unknown',
    conversion_by_stage: {
      lead_to_qualificacao: leadCount > 0 ? (qualificacaoCount / leadCount) * 100 : 0,
      qualificacao_to_proposta: qualificacaoCount > 0 ? (propostaCount / qualificacaoCount) * 100 : 0,
      proposta_to_fechamento: propostaCount > 0 ? (fechamentoCount / propostaCount) * 100 : 0,
    },
    avg_first_response_min: 0,
    avg_response_time_category: 'N/A',
    objections_strong: [],
    objections_weak: [],
    team_avg_conversion: 0,
    performance_vs_team: 0,
    peak_hours: [],
    best_hour: 10,
  };
}

export async function getFollowupFull(
  sellerId?: string,
  filters?: any
): Promise<any> {
  const limit = filters?.limit || 50;

  const result = await query<any>(
    `SELECT 
      c.id as conversation_id, 
      COALESCE(ct.display_name, ct.phone_e164) as contact_name,
      ct.phone_e164 as contact_phone,
      COALESCE(ci.quality_score, 50) as quality_score, 
      c.last_message_at, 
      ci.next_best_actions->0->>'action' as next_action, 
      c.funnel_stage,
      c.seller_id,
      s.name as seller_name,
      m.text as last_message_text,
      m.direction as last_message_direction,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN conversation_insights ci ON ci.conversation_id = c.id
    LEFT JOIN sellers s ON s.id = c.seller_id
    LEFT JOIN LATERAL (
      SELECT text, direction FROM messages 
      WHERE conversation_id = c.id 
      ORDER BY timestamp DESC 
      LIMIT 1
    ) m ON true
    WHERE c.status = 'open' AND ($1::uuid IS NULL OR c.seller_id = $1)
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT $2`,
    [sellerId || null, limit]
  );

  const now = new Date();
  const conversations = result.rows.map((r: any) => {
    const lastMessageAt = r.last_message_at ? new Date(r.last_message_at) : new Date();
    const daysSince = Math.floor((now.getTime() - lastMessageAt.getTime()) / (1000 * 60 * 60 * 24));
    const score = parseInt(r.quality_score) || 50;
    return {
      conversation_id: r.conversation_id, 
      contact_id: r.contact_id || '',
      contact_name: r.contact_name, 
      contact_phone: r.contact_phone || '',
      seller_id: r.seller_id || '',
      seller_name: r.seller_name || 'Vendedor',
      funnel_stage: r.funnel_stage,
      last_message_at: lastMessageAt,
      last_message_text: r.last_message_text || '',
      last_message_direction: r.last_message_direction || '',
      days_since_contact: daysSince, 
      quality_score: score, 
      temperature: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
      urgency: daysSince > 7 ? 'critical' : daysSince > 3 ? 'high' : 'medium',
      next_action: r.next_action || 'Follow-up',
      tags: [],
      potential_value: 0,
      message_count: parseInt(r.message_count) || 0,
    };
  });

  // Calcular estatísticas
  const statsResult = await query<any>(
    `SELECT 
      COUNT(*) FILTER (WHERE status = 'open') as pending,
      COUNT(*) FILTER (WHERE status = 'open' AND last_message_at < NOW() - INTERVAL '3 days' AND last_message_at >= NOW() - INTERVAL '7 days') as overdue,
      COUNT(*) FILTER (WHERE status = 'open' AND last_message_at < NOW() - INTERVAL '7 days') as forgotten,
      COUNT(*) FILTER (WHERE status = 'open' AND last_message_at >= NOW() - INTERVAL '1 day') as today,
      COUNT(*) FILTER (WHERE status = 'open' AND last_message_at >= NOW() - INTERVAL '7 days') as this_week
    FROM conversations
    WHERE ($1::uuid IS NULL OR seller_id = $1)`,
    [sellerId || null]
  );

  const stats = statsResult.rows[0] || { pending: 0, overdue: 0, forgotten: 0, today: 0, this_week: 0 };

  // Calcular temperatura
  const hot = conversations.filter(c => c.temperature === 'hot').length;
  const warm = conversations.filter(c => c.temperature === 'warm').length;
  const cold = conversations.filter(c => c.temperature === 'cold').length;
  const avgDays = conversations.length > 0 
    ? conversations.reduce((sum: number, c: any) => sum + c.days_since_contact, 0) / conversations.length 
    : 0;

  // Por vendedor
  const bySeller: Record<string, { seller_id: string; seller_name: string; pending_count: number; overdue_count: number }> = {};
  for (const c of conversations) {
    if (!bySeller[c.seller_id]) {
      bySeller[c.seller_id] = { seller_id: c.seller_id, seller_name: c.seller_name, pending_count: 0, overdue_count: 0 };
    }
    bySeller[c.seller_id].pending_count++;
    if (c.days_since_contact > 3) bySeller[c.seller_id].overdue_count++;
  }

  return { 
    items: conversations, 
    stats: {
      total_pending: parseInt(stats.pending) || 0,
      overdue: parseInt(stats.overdue) || 0,
      today: parseInt(stats.today) || 0,
      this_week: parseInt(stats.this_week) || 0,
      forgotten: parseInt(stats.forgotten) || 0,
      hot,
      warm,
      cold,
      avg_days_since_contact: avgDays,
    },
    by_seller: Object.values(bySeller),
  };
}

export async function getFollowupHistory(sellerId?: string, days = 30): Promise<any> {
  return [];
}

export async function getObjectionResolutionRate(sellerId?: string, startDate?: Date, endDate?: Date): Promise<number> {
  return 0;
}



// ============================================================
// REVIEW IMPLEMENTATION
// ============================================================

export async function getPendingReviews(limit: number = 50, offset: number = 0): Promise<any[]> {
  const result = await query<any>(
    `SELECT hr.*, c.contact_id, ct.display_name as contact_name
     FROM human_reviews hr
     JOIN conversations c ON c.id = hr.conversation_id
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE hr.status = 'pending'
     ORDER BY hr.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

export async function getReviewById(id: string): Promise<any> {
  const result = await query<any>(
    `SELECT hr.*, c.contact_id, ct.display_name as contact_name
     FROM human_reviews hr
     JOIN conversations c ON c.id = hr.conversation_id
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE hr.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function approveReview(id: string, reviewer: string, outcome: string, valueCents?: number, notes?: string): Promise<boolean> {
  return await transaction(async (client) => {
    // Buscar a revisão
    const reviewRes = await client.query(
      'SELECT * FROM human_reviews WHERE id = $1 AND status = $2',
      [id, 'pending']
    );
    
    if (reviewRes.rows.length === 0) {
      return false;
    }
    
    const review = reviewRes.rows[0];
    
    // Atualizar a revisão
    await client.query(
      `UPDATE human_reviews 
       SET status = 'approved', reviewer = $1, reviewed_at = NOW(), notes = COALESCE($2, notes)
       WHERE id = $3`,
      [reviewer, notes, id]
    );
    
    // Criar sales_outcome
    await client.query(
      `INSERT INTO sales_outcomes (conversation_id, outcome, value_cents, loss_reason)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (conversation_id) 
       DO UPDATE SET outcome = $2, value_cents = $3, updated_at = NOW()`,
      [review.conversation_id, review.suggested_outcome, valueCents || review.suggested_value_cents]
    );
    
    // Atualizar conversa
    await client.query(
      `UPDATE conversations SET status = 'closed', funnel_stage = CASE WHEN $1 = 'won' THEN 'closed_won' ELSE 'closed_lost' END WHERE id = $2`,
      [review.suggested_outcome, review.conversation_id]
    );
    
    return true;
  });
}

export async function rejectReview(id: string, reviewer: string, notes?: string): Promise<boolean> {
  const result = await query(
    `UPDATE human_reviews 
     SET status = 'rejected', reviewer = $1, reviewed_at = NOW(), notes = COALESCE($2, notes)
     WHERE id = $3 AND status = 'pending'
     RETURNING id`,
    [reviewer, notes, id]
  );
  return result.rowCount > 0;
}

export async function getReviewStats(): Promise<any> {
  const result = await query<any>(
    `SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COALESCE(AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600) FILTER (WHERE reviewed_at IS NOT NULL), 0) as avg_resolution_time_hours
    FROM human_reviews`
  );
  return {
    pending: parseInt(result.rows[0].pending) || 0,
    approved: parseInt(result.rows[0].approved) || 0,
    rejected: parseInt(result.rows[0].rejected) || 0,
    avg_resolution_time_hours: parseFloat(result.rows[0].avg_resolution_time_hours) || 0,
  };
}





// ============================================================
// CONTATADOS - Conversas iniciadas pelo vendedor
// ============================================================
export async function getContatados(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ total: number; period: number }> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  const result = await query<{ total: string; period: string }>(
    `WITH primeira_msg AS (
      SELECT 
        m.conversation_id,
        m.direction,
        m.seller_id,
        m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
      FROM messages m
    )
    SELECT 
      COUNT(DISTINCT pm.conversation_id)::text as total,
      COUNT(DISTINCT pm.conversation_id) FILTER (
        WHERE pm.timestamp >= $1 AND pm.timestamp <= $2
      )::text as period
    FROM primeira_msg pm
    WHERE pm.rn = 1 
      AND pm.direction = 'outbound'
      AND ($3::uuid IS NULL OR pm.seller_id = $3)`,
    [start, end, sellerId || null]
  );

  const row = result.rows[0];
  return {
    total: parseInt(row.total) || 0,
    period: parseInt(row.period) || 0,
  };
}

// ============================================================
// HUMAN REVIEW
// ============================================================

export interface CreateHumanReviewInput {
  conversation_id: string;
  suggested_outcome: 'won' | 'lost' | 'in_progress';
  suggested_value_cents?: number;
  confidence: number;
  reason: string;
  message_text?: string;
  trace_id?: string;
}

export async function createHumanReview(input: CreateHumanReviewInput): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO human_reviews (
      conversation_id, suggested_outcome, suggested_value_cents, confidence, reason, message_text, trace_id, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
    RETURNING id`,
    [
      input.conversation_id,
      input.suggested_outcome,
      input.suggested_value_cents || null,
      input.confidence,
      input.reason,
      input.message_text || null,
      input.trace_id || null,
    ]
  );
  return result.rows[0];
}
