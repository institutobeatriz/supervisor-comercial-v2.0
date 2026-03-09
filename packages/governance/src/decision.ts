/**
 * Motor de decisão final
 * Combina sugestão da LLM com regras determinísticas
 */

import type { RuleInput, RuleResult } from './rules.js';
import { applyRules, hasPaymentConfirmation, extractValue } from './rules.js';
import { logAudit, createAuditEntry } from '@supervisor/audit';
import { createHumanReview } from '@supervisor/db';
import { sendReviewNotification } from './notify.js';

/**
 * Sugestão da LLM
 */
export interface LLMSuggestion {
  /** Estágio sugerido */
  stage: string;
  
  /** Intenção detectada */
  intent: string;
  
  /** Confiança (0-1) */
  confidence: number;
  
  /** Valor extraído (centavos) */
  valueCents?: number;
  
  /** Motivo da perda */
  lossReason?: string;
  
  /** Modelo usado */
  model: string;
  
  /** Tokens usados */
  tokens: { input: number; output: number; total: number };
}

/**
 * Decisão final
 */
export interface FinalDecision {
  /** Resultado final */
  outcome: 'won' | 'lost' | 'in_progress' | 'rejected' | 'pending';
  
  /** Motivo da decisão */
  reason: string;
  
  /** Regra aplicada (se houver) */
  ruleId: string | null;
  
  /** Se requer revisão humana */
  needsHumanReview: boolean;
  
  /** Confiança final */
  confidence: number;
  
  /** Valor (se won) */
  valueCents: number | null;
  
  /** Motivo perda (se lost) */
  lossReason: string | null;
  
  /** Trace ID para auditoria */
  traceId: string;
}

/**
 * Toma decisão final combinando LLM + regras
 */
export async function decideOutcome(
  text: string,
  llmSuggestion: LLMSuggestion,
  context: {
    conversationId: string;
    contactName?: string;
    traceId: string;
  }
): Promise<FinalDecision> {
  const traceId = context.traceId;
  
  // Prepara input para regras
  const ruleInput: RuleInput = {
    text,
    suggestedStage: llmSuggestion.stage,
    suggestedValue: llmSuggestion.valueCents,
    confidence: llmSuggestion.confidence,
    hasPaymentConfirmation: hasPaymentConfirmation(text),
    contactName: context.contactName,
  };
  
  // Extrai valor se não fornecido
  if (!ruleInput.suggestedValue) {
    ruleInput.suggestedValue = extractValue(text) || undefined;
  }
  
  // Aplica regras determinísticas
  const ruleResult = applyRules(ruleInput);
  
  // Se regra rejeitou
  if (ruleResult?.action === 'reject') {
    // Log de auditoria
    await logAudit(createAuditEntry({
      traceId,
      jobId: `${context.conversationId}-decision`,
      task: 'classify',
      action: 'rule_rejection',
      input: { text: text.substring(0, 200), suggestedStage: llmSuggestion.stage },
      output: { result: 'rejected', reason: ruleResult.reason },
      model: llmSuggestion.model,
      tokens: llmSuggestion.tokens,
      costCents: 0,
      durationMs: 0,
      decision: 'rejected',
      reason: ruleResult.reason,
    }));
    
    return {
      outcome: 'in_progress', // Rejeitado como won/lost, volta para in_progress
      reason: ruleResult.reason,
      ruleId: ruleResult.ruleId,
      needsHumanReview: false,
      confidence: llmSuggestion.confidence * 0.5, // Reduz confiança
      valueCents: null,
      lossReason: null,
      traceId,
    };
  }
  
  // Se regra escalou para humano
  if (ruleResult?.action === 'escalate') {
    await logAudit(createAuditEntry({
      traceId,
      jobId: `${context.conversationId}-decision`,
      task: 'classify',
      action: 'rule_escalation',
      input: { text: text.substring(0, 200), suggestedStage: llmSuggestion.stage },
      output: { result: 'pending', reason: ruleResult.reason },
      model: llmSuggestion.model,
      tokens: llmSuggestion.tokens,
      costCents: 0,
      durationMs: 0,
      decision: 'success',
      reason: `Escalated to human: ${ruleResult.reason}`,
    }));
    
    return {
      outcome: 'pending',
      reason: ruleResult.reason,
      ruleId: ruleResult.ruleId,
      needsHumanReview: true,
      confidence: llmSuggestion.confidence,
      valueCents: ruleInput.suggestedValue || null,
      lossReason: null,
      traceId,
    };
  }
  
  // Nenhuma regra disparou - aceita sugestão da LLM
  let finalOutcome: 'won' | 'lost' | 'in_progress' = 'in_progress';
  
  if (llmSuggestion.stage === 'closed_won') {
    finalOutcome = 'won';
  } else if (llmSuggestion.stage === 'closed_lost') {
    finalOutcome = 'lost';
  }
  
  // Log de auditoria
  await logAudit(createAuditEntry({
    traceId,
    jobId: `${context.conversationId}-decision`,
    task: 'classify',
    action: 'final_decision',
    input: { text: text.substring(0, 200), suggestedStage: llmSuggestion.stage },
    output: { result: finalOutcome, confidence: llmSuggestion.confidence },
    model: llmSuggestion.model,
    tokens: llmSuggestion.tokens,
    costCents: 0,
    durationMs: 0,
    decision: 'success',
    reason: ruleResult?.reason || 'Approved by LLM + rules',
  }));
  
  return {
    outcome: finalOutcome,
    reason: ruleResult?.reason || 'Approved by deterministic rules',
    ruleId: ruleResult?.ruleId || null,
    needsHumanReview: false,
    confidence: llmSuggestion.confidence,
    valueCents: ruleInput.suggestedValue || null,
    lossReason: llmSuggestion.lossReason || null,
    traceId,
  };
}

/**
 * Cria uma tarefa de revisão humana
 */
export async function createHumanReviewTask(
  conversationId: string,
  decision: FinalDecision,
  text: string
): Promise<void> {
  try {
    // Map outcome to valid values
    let suggestedOutcome: 'won' | 'lost' | 'in_progress' = 'in_progress';
    if (decision.outcome === 'won') suggestedOutcome = 'won';
    else if (decision.outcome === 'lost') suggestedOutcome = 'lost';
    else if (decision.outcome === 'rejected') suggestedOutcome = 'in_progress';
    else if (decision.outcome === 'pending') suggestedOutcome = 'won';
    
    await createHumanReview({
      conversation_id: conversationId,
      suggested_outcome: suggestedOutcome,
      suggested_value_cents: decision.valueCents || undefined,
      confidence: decision.confidence,
      reason: decision.reason,
      message_text: text.substring(0, 1000),
      trace_id: decision.traceId,
    });
    
    console.log(`[HUMAN REVIEW] Criada revisão para conversa ${conversationId}`);
    
    // Enviar notificação Telegram
    await sendReviewNotification({
      conversationId,
      suggestedOutcome: suggestedOutcome,
      valueCents: decision.valueCents || undefined,
      reason: decision.reason,
      reviewId: decision.traceId,
    });
  } catch (error) {
    console.error('[HUMAN REVIEW] Erro ao criar revisão:', error);
  }
}
