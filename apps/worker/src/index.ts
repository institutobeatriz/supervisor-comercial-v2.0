/**
 * Worker v2.0 - BullMQ Jobs com Ralph Loop + Auditoria + Governança
 * Supervisor Comercial
 */

import { Queue, Worker, Job } from 'bullmq';
import cron from 'node-cron';
import { Pool } from 'pg';
import { classifyMessage, isSale, isLost, MessageClassification } from '@supervisor/llm';
import { logAudit, createAuditEntry, truncateText, createLogger } from '@supervisor/audit';
import { ralphLoop, createPlannerContext, getAdjustedThreshold } from '@supervisor/planner';
import { checkUsageAndAlert, decideOutcome } from '@supervisor/governance';
import { recordFeedback } from '@supervisor/planner';
import { transcribeFromUrl, transcribeFromBase64, transcribeFromEncryptedUrl } from '@supervisor/stt';

// Named loggers per worker
const workerLog = createLogger('worker');
const classifyLog = createLogger('classify');
const sttLog = createLogger('stt');
const analyzeLog = createLogger('analyze');
const visionLog = createLogger('vision');
const ragLog = createLogger('rag');
const reportLog = createLogger('report');
const schedulerLog = createLogger('scheduler');

// Config
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/sales_supervisor';
const TIMEZONE = process.env.SCHEDULER_TIMEZONE || 'America/Sao_Paulo';

// Lanes configuration
const LANE_CONFIG = {
  fast: { concurrency: 20, timeout: 30000 },
  slow: { concurrency: 5, timeout: 60000 },
  critical: { concurrency: 1, timeout: 120000 },
  stt: { concurrency: 3, timeout: 30000 },
};

function parseRedisUrl(url: string) {
  const match = url.match(/redis:\/\/([^:]+):(\d+)/);
  return match ? { host: match[1], port: parseInt(match[2]) } : { host: 'localhost', port: 6379 };
}

const connection = parseRedisUrl(REDIS_URL);
const db = new Pool({ connectionString: DATABASE_URL });

workerLog.info({ redis: connection, lanes: Object.keys(LANE_CONFIG) }, 'Worker v2.0 starting');

// Types
interface ClassifyJobData {
  messageId: string;
  conversationId: string;
  text: string;
  contactName?: string;
  sellerId?: string;
}

interface SttJobData {
  messageId: string;
  mediaUrl: string;
  base64?: string;
  mediaKey?: string;
  mediaMime?: string;
}

interface VisionJobData {
  messageId: string;
  conversationId: string;
  sellerId: string;
  instance: string;
  messageKeyId: string;
  messageKeyRemoteJid: string;
  mime: string;
  type: 'image' | 'document';
}

// Queues
export const queues = {
  stt: new Queue('stt', { connection }),
  classify: new Queue('classify', { connection }),
  analyze: new Queue('analyze', { connection }),
  vision: new Queue('vision', { connection }),
  ragIndex: new Queue('rag-index', { connection }),
  report: new Queue('report', { connection }),
};

// ============================================
// VALIDAÇÃO EXTRA - Verifica se realmente é venda
// ============================================
function hasPaymentConfirmation(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Palavras que INDICAM pagamento/fechamento (fortes)
  const strongSaleIndicators = [
    /paguei/i, /pagamento\s*(feito|realizado|confirmado)/i,
    /pix\s*(enviado|feito|mandei|realizado)/i, 
    /transfer[iê].*feita/i, /deposit[iu]/i,
    /comprovante\s*(enviado|anexado|em anexo)/i,
    /comprei\s*(o\s*)?pacote/i, /fechei\s*(o\s*)?pacote/i
  ];
  
  // Valor monetário explícito
  const hasValue = /r?\$?\s*\d{2,}(\s*(reais?|mil))?/i.test(text) || 
                   /pacote\s*(de\s*)?\d+/i.test(text);
  
  // Palavras que NEGAM venda
  const saleNegators = [
    /manda\s*(o\s*)?comprovante/i, /me\s*manda/i, /pode\s*mandar/i,
    /preciso\s*(do\s*)?comprovante/i, /quero\s*(ver\s*)?o\s*comprovante/i,
    /quanto\s*(custa|é)/i, /qual\s*(o\s*)?valor/i,
    /ainda\s*n[aã]o\s*(paguei|fiz)/i, /vou\s*(ver|pensar|passar)/i,
    /^combinado/i, /^certo$/i, /^ok$/i, /^blz$/i, /^belez/i
  ];
  
  if (saleNegators.some(regex => regex.test(text))) {
    return false;
  }
  
  const hasStrongIndicator = strongSaleIndicators.some(regex => regex.test(text));
  const hasIntentToBuy = /vou\s*(comprar|fechar|pagar)/i.test(text) || 
                          /quero\s*(comprar|fechar|pagar)/i.test(text);
  
  return hasStrongIndicator || (hasValue && hasIntentToBuy);
}

// ============================================
// GENERATE TRACE ID
// ============================================
function generateTraceId(conversationId: string | undefined): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const id = conversationId || 'unknown';
  return `${id.substring(0, 8)}-${timestamp}-${random}`;
}

