/**
 * Sistema de Memória e Aprendizado - Ralph Loop
 * Aprende com erros passados para melhorar decisões futuras
 */

import { query } from '@supervisor/db';

interface FeedbackEntry {
  conversationId: string;
  traceId: string;
  decision: string;
  confidence: number;
  wasCorrect: boolean | null;
  correctedBy?: string;
  correctionNotes?: string;
  timestamp: Date;
}

interface ThresholdAdjustment {
  task: string;
  threshold: number;
  reason: string;
  confidenceDelta: number;
}

/**
 * Registra feedback sobre uma decisão
 * Chamado quando usuário aprova/rejeita uma revisão humana
 */
export async function recordFeedback(
  conversationId: string,
  traceId: string,
  decision: string,
  confidence: number,
  wasCorrect: boolean,
  correctedBy?: string,
  notes?: string
): Promise<void> {
  // Salva no banco de dados
  await query(
    `INSERT INTO ralph_feedback (
      conversation_id, trace_id, decision, confidence, 
      was_correct, corrected_by, correction_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [conversationId, traceId, decision, confidence, wasCorrect, correctedBy, notes]
  );
  
  console.log(`[RALPH FEEDBACK] Registrado: ${decision} → ${wasCorrect ? '✓' : '✗'}`);
}

/**
 * Analisa padrões de acerto/erro nas últimas N decisões
 */
export async function analyzeFeedbackPatterns(
  task: string,
  windowDays = 7
): Promise<{
  total: number;
  correctRate: number;
  avgConfidence: number;
  recommendedThreshold: number;
  patterns: string[];
}> {
  const result = await query<{
    total: string;
    correct: string;
    avg_confidence: string;
  }>(
    `SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE was_correct = true) as correct,
      AVG(confidence) as avg_confidence
    FROM ralph_feedback
    WHERE decision = $1
      AND timestamp >= NOW() - INTERVAL '1 day' * $2`,
    [task, windowDays]
  );
  
  const row = result.rows[0];
  const total = parseInt(row.total) || 0;
  const correct = parseInt(row.correct) || 0;
  const correctRate = total > 0 ? correct / total : 1;
  const avgConfidence = parseFloat(row.avg_confidence) || 0.7;
  
  // Ajusta threshold baseado na taxa de acerto
  let recommendedThreshold = 0.7;
  if (correctRate < 0.5) {
    recommendedThreshold = Math.min(0.9, avgConfidence + 0.1);
  } else if (correctRate > 0.9) {
    recommendedThreshold = Math.max(0.6, avgConfidence - 0.05);
  }
  
  const patterns: string[] = [];
  if (correctRate < 0.6) patterns.push('Taxa de acerto baixa - aumentando rigor');
  if (avgConfidence < 0.5) patterns.push('Confiança média baixa - verificar modelo');
  
  return {
    total,
    correctRate,
    avgConfidence,
    recommendedThreshold,
    patterns,
  };
}

/**
 * Mantém cache de thresholds ajustados
 */
const thresholdCache = new Map<string, { value: number; updated: number }>();

const CACHE_TTL = 60 * 60 * 1000; // 1 hora

/**
 * Obtém threshold ajustado para uma tarefa
 */
export async function getAdjustedThreshold(
  task: string,
  baseThreshold: number
): Promise<number> {
  const cached = thresholdCache.get(task);
  if (cached && Date.now() - cached.updated < CACHE_TTL) {
    return cached.value;
  }
  
  const analysis = await analyzeFeedbackPatterns(task);
  const adjusted = analysis.total > 10 
    ? analysis.recommendedThreshold 
    : baseThreshold;
  
  thresholdCache.set(task, { value: adjusted, updated: Date.now() });
  return adjusted;
}

/**
 * Gera insights sobre o desempenho do sistema
 */
export async function generateRalphInsights(): Promise<string> {
  const [classifyAnalysis, overallStats] = await Promise.all([
    analyzeFeedbackPatterns('classify', 30),
    query<{
      total: string;
      correct: string;
      human_reviews: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE was_correct = true) as correct,
        COUNT(*) FILTER (WHERE was_correct IS NULL) as human_reviews
      FROM ralph_feedback
      WHERE timestamp >= NOW() - INTERVAL '30 days'`
    ),
  ]);
  
  const total = parseInt(overallStats.rows[0].total) || 0;
  const correct = parseInt(overallStats.rows[0].correct) || 0;
  const humanReviews = parseInt(overallStats.rows[0].human_reviews) || 0;
  
  if (total === 0) return 'Sem dados suficientes para análise.';
  
  const accuracy = (correct / total * 100).toFixed(1);
  const humanReviewRate = (humanReviews / total * 100).toFixed(1);
  
  return `📊 Ralph Insights (30 dias)
• Total de decisões: ${total}
• Precisão: ${accuracy}%
• Revisões humanas: ${humanReviewRate}%
• Threshold ajustado: ${(classifyAnalysis.recommendedThreshold * 100).toFixed(0)}%
${classifyAnalysis.patterns.length > 0 ? '\n🎯 Padrões:\n' + classifyAnalysis.patterns.map(p => '  • ' + p).join('\n') : ''}`;
}
