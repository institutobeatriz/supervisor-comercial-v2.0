/**
 * Função simplificada para o Ralph Loop
 * Interface mais simples para uso no worker
 */

import type { RalphState, FinalDecision, Gap } from './types.js';
import { decideOutcome } from '@supervisor/governance';

export interface SimpleRalphInput {
  conversationId: string;
  text: string;
  classification?: {
    funnel_stage: string;
    intent?: string;
    confidence?: number;
    value_cents?: number;
    attention_reason?: string;
  };
  traceId?: string;
}

export interface SimpleRalphOutput extends RalphState {}

/**
 * Ralph Loop simplificado para uso no worker
 * Faz análise deliberativa com gap detection
 */
export async function simpleRalphLoop(input: SimpleRalphInput): Promise<SimpleRalphOutput> {
  const { conversationId, text, classification, traceId } = input;
  
  // Estado inicial
  const state: RalphState = {
    traceId: traceId || `${conversationId}-${Date.now()}`,
    conversationId,
    iteration: 0,
    maxIterations: 3,
    plan: [],
    executedSteps: [],
    gaps: [],
    finalDecision: null,
    confidence: classification?.confidence || 0.5,
    valueCents: classification?.value_cents || null,
    lossReason: null,
    needsHumanReview: false,
    humanReviewReason: null,
  };

  // Gap analysis - verifica se a classificação faz sentido
  const gaps = analyzeClassificationGaps(text, classification);
  state.gaps = gaps;

  // Se há gaps críticos, não aceita automaticamente
  if (gaps.some(g => g.priority === 'high')) {
    state.needsHumanReview = true;
    state.humanReviewReason = gaps.find(g => g.priority === 'high')?.description || 'Gaps críticos detectados';
    state.finalDecision = 'needs_human';
    state.confidence = Math.max(0, state.confidence - 0.3);
    return state;
  }

  // Decisão baseada na classificação
  if (classification?.funnel_stage === 'closed_won') {
    // Verifica se realmente tem confirmação de pagamento
    if (!hasPaymentConfirmation(text)) {
      state.gaps.push({
        type: 'no_payment_confirmation',
        description: 'Mensagem não contém confirmação de pagamento explícita',
        suggestedAction: 'Manter em negociação até confirmação',
        priority: 'high',
      });
      state.finalDecision = 'in_progress';
      state.needsHumanReview = true;
      state.humanReviewReason = 'Venda sugerida sem confirmação de pagamento';
      state.confidence = 0.5;
    } else {
      state.finalDecision = 'won';
      state.confidence = Math.min(1, (classification.confidence || 0.8) + 0.1);
    }
  } else if (classification?.funnel_stage === 'closed_lost') {
    state.finalDecision = 'lost';
    state.lossReason = classification.attention_reason || 'Cliente desistiu';
    state.confidence = classification.confidence || 0.7;
  } else {
    state.finalDecision = 'in_progress';
    state.confidence = classification?.confidence || 0.6;
  }

  // Verifica valor alto - precisa revisão humana
  if (state.valueCents && state.valueCents > 100000) { // R$ 1000+
    state.needsHumanReview = true;
    state.humanReviewReason = `Valor alto (R$ ${state.valueCents / 100}) requer confirmação`;
    if (state.finalDecision === 'won') {
      state.finalDecision = 'needs_human';
    }
  }

  return state;
}

/**
 * Analisa gaps na classificação
 */
function analyzeClassificationGaps(
  text: string,
  classification?: SimpleRalphInput['classification']
): Gap[] {
  const gaps: Gap[] = [];

  if (!classification) {
    gaps.push({
      type: 'missing_info',
      description: 'Sem classificação disponível',
      suggestedAction: 'Classificar mensagem primeiro',
      priority: 'high',
    });
    return gaps;
  }

  // Confiança baixa
  if (classification.confidence && classification.confidence < 0.5) {
    gaps.push({
      type: 'low_confidence',
      description: `Classificação com baixa confiança (${(classification.confidence * 100).toFixed(0)}%)`,
      suggestedAction: 'Revisar classificação manualmente',
      priority: 'medium',
    });
  }

  // Mensagem muito curta para venda
  if (classification.funnel_stage === 'closed_won' && text.length < 10) {
    gaps.push({
      type: 'rule_violation',
      description: 'Mensagem muito curta para ser uma venda confirmada',
      suggestedAction: 'Ignorar classificação, manter em negociação',
      priority: 'high',
    });
  }

  // Contradição: lost mas com palavras de compra
  if (classification.funnel_stage === 'closed_lost') {
    const buyWords = /paguei|comprei|fiz|transfer[ii]|pago/i;
    if (buyWords.test(text)) {
      gaps.push({
        type: 'contradiction',
        description: 'Classificação contradiz conteúdo da mensagem',
        suggestedAction: 'Revisar classificação',
        priority: 'high',
      });
    }
  }

  return gaps;
}

/**
 * Verifica se a mensagem contém confirmação de pagamento
 */
function hasPaymentConfirmation(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  const strongSaleIndicators = [
    /paguei/i,
    /pagamento\s*(feito|realizado|confirmado)/i,
    /pix\s*(enviado|feito|mandei|realizado)/i,
    /transfer[iê].*feita/i,
    /deposit[iu]/i,
    /comprovante\s*(enviado|anexado|em anexo)/i,
    /comprei\s*(o\s*)?pacote/i,
    /fechei\s*(o\s*)?pacote/i,
  ];
  
  return strongSaleIndicators.some(regex => regex.test(text));
}