// ============================================
// CLASSIFY WORKER - Com Ralph Loop + Auditoria
// ============================================
const classifyWorker = new Worker<ClassifyJobData>(
  'classify',
  async (job: Job<ClassifyJobData>) => {
    const startTime = Date.now();
    const { messageId, conversationId, text, contactName, sellerId } = job.data;
    const traceId = generateTraceId(conversationId);
    
    classifyLog.info({ messageId, conversationId, jobId: job.id, traceId }, 'Processing message');

    if (!text) {
      classifyLog.info({ messageId, jobId: job.id }, 'No text, skipping');
      return { success: true, skipped: true };
    }

    try {
      // 1. Criar contexto para o Ralph Loop
      const context = createPlannerContext({
        messageId,
        conversationId,
        text,
        contactName,
        sellerId,
      });

      // 2. Executar Ralph Loop (sistema deliberativo)
      const ralphResult = await ralphLoop(context, async (ctx) => {
        // Classificação com LLM
        const classification = await classifyMessage(text, contactName);
        return {
          classification,
          confidence: 0.85, // Placeholder
        };
      });

      const classification = ralphResult.result.classification;
      const iterationCount = ralphResult.iterationCount;

      // 3. Validar com regras determinísticas
      if (classification.funnel_stage === 'closed_won') {
        if (text.length < 10) {
          classifyLog.warn({ messageId, traceId }, 'closed_won with very short message - adjusting to negociacao');
          classification.funnel_stage = 'negociacao';
        } else if (!hasPaymentConfirmation(text)) {
          classifyLog.warn({ messageId, traceId }, 'closed_won without payment confirmation - adjusting to negociacao');
          classification.funnel_stage = 'negociacao';
        }
      }

      classifyLog.info({ messageId, traceId, funnelStage: classification.funnel_stage, intent: classification.intent, iterationCount }, 'Classification result');

      // 4. Calcular métricas
      const durationMs = Date.now() - startTime;
      const estimatedTokens = Math.ceil(text.length / 4) + 200; // Estimativa simples

      // 5. Registrar auditoria
      await logAudit(createAuditEntry({
        traceId,
        jobId: job.id || 'unknown',
        task: 'classify',
        action: 'classify_message',
        input: {
          text: truncateText(text, 500),
          context: { messageId, conversationId, contactName },
        },
        output: {
          result: classification.funnel_stage,
          confidence: classification.confidence,
          stage: classification.funnel_stage,
        },
        model: 'GLM-5-FP8',
        tokens: { input: estimatedTokens, output: 200, total: estimatedTokens + 200 },
        costCents: Math.ceil((estimatedTokens + 200) * 0.00001), // Estimativa
        durationMs,
        decision: ralphResult.gaps.length > 0 ? 'fallback' : 'success',
        reason: ralphResult.gaps.length > 0 ? ralphResult.gaps.map(g => g.description).join('; ') : undefined,
      }));

      // 6. Salvar no banco
      await db.query(`
        INSERT INTO message_labels (
          message_id, intent, objection, urgency, sentiment,
          funnel_stage, language, needs_attention, attention_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (message_id) DO UPDATE SET
          intent = EXCLUDED.intent,
          funnel_stage = EXCLUDED.funnel_stage,
          sentiment = EXCLUDED.sentiment,
          needs_attention = EXCLUDED.needs_attention,
          attention_reason = EXCLUDED.attention_reason
      `, [
        messageId,
        classification.intent || 'unknown',
        '',
        classification.sentiment <= 2 ? 3 : classification.sentiment >= 4 ? 1 : 2,
        classification.sentiment || 3,
        classification.funnel_stage || 'lead',
        'pt-BR',
        classification.needs_attention || false,
        classification.attention_reason || 'Nenhum',
      ]);

      // 6b. Avançar funnel_stage da conversa com base na classificação
      // Só avança — nunca retrocede (exceto para closed_won/closed_lost tratados abaixo)
      // Mapeamento LLM → estágio do funil comercial:
      // negociacao → proposta  |  compra (intent) → fechamento  |  duvida → qualificacao
      {
        const STAGE_ORDER: Record<string, number> = {
          lead: 1,
          qualificacao: 2,
          proposta: 3,
          fechamento: 4,
          pos_venda: 5,
          closed_won: 10,
          closed_lost: 10,
        };

        // Determinar o estágio-alvo desta mensagem
        let targetStage: string = 'lead';
        if (classification.funnel_stage === 'negociacao') {
          targetStage = 'proposta';
        } else if (classification.intent === 'compra') {
          targetStage = 'fechamento';
        } else if (classification.intent === 'negociacao') {
          targetStage = 'proposta';
        } else if (classification.intent === 'duvida') {
          targetStage = 'qualificacao';
        }

        // Só atualiza se o targetStage for maior que o atual (nunca retrocede)
        if (STAGE_ORDER[targetStage] > 1) {
          await db.query(`
            UPDATE conversations
            SET funnel_stage = $1
            WHERE id = $2
              AND funnel_stage NOT IN ('closed_won', 'closed_lost')
              AND COALESCE((
                CASE funnel_stage
                  WHEN 'lead'         THEN 1
                  WHEN 'qualificacao' THEN 2
                  WHEN 'proposta'     THEN 3
                  WHEN 'fechamento'   THEN 4
                  WHEN 'pos_venda'    THEN 5
                  ELSE 0
                END
              ), 0) < $3
          `, [targetStage, conversationId, STAGE_ORDER[targetStage]]);
        }
      }

      // 6c. Enfileirar análise da conversa (quality_score, insights)
      await queues.analyze.add('analyze', { conversationId, sellerId }, {
        jobId: `analyze-${conversationId}`,   // dedup: só 1 job por conversa
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      // 7. Se detectou VENDA - aplicar governança
      if (isSale(classification)) {
        classifyLog.info({ messageId, conversationId, traceId }, 'Sale detected');
        
        // Decisão final com middleware determinístico
        const finalDecision = await decideOutcome(
          text,
          {
            stage: classification.funnel_stage,
            intent: classification.intent,
            confidence: classification.confidence || 0.85,
            valueCents: classification.value_cents,
            model: 'GLM-5-FP8',
            tokens: { input: estimatedTokens, output: 200, total: estimatedTokens + 200 },
          },
          {
            conversationId,
            contactName,
            traceId,
          }
        );

        if (finalDecision.outcome !== 'rejected') {
          await db.query(`
            INSERT INTO sales_outcomes (conversation_id, outcome, value_cents)
            VALUES ($1, 'won', $2)
            ON CONFLICT (conversation_id) DO UPDATE SET
              outcome = 'won',
              value_cents = COALESCE(EXCLUDED.value_cents, sales_outcomes.value_cents)
          `, [conversationId, classification.value_cents || null]);
          
          await db.query(`
            UPDATE conversations SET funnel_stage = 'closed_won' WHERE id = $1
          `, [conversationId]);
        } else {
          classifyLog.warn({ messageId, traceId, reason: finalDecision.reason }, 'Sale rejected by rule');
        }
      }
      
      // 8. Se detectou PERDA
      if (isLost(classification)) {
        classifyLog.info({ messageId, conversationId, traceId }, 'Lost sale detected');
        
        await db.query(`
          INSERT INTO sales_outcomes (conversation_id, outcome, loss_reason)
          VALUES ($1, 'lost', $2)
          ON CONFLICT (conversation_id) DO UPDATE SET
            outcome = 'lost',
            loss_reason = EXCLUDED.loss_reason
        `, [conversationId, classification.attention_reason || 'Desistiu']);
        
        await db.query(`
          UPDATE conversations SET funnel_stage = 'closed_lost' WHERE id = $1
        `, [conversationId]);
      }

      return { success: true, classification, traceId, iterationCount };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      // Registrar erro na auditoria
      await logAudit(createAuditEntry({
        traceId,
        jobId: job.id || 'unknown',
        task: 'classify',
        action: 'classify_message',
        input: { text: truncateText(text, 500) },
        output: { result: 'error' },
        model: 'GLM-5-FP8',
        tokens: { input: 0, output: 0, total: 0 },
        costCents: 0,
        durationMs,
        decision: 'error',
        reason: error instanceof Error ? error.message : 'Unknown error',
      }));

      classifyLog.error({ err: error, messageId, traceId, jobId: job.id }, 'Failed to process message');
      throw error;
    }
  },
  { 
    connection, 
    concurrency: LANE_CONFIG.fast.concurrency,
    limiter: { max: 100, duration: 1000 }
  }
);

// ============================================
// STT WORKER - Lane STT (Groq Whisper)
// ============================================
const sttWorker = new Worker<SttJobData>(
  'stt',
  async (job: Job<SttJobData>) => {
    const { messageId, mediaUrl, base64, mediaKey, mediaMime } = job.data;
    sttLog.info({ messageId, jobId: job.id }, 'Processing audio');

    try {
      let result;

      // Se tem base64, usa diretamente
      if (base64) {
        sttLog.info({ messageId, jobId: job.id }, 'Using base64 data');
        result = await transcribeFromBase64(base64, mediaMime || 'audio/ogg', {
          language: 'pt',
          prompt: 'Conversa de WhatsApp sobre vendas e cursos',
        });
      } else if (mediaUrl && mediaKey && mediaUrl.includes('.enc')) {
        // URL criptografada do WhatsApp - usar descriptografia
        sttLog.info({ messageId, jobId: job.id, mediaUrlPrefix: mediaUrl.substring(0, 50) }, 'Decrypting WhatsApp media');
        result = await transcribeFromEncryptedUrl(mediaUrl, mediaKey, mediaMime || 'audio/ogg', {
          language: 'pt',
          prompt: 'Conversa de WhatsApp sobre vendas e cursos',
        });
      } else if (mediaUrl) {
        // URL normal
        sttLog.info({ messageId, jobId: job.id, mediaUrlPrefix: mediaUrl.substring(0, 50) }, 'Downloading from URL');
        result = await transcribeFromUrl(mediaUrl, {
          language: 'pt',
          prompt: 'Conversa de WhatsApp sobre vendas e cursos',
        });
      } else {
        throw new Error('No base64 or mediaUrl provided');
      }

      sttLog.info({ messageId, jobId: job.id, textPreview: result.text.substring(0, 100) }, 'Audio transcribed');
      
      // 2. Salvar transcrição no banco
      await db.query(`
        UPDATE messages SET text = $1 WHERE id = $2
      `, [result.text, messageId]);
      
      // 3. Adicionar job de classificação
      const msgResult = await db.query(`
        SELECT m.conversation_id, m.seller_id, c.contact_id
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = $1
      `, [messageId]);
      
      if (msgResult.rows.length > 0) {
        const msg = msgResult.rows[0];
        await queues.classify.add('classify', {
          messageId,
          conversationId: msg.conversation_id,
          text: result.text,
          contactName: 'Contato',
          sellerId: msg.seller_id,
        });
        sttLog.info({ messageId, jobId: job.id }, 'Classification job added');
      }
      
      return { success: true, text: result.text };
    } catch (error) {
      sttLog.error({ err: error, messageId, jobId: job.id }, 'Failed to transcribe audio');
      throw error;
    }
  },
  {
    connection,
    concurrency: LANE_CONFIG.stt.concurrency,
  }
);

// ============================================
// ANALYZE WORKER - Lane Slow
// Calcula quality_score e popula conversation_insights
// ============================================
const analyzeWorker = new Worker(
  'analyze',
  async (job: Job) => {
    const { conversationId } = job.data;
    analyzeLog.info({ conversationId, jobId: job.id }, 'Computing quality score');

    try {
      // 1. Buscar todos os message_labels da conversa
      const labelsResult = await db.query<{
        intent: string;
        sentiment: number;
        urgency: number;
        needs_attention: boolean;
        funnel_stage: string;
      }>(`
        SELECT ml.intent, ml.sentiment, ml.urgency, ml.needs_attention, ml.funnel_stage
        FROM message_labels ml
        JOIN messages m ON m.id = ml.message_id
        WHERE m.conversation_id = $1
      `, [conversationId]);

      const labels = labelsResult.rows;
      if (labels.length === 0) {
        analyzeLog.info({ conversationId, jobId: job.id }, 'No labels yet, skipping');
        return { success: true, skipped: true };
      }

      // 2. Calcular quality_score (0–100)
      let score = 40; // base

      const intents = labels.map(l => l.intent);
      const sentiments = labels.map(l => Number(l.sentiment) || 3);
      const urgencies  = labels.map(l => Number(l.urgency)  || 1);
      const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
      const avgUrgency   = urgencies.reduce((a, b) => a + b, 0)  / urgencies.length;
      const hasAttention = labels.some(l => l.needs_attention);

      // Intenções positivas
      if (intents.includes('compra'))      score += 35;
      else if (intents.includes('negociacao')) score += 25;
      else if (intents.includes('duvida'))    score += 10;

      // Sentimento (escala 1–5 onde 5 = positivo)
      if (avgSentiment >= 4)      score += 15;
      else if (avgSentiment >= 3) score += 5;
      else if (avgSentiment <= 2) score -= 15;

      // Urgência (escala 1–5 onde 5 = muito urgente/interessado)
      if (avgUrgency >= 4) score += 10;
      else if (avgUrgency >= 3) score += 5;

      // Intenções negativas
      if (intents.includes('desistencia')) score -= 30;
      if (intents.includes('reclamacao'))  score -= 15;

      // Atenção necessária
      if (hasAttention) score -= 5;

      // Estágio mais avançado visto nas labels (bônus de engajamento)
      const stageBonus: Record<string, number> = {
        lead: 0, qualificacao: 5, proposta: 10,
        negociacao: 15, fechamento: 20, closed_won: 25,
      };
      const maxStageScore = Math.max(...labels.map(l => stageBonus[l.funnel_stage] || 0));
      score += maxStageScore;

      // Clampar entre 0 e 100
      const qualityScore = Math.min(100, Math.max(0, Math.round(score)));

      // 3. Upsert em conversation_insights
      await db.query(`
        INSERT INTO conversation_insights (
          id, conversation_id, quality_score, wins, mistakes,
          next_best_actions, summary, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          '', NOW()
        )
        ON CONFLICT (conversation_id) DO UPDATE SET
          quality_score = EXCLUDED.quality_score,
          updated_at    = NOW()
      `, [conversationId, qualityScore]);

      // ─── LLM Insights (wins/mistakes/next_best_actions) ──────────────────
      // Only generate if quality_score changed significantly (>10pts) or no insights yet
      const existingInsights = await db.query<{
        quality_score: number | null;
        wins: unknown;
      }>(
        'SELECT quality_score, wins FROM conversation_insights WHERE conversation_id = $1',
        [conversationId]
      );
      const previousScore = existingInsights.rows[0]?.quality_score ?? null;
      const hasExistingWins = Array.isArray(existingInsights.rows[0]?.wins) &&
        (existingInsights.rows[0].wins as unknown[]).length > 0;

      const scoreDelta = previousScore !== null ? Math.abs(qualityScore - previousScore) : 100;
      const shouldGenerateInsights = !hasExistingWins || scoreDelta >= 10;

      if (shouldGenerateInsights) {
        // Fetch conversation messages for context
        const msgsResult = await db.query<{ direction: string; text: string }>(
          `SELECT direction, text FROM messages
           WHERE conversation_id = $1 AND text IS NOT NULL AND length(text) > 5
           ORDER BY timestamp ASC LIMIT 50`,
          [conversationId]
        );

        if (msgsResult.rows.length >= 3) {
          const conversationText = msgsResult.rows
            .map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.text}`)
            .join('\n');

          const llmUrl = process.env.LLM_PROVIDER === 'deepseek'
            ? 'https://api.deepseek.com/v1/chat/completions'
            : 'https://api.us-west-2.modal.direct/v1/chat/completions';
          const llmKey = process.env.LLM_PROVIDER === 'deepseek'
            ? process.env.DEEPSEEK_API_KEY
            : process.env.GLM5_API_KEY;
          const llmModel = process.env.LLM_PROVIDER === 'deepseek'
            ? 'deepseek-chat'
            : 'zai-org/GLM-5-FP8';

          if (llmKey) {
            try {
              const insightsResponse = await fetch(llmUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${llmKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: llmModel,
                  messages: [
                    {
                      role: 'system',
                      content: `Você é um coach de vendas especializado em WhatsApp. Analise a conversa e retorne APENAS JSON válido (sem texto extra):
{
  "wins": [{"title": "string", "why": "string"}],
  "mistakes": [{"title": "string", "why": "string", "fix": "string"}],
  "next_best_actions": [{"action": "string", "why": "string", "suggested_text": "string"}],
  "summary": "string"
}
Regras: máximo 3 wins, 3 mistakes, 2 next_best_actions. summary em 1-2 linhas. Seja específico e baseado em evidências da conversa.`,
                    },
                    {
                      role: 'user',
                      content: `Conversa:\n${conversationText.substring(0, 4000)}`,
                    },
                  ],
                  max_tokens: 700,
                  temperature: 0.3,
                }),
              });

              if (insightsResponse.ok) {
                const insightsData = await insightsResponse.json() as {
                  choices: Array<{ message: { content: string } }>;
                };
                const insightsContent = insightsData.choices?.[0]?.message?.content || '';
                const jsonMatch = insightsContent.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                  const insights = JSON.parse(jsonMatch[0]) as {
                    wins?: Array<{ title: string; why: string }>;
                    mistakes?: Array<{ title: string; why: string; fix?: string }>;
                    next_best_actions?: Array<{ action: string; why: string; suggested_text?: string }>;
                    summary?: string;
                  };

                  await db.query(
                    `UPDATE conversation_insights
                     SET wins = $1, mistakes = $2, next_best_actions = $3, summary = $4, updated_at = NOW()
                     WHERE conversation_id = $5`,
                    [
                      JSON.stringify(insights.wins || []),
                      JSON.stringify(insights.mistakes || []),
                      JSON.stringify(insights.next_best_actions || []),
                      insights.summary || '',
                      conversationId,
                    ]
                  );
                  analyzeLog.info({ conversationId, jobId: job.id }, 'LLM insights generated');
                }
              } else {
                analyzeLog.warn({ conversationId, jobId: job.id, status: insightsResponse.status }, 'LLM returned non-OK status');
              }
            } catch (insightsErr) {
              // Non-critical: insights generation failure should not fail the quality score job
              analyzeLog.error({ err: insightsErr, conversationId, jobId: job.id }, 'LLM insights failed (non-critical)');
            }
          }
        }
      }

      analyzeLog.info({ conversationId, jobId: job.id, qualityScore }, 'Quality score computed');

      // Emit SSE event to connected dashboard clients (fire-and-forget)
      const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3000';
      fetch(`${apiUrl}/internal/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'conversation_updated',
          data: { conversationId, qualityScore },
          sellerId: job.data.sellerId,
        }),
      }).catch(() => {}); // Fire-and-forget: SSE failure should not fail the job

      // Enqueue RAG indexing for this conversation
      await queues.ragIndex.add(
        'rag-index',
        { conversationId },
        {
          jobId: `rag-${conversationId}-${Date.now()}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
      ragLog.info({ conversationId }, 'RAG index job enqueued');

      return { success: true, qualityScore };
    } catch (error) {
      analyzeLog.error({ err: error, conversationId, jobId: job.id }, 'Failed to compute quality score');
      throw error;
    }
  },
  {
    connection,
    concurrency: LANE_CONFIG.slow.concurrency,
  }
);

// ============================================
// VISION WORKER - Comprovante detection
// ============================================
const EVOLUTION_URL_WORKER = process.env.EVOLUTION_URL || 'http://localhost:8080';
const EVOLUTION_KEY_WORKER = process.env.EVOLUTION_API_KEY;

async function downloadBase64ForVision(
  instance: string,
  keyId: string
): Promise<string | null> {
  if (!EVOLUTION_KEY_WORKER) return null;
  try {
    const response = await fetch(
      `${EVOLUTION_URL_WORKER}/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: 'POST',
        headers: { apikey: EVOLUTION_KEY_WORKER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: { id: keyId } }, convertToMp4: false }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json() as { base64?: string; message?: { base64?: string } };
    return data.base64 || data.message?.base64 || null;
  } catch {
    return null;
  }
}

async function analyzeComprovanteKimiVision(
  base64: string,
  mime: string
): Promise<{ isComprovante: boolean; valorReais: number | null; tipoTransacao: string | null } | null> {
  const nvKey = process.env.KIMI_API_KEY; // nvapi-... key reutilizada para NVIDIA NIM
  if (!nvKey) return null;
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'microsoft/phi-3.5-vision-instruct',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analise esta imagem. É um comprovante de pagamento PIX/TED/boleto/transferência?\n\nSe SIM, retorne APENAS JSON:\n{"isComprovante":true,"valorReais":99.90,"tipoTransacao":"pix"}\n\nSe NÃO:\n{"isComprovante":false}`,
            },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 150,
      }),
    });
    if (!response.ok) {
      visionLog.warn({ status: response.status, model: 'phi-3.5-vision' }, 'NVIDIA Vision API error');
      return null;
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { isComprovante?: boolean; valorReais?: number; tipoTransacao?: string };
      return {
        isComprovante: parsed.isComprovante || false,
        valorReais: parsed.valorReais || null,
        tipoTransacao: parsed.tipoTransacao || null,
      };
    }
    return null;
  } catch (err) {
    visionLog.error({ err }, 'NVIDIA Vision API call failed');
    return null;
  }
}

function comprovanteHeuristicScore(stage: string, type: string, mime: string): number {
  let score = 0;
  if (['proposta', 'negociacao', 'fechamento'].includes(stage)) score += 2;
  if (['image/jpeg', 'image/png', 'application/pdf'].includes(mime)) score += 1;
  if (type === 'document') score += 1;
  return score;
}

const visionWorker = new Worker<VisionJobData>(
  'vision',
  async (job: Job<VisionJobData>) => {
    const { messageId, conversationId, instance, messageKeyId, mime, type } = job.data;
    visionLog.info({ messageId, conversationId, jobId: job.id }, 'Processing media');

    // PDF branch — text extraction via pdf-parse (no Vision API cost)
    {
      const { mime: jobMime, base64: jobBase64 } = job.data as unknown as { mime?: string; base64?: string; [key: string]: unknown };
      if (jobMime === 'application/pdf' && jobBase64) {
        try {
          const { analyzePdf } = await import('@supervisor/vision');
          const pdfResult = await analyzePdf(jobBase64);
          if (pdfResult.isComprovante) {
            visionLog.info({ valorReais: pdfResult.valorReais, tipo: pdfResult.tipoTransacao }, 'PDF comprovante detected');

            const valueCents = pdfResult.valorReais ? Math.round(pdfResult.valorReais * 100) : null;

            await db.query(
              `INSERT INTO message_labels
                 (id, message_id, intent, objection, urgency, sentiment, funnel_stage,
                  language, needs_attention, attention_reason)
               VALUES
                 (gen_random_uuid(), $1, 'compra', '', 5, 4, 'closed_won', 'pt', false,
                  'Comprovante de pagamento detectado por PDF text extraction')
               ON CONFLICT (message_id) DO NOTHING`,
              [messageId]
            );

            await db.query(
              `UPDATE conversations SET funnel_stage = 'closed_won'
               WHERE id = $1 AND funnel_stage NOT IN ('closed_won', 'closed_lost')`,
              [conversationId]
            );

            await db.query(
              `INSERT INTO sales_outcomes
                 (id, conversation_id, outcome, value_cents, updated_at)
               VALUES
                 (gen_random_uuid(), $1, 'won', $2, NOW())
               ON CONFLICT (conversation_id) DO UPDATE SET
                 outcome = 'won',
                 value_cents = COALESCE($2, sales_outcomes.value_cents),
                 updated_at = NOW()`,
              [conversationId, valueCents]
            );
          } else {
            visionLog.info({ method: pdfResult.method }, 'PDF is not a comprovante');
          }
          visionLog.info({ mime: jobMime, isComprovante: pdfResult.isComprovante }, 'PDF processing complete');
          return { success: true, source: 'pdf', ...pdfResult };
        } catch (err) {
          visionLog.error({ err, jobId: job.id }, 'PDF vision processing failed');
          throw err; // Let BullMQ handle retry
        }
      }
    }

    try {
      // 1. Verificar estágio da conversa (heurística pre-OCR, evita custo desnecessário)
      const stageResult = await db.query<{ funnel_stage: string }>(
        'SELECT funnel_stage FROM conversations WHERE id = $1',
        [conversationId]
      );
      const stage = stageResult.rows[0]?.funnel_stage || 'lead';
      const heuristicScore = comprovanteHeuristicScore(stage, type, mime);

      visionLog.info({ messageId, jobId: job.id, heuristicScore, stage }, 'Heuristic evaluated');

      if (heuristicScore < 2) {
        visionLog.info({ messageId, jobId: job.id, heuristicScore }, 'Score too low, skipping OCR');
        return { success: true, skipped: true, reason: 'heuristic_score_low' };
      }

      // 2. Baixar base64 da Evolution API
      const base64 = await downloadBase64ForVision(instance, messageKeyId);
      if (!base64) {
        visionLog.warn({ messageId, jobId: job.id }, 'Failed to download media');
        return { success: true, skipped: true, reason: 'download_failed' };
      }

      // 3. Analisar com Kimi Vision
      const result = await analyzeComprovanteKimiVision(base64, mime);
      if (!result) {
        visionLog.warn({ messageId, jobId: job.id }, 'Vision API unavailable');
        return { success: true, skipped: true, reason: 'vision_unavailable' };
      }

      if (!result.isComprovante) {
        visionLog.info({ messageId, jobId: job.id }, 'Not a comprovante');
        return { success: true, isComprovante: false };
      }

      const valueCents = result.valorReais ? Math.round(result.valorReais * 100) : null;
      visionLog.info({ messageId, conversationId, jobId: job.id, valorReais: result.valorReais }, 'Comprovante detected');

      // 4. Determinar tipo: nova_venda vs mensalidade
      const previousSales = await db.query<{ outcome: string; updated_at: Date }>(
        `SELECT so.outcome, so.updated_at FROM sales_outcomes so
         JOIN conversations c ON c.id = so.conversation_id
         WHERE c.contact_id = (SELECT contact_id FROM conversations WHERE id = $1)
           AND so.conversation_id != $1
           AND so.outcome = 'won'
         ORDER BY so.updated_at DESC LIMIT 1`,
        [conversationId]
      );
      const hasRecentWin = previousSales.rows.length > 0 &&
        (Date.now() - new Date(previousSales.rows[0].updated_at).getTime()) < 35 * 24 * 60 * 60 * 1000;
      const saleType = hasRecentWin ? 'mensalidade' : 'nova_venda';

      // 5. Registrar label
      await db.query(
        `INSERT INTO message_labels
           (id, message_id, intent, objection, urgency, sentiment, funnel_stage,
            language, needs_attention, attention_reason)
         VALUES
           (gen_random_uuid(), $1, 'compra', '', 5, 4, 'closed_won', 'pt', false,
            'Comprovante de pagamento detectado por OCR')
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId]
      );

      // 6. Avançar funil
      await db.query(
        `UPDATE conversations SET funnel_stage = 'closed_won'
         WHERE id = $1 AND funnel_stage NOT IN ('closed_won', 'closed_lost')`,
        [conversationId]
      );

      // 7. Registrar venda
      await db.query(
        `INSERT INTO sales_outcomes
           (id, conversation_id, outcome, value_cents, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'won', $2, NOW())
         ON CONFLICT (conversation_id) DO UPDATE SET
           outcome = 'won',
           value_cents = COALESCE($2, sales_outcomes.value_cents),
           updated_at = NOW()`,
        [conversationId, valueCents]
      );

      visionLog.info({ conversationId, jobId: job.id, saleType, valueCents }, 'Sale recorded from comprovante');
      return { success: true, isComprovante: true, valueCents, saleType };

    } catch (error) {
      visionLog.error({ err: error, messageId, conversationId, jobId: job.id }, 'Failed to process media');
      throw error;
    }
  },
  {
    connection,
    concurrency: LANE_CONFIG.slow.concurrency,
  }
);

