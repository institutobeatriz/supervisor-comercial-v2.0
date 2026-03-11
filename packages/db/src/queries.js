/**
 * Database Queries
 * Supervisor Comercial - All required queries
 */
import { query } from './pool.js';
// ============================================================
// SELLERS
// ============================================================
export async function getDefaultSeller() {
    const result = await query('SELECT * FROM sellers WHERE active = true ORDER BY created_at LIMIT 1');
    return result.rows[0] || null;
}
export async function getSellerById(id) {
    const result = await query('SELECT * FROM sellers WHERE id = $1', [id]);
    return result.rows[0] || null;
}
// ============================================================
// CONTACTS - upsertContact
// ============================================================
export async function upsertContact(input) {
    const result = await query(`INSERT INTO contacts (phone_e164, display_name, tags)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_e164) 
     DO UPDATE SET 
       display_name = COALESCE($2, contacts.display_name),
       tags = CASE 
         WHEN $3::jsonb = '[]'::jsonb THEN contacts.tags 
         ELSE $3::jsonb 
       END
     RETURNING *`, [input.phone_e164, input.display_name || null, JSON.stringify(input.tags || [])]);
    return result.rows[0];
}
export async function getContactByPhone(phone) {
    const result = await query('SELECT * FROM contacts WHERE phone_e164 = $1', [phone]);
    return result.rows[0] || null;
}
// ============================================================
// CONVERSATIONS - upsertConversation
// ============================================================
export async function upsertConversation(input) {
    // Buscar conversa aberta existente
    const existing = await query(`SELECT * FROM conversations 
     WHERE contact_id = $1 AND status = 'open'
     ORDER BY created_at DESC 
     LIMIT 1`, [input.contact_id]);
    if (existing.rows[0]) {
        return existing.rows[0];
    }
    // Criar nova conversa
    const result = await query(`INSERT INTO conversations (contact_id, seller_id, status, funnel_stage)
     VALUES ($1, $2, 'open', 'lead')
     RETURNING *`, [input.contact_id, input.seller_id]);
    return result.rows[0];
}
export async function getConversationById(id) {
    const result = await query('SELECT * FROM conversations WHERE id = $1', [id]);
    return result.rows[0] || null;
}
export async function updateConversationLastMessage(id) {
    await query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [id]);
}
// ============================================================
// MESSAGES - insertMessage
// ============================================================
export async function insertMessage(input) {
    const result = await query(`INSERT INTO messages 
     (conversation_id, seller_id, direction, type, text, media_url, media_mime, media_sha256, timestamp, raw_event)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`, [
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
    ]);
    return result.rows[0];
}
export async function getMessageById(id) {
    const result = await query('SELECT * FROM messages WHERE id = $1', [id]);
    return result.rows[0] || null;
}
export async function getMessagesByConversation(conversationId, limit = 50) {
    const result = await query(`SELECT * FROM messages 
     WHERE conversation_id = $1 
     ORDER BY timestamp ASC 
     LIMIT $2`, [conversationId, limit]);
    return result.rows;
}
export async function getRecentMessagesForContext(conversationId, beforeTimestamp, limit = 3) {
    const result = await query(`SELECT * FROM messages 
     WHERE conversation_id = $1 AND timestamp < $2
     ORDER BY timestamp DESC 
     LIMIT $3`, [conversationId, beforeTimestamp, limit]);
    return result.rows.reverse(); // Ordem cronológica
}
export async function getMessagesForAnalysis(conversationId, limit = 40) {
    const result = await query(`SELECT * FROM messages 
     WHERE conversation_id = $1 
     ORDER BY timestamp ASC 
     LIMIT $2`, [conversationId, limit]);
    return result.rows;
}
// ============================================================
// AUDIO_TRANSCRIPTS - insertTranscript (com cache)
// ============================================================
export async function getTranscriptByMediaSha256(sha256) {
    const result = await query(`SELECT at.* FROM audio_transcripts at
     JOIN messages m ON m.id = at.message_id
     WHERE m.media_sha256 = $1
     LIMIT 1`, [sha256]);
    return result.rows[0] || null;
}
export async function insertTranscript(input) {
    const result = await query(`INSERT INTO audio_transcripts 
     (message_id, transcript, confidence, duration_sec, provider)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [
        input.message_id,
        input.transcript,
        input.confidence || null,
        input.duration_sec || null,
        input.provider,
    ]);
    return result.rows[0];
}
export async function getTranscriptByMessageId(messageId) {
    const result = await query('SELECT * FROM audio_transcripts WHERE message_id = $1', [messageId]);
    return result.rows[0] || null;
}
// ============================================================
// MESSAGE_LABELS - insertLabels
// ============================================================
export async function insertLabels(input) {
    const result = await query(`INSERT INTO message_labels 
     (message_id, intent, objection, urgency, sentiment, funnel_stage, language, needs_attention, attention_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (message_id) 
     DO UPDATE SET 
       intent = $2, objection = $3, urgency = $4, sentiment = $5,
       funnel_stage = $6, language = $7, needs_attention = $8, attention_reason = $9
     RETURNING *`, [
        input.message_id,
        input.intent,
        input.objection,
        input.urgency,
        input.sentiment,
        input.funnel_stage,
        input.language,
        input.needs_attention,
        input.attention_reason,
    ]);
    return result.rows[0];
}
export async function getLabelsByMessageId(messageId) {
    const result = await query('SELECT * FROM message_labels WHERE message_id = $1', [messageId]);
    return result.rows[0] || null;
}
// ============================================================
// CONVERSATION_INSIGHTS - upsertConversationInsights
// ============================================================
export async function upsertConversationInsights(input) {
    const result = await query(`INSERT INTO conversation_insights 
     (conversation_id, quality_score, wins, mistakes, next_best_actions, summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (conversation_id) 
     DO UPDATE SET 
       quality_score = $2, wins = $3, mistakes = $4, 
       next_best_actions = $5, summary = $6, updated_at = NOW()
     RETURNING *`, [
        input.conversation_id,
        input.quality_score,
        JSON.stringify(input.wins),
        JSON.stringify(input.mistakes),
        JSON.stringify(input.next_best_actions),
        input.summary,
    ]);
    return result.rows[0];
}
export async function getInsightsByConversationId(conversationId) {
    const result = await query('SELECT * FROM conversation_insights WHERE conversation_id = $1', [conversationId]);
    return result.rows[0] || null;
}
// ============================================================
// SALES_OUTCOMES - setOutcome
// ============================================================
export async function setOutcome(input) {
    const result = await query(`INSERT INTO sales_outcomes 
     (conversation_id, outcome, value_cents, loss_reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id) 
     DO UPDATE SET 
       outcome = $2, value_cents = $3, loss_reason = $4, updated_at = NOW()
     RETURNING *`, [
        input.conversation_id,
        input.outcome,
        input.value_cents || null,
        input.loss_reason || null,
    ]);
    return result.rows[0];
}
export async function getOutcomeByConversationId(conversationId) {
    const result = await query('SELECT * FROM sales_outcomes WHERE conversation_id = $1', [conversationId]);
    return result.rows[0] || null;
}
// ============================================================
// RAG_CHUNKS - saveRagChunk + findSimilarRagChunks
// ============================================================
export async function saveRagChunk(input) {
    const result = await query(`INSERT INTO rag_chunks 
     (conversation_id, chunk_text, embedding, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`, [
        input.conversation_id,
        input.chunk_text,
        input.embedding ? `[${input.embedding.join(',')}]` : null,
        JSON.stringify(input.metadata || {}),
    ]);
    return result.rows[0];
}
export async function findSimilarRagChunks(queryEmbedding, objection, topK = 5) {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    let sql = `
    SELECT id, chunk_text, metadata, (embedding <=> $1::vector) AS distance
    FROM rag_chunks
    WHERE embedding IS NOT NULL
  `;
    const params = [embeddingStr];
    if (objection) {
        sql += ` AND metadata->>'objection' = $2`;
        params.push(objection);
    }
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(topK);
    const result = await query(sql, params);
    return result.rows;
}
// Fallback textual search when RAG_VECTOR=false
export async function findRagChunksByText(searchText, objection, topK = 5) {
    let sql = `
    SELECT * FROM rag_chunks
    WHERE chunk_text ILIKE $1
  `;
    const params = [`%${searchText}%`];
    if (objection) {
        sql += ` AND metadata->>'objection' = $2`;
        params.push(objection);
    }
    sql += ` LIMIT $${params.length + 1}`;
    params.push(topK);
    const result = await query(sql, params);
    return result.rows;
}
// ============================================================
// REPORTS
// ============================================================
export async function saveDailyReport(reportDate, sellerId, kpis, heatmap, highlights) {
    await query(`INSERT INTO reports_daily (report_date, seller_id, kpis, heatmap, highlights)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (report_date, seller_id) 
     DO UPDATE SET kpis = $3, heatmap = $4, highlights = $5`, [reportDate, sellerId, JSON.stringify(kpis), JSON.stringify(heatmap), JSON.stringify(highlights)]);
}
export async function getDailyReport(reportDate, sellerId) {
    const result = await query('SELECT * FROM reports_daily WHERE report_date = $1 AND seller_id = $2', [reportDate, sellerId]);
    return result.rows[0] || null;
}
export async function saveWeeklyReport(weekStart, sellerId, kpis, heatmap, highlights) {
    await query(`INSERT INTO reports_weekly (week_start, seller_id, kpis, heatmap, highlights)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_start, seller_id) 
     DO UPDATE SET kpis = $3, heatmap = $4, highlights = $5`, [weekStart, sellerId, JSON.stringify(kpis), JSON.stringify(heatmap), JSON.stringify(highlights)]);
}
// ============================================================
// ADMIN QUERIES
// ============================================================
export async function getConversationsForAdmin(filters) {
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
    const params = [];
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
    const result = await query(sql, params);
    return result.rows;
}
export async function getConversationDetail(conversationId) {
    const result = await query(`SELECT 
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
    WHERE c.id = $1`, [conversationId]);
    return result.rows[0] || null;
}
// ============================================================
// EXPORT
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
    // Admin
    getConversationsForAdmin,
    getConversationDetail,
};
export default queries;
//# sourceMappingURL=queries.js.map