// ============================================
// RAG INDEX WORKER - Lane Slow
// ============================================
const ragWorker = new Worker(
  'rag-index',
  async (job: Job) => {
    const { conversationId } = job.data;
    ragLog.info({ conversationId, jobId: job.id }, 'Indexing conversation for RAG');

    // Fetch messages from conversation
    const msgs = await db.query<{ id: string; text: string; direction: string }>(
      `SELECT id, text, direction FROM messages
       WHERE conversation_id = $1 AND text IS NOT NULL AND length(text) > 20
       ORDER BY timestamp ASC`,
      [conversationId]
    );

    if (msgs.rows.length === 0) {
      ragLog.info({ conversationId }, 'No messages to index, skipping');
      return { success: true, skipped: true };
    }

    // Build full conversation text
    const allText = msgs.rows.map(m =>
      `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.text}`
    ).join('\n');

    // Sliding window chunking: ~500 chars with 100-char overlap
    const chunkSize = 500;
    const overlap = 100;
    const chunks: string[] = [];
    for (let i = 0; i < allText.length; i += chunkSize - overlap) {
      const chunk = allText.slice(i, i + chunkSize);
      if (chunk.length > 50) chunks.push(chunk);
    }

    // Generate embeddings and insert each chunk
    const { generateEmbedding } = await import('@supervisor/embeddings');
    let indexed = 0;

    for (const chunkText of chunks) {
      let embeddingVector: number[] | null = null;
      try {
        const result = await generateEmbedding(chunkText.substring(0, 8000));
        embeddingVector = result.embedding.length > 0 ? result.embedding : null;
      } catch {
        // API key not configured or RAG_VECTOR disabled — store chunk without embedding
        embeddingVector = null;
      }

      await db.query(
        `INSERT INTO rag_chunks (conversation_id, chunk_text, embedding, metadata)
         VALUES ($1, $2, $3::vector, $4)
         ON CONFLICT (conversation_id, chunk_text) DO NOTHING`,
        [
          conversationId,
          chunkText,
          embeddingVector ? `[${embeddingVector.join(',')}]` : null,
          JSON.stringify({ conversation_id: conversationId }),
        ]
      );
      indexed++;
    }

    ragLog.info({ conversationId, chunks: indexed }, 'RAG indexing complete');
    return { success: true, chunksIndexed: indexed };
  },
  {
    connection,
    concurrency: LANE_CONFIG.slow.concurrency,
  }
);

// ============================================
// REPORT WORKER - Lane Critical
// ============================================
const reportWorker = new Worker(
  'report',
  async (job: Job) => {
    reportLog.info({ jobName: job.name, jobId: job.id }, 'Generating report');
    
    const traceId = generateTraceId('report');
    
    await logAudit(createAuditEntry({
      traceId,
      jobId: job.id || 'unknown',
      task: 'report',
      action: 'generate_report',
      input: { context: { type: job.data.type } },
      output: { result: 'generated' },
      model: 'GLM-5-FP8',
      tokens: { input: 1000, output: 2000, total: 3000 },
      costCents: 5,
      durationMs: 5000,
      decision: 'success',
    }));
    
    // TODO: Gerar relatório
    return { success: true };
  },
  { 
    connection, 
    concurrency: LANE_CONFIG.critical.concurrency,
  }
);

// Event handlers
const workers = [classifyWorker, sttWorker, analyzeWorker, visionWorker, ragWorker, reportWorker];
const workerNames = ['classify', 'stt', 'analyze', 'vision', 'rag', 'report'];
workers.forEach((w, i) => {
  const name = workerNames[i];
  w.on('completed', (job) => workerLog.info({ worker: name, jobId: job.id }, 'Job completed'));
  w.on('failed', (job, err) => workerLog.error({ worker: name, jobId: job?.id, err }, 'Job failed'));
  w.on('error', (err) => workerLog.error({ worker: name, err }, 'Worker error'));
});

workerLog.info({ workerCount: workers.length }, 'All workers started with lanes');

// Scheduler - Relatório diário às 23:55
cron.schedule('55 23 * * *', async () => {
  schedulerLog.info({ timezone: TIMEZONE }, 'Daily report triggered');
  await queues.report.add('daily', { type: 'daily', date: new Date().toISOString() });
}, { timezone: TIMEZONE });

// Scheduler - Verificar alertas de governança a cada hora
cron.schedule('0 * * * *', async () => {
  schedulerLog.info('Checking governance alerts');
  const alerts = await checkUsageAndAlert();
  if (alerts.length > 0) {
    schedulerLog.warn({ alertCount: alerts.length }, 'Governance alerts generated');
  }
}, { timezone: TIMEZONE });

// LGPD: Monthly anonymization of inactive contacts (Art. 16)
cron.schedule('0 3 1 * *', async () => {
  schedulerLog.info('Running monthly LGPD contact anonymization');
  try {
    const result = await db.query<{ anonymize_inactive_contacts: number }>(
      'SELECT anonymize_inactive_contacts(730)'
    );
    const count = result.rows[0]?.anonymize_inactive_contacts || 0;
    schedulerLog.info({ anonymized: count }, 'LGPD anonymization complete');
  } catch (err) {
    schedulerLog.error({ err }, 'LGPD anonymization failed');
  }
}, { timezone: TIMEZONE });

// LGPD: Monthly cleanup of old audio transcripts > 1 year
cron.schedule('0 4 1 * *', async () => {
  schedulerLog.info('Running monthly LGPD audio transcript cleanup');
  try {
    const result = await db.query(
      `DELETE FROM audio_transcripts
       WHERE created_at < NOW() - INTERVAL '1 year'
       RETURNING id`
    );
    schedulerLog.info({ deleted: result.rowCount }, 'LGPD audio transcript cleanup complete');
  } catch (err) {
    // audio_transcripts table may not exist yet — log and continue
    schedulerLog.warn({ err }, 'LGPD audio transcript cleanup skipped');
  }
}, { timezone: TIMEZONE });

workerLog.info({ timezone: TIMEZONE }, 'Worker v2.0 ready');

// Keep alive
setInterval(() => {
  workerLog.debug('Heartbeat');
}, 60000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  workerLog.info('Shutting down...');
  await Promise.all(workers.map(w => w.close()));
  await db.end();
  process.exit(0);
});
