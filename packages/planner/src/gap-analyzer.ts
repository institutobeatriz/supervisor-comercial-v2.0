/**
 * Analisador de Gaps
 * Detecta lacunas entre resultado esperado e obtido
 */

import type { PlanStep, Gap, ConversationContext } from './types.js';

/**
 * Analisa os resultados dos passos executados e detecta gaps
 */
export function analyzeGaps(
  steps: PlanStep[],
  context: ConversationContext
): Gap[] {
  const gaps: Gap[] = [];
  
  for (const step of steps) {
    if (step.status !== 'completed' || !step.result) {
      continue;
    }
    
    // Verifica confiança baixa
    const confidenceGap = checkConfidence(step);
    if (confidenceGap) {
      gaps.push(confidenceGap);
    }
    
    // Verifica contradições
    const contradictionGap = checkContradictions(step, steps);
    if (contradictionGap) {
      gaps.push(contradictionGap);
    }
    
    // Verifica informações faltantes
    const missingInfoGap = checkMissingInfo(step, context);
    if (missingInfoGap) {
      gaps.push(missingInfoGap);
    }
    
    // Verifica violações de regras
    const ruleGap = checkRuleViolations(step, context);
    if (ruleGap) {
      gaps.push(ruleGap);
    }
  }
  
  // Ordena por prioridade
  return gaps.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Verifica se a confiança está muito baixa
 */
function checkConfidence(step: PlanStep): Gap | null {
  const confidence = step.result?.confidence ?? 1;
  
  if (confidence < 0.5) {
    return {
      type: 'low_confidence',
      description: `Passo ${step.action} retornou confiança muito baixa: ${confidence.toFixed(2)}`,
      suggestedAction: 'Reexecutar com contexto adicional ou escalar para humano',
      priority: 'high',
      relatedStepId: step.id,
    };
  }
  
  if (confidence < 0.7) {
    return {
      type: 'low_confidence',
      description: `Passo ${step.action} retornou confiança baixa: ${confidence.toFixed(2)}`,
      suggestedAction: 'Coletar mais informações ou validar com regras determinísticas',
      priority: 'medium',
      relatedStepId: step.id,
    };
  }
  
  return null;
}

/**
 * Verifica contradições entre passos
 */
function checkContradictions(step: PlanStep, allSteps: PlanStep[]): Gap | null {
  // Se classificou como venda, mas não tem confirmação de pagamento
  if (step.action === 'classify' && step.result?.output?.intent === 'purchase_confirmation') {
    const paymentStep = allSteps.find(s => s.action === 'check_payment' && s.status === 'completed');
    
    if (paymentStep && paymentStep.result?.output?.hasPaymentConfirmation === false) {
      return {
        type: 'contradiction',
        description: 'Classificação indica venda, mas não há confirmação de pagamento detectada',
        suggestedAction: 'Verificar manualmente se houve pagamento ou ajustar classificação',
        priority: 'high',
        relatedStepId: step.id,
      };
    }
  }
  
  return null;
}

/**
 * Verifica informações faltantes
 */
function checkMissingInfo(step: PlanStep, context: ConversationContext): Gap | null {
  // Verifica se extração de valor falhou para venda
  if (step.action === 'extract_value' && step.status === 'failed') {
    return {
      type: 'missing_info',
      description: 'Não foi possível extrair o valor da venda',
      suggestedAction: 'Verificar se o valor foi mencionado ou pedir confirmação',
      priority: 'medium',
      relatedStepId: step.id,
    };
  }
  
  // Verifica se mensagem é muito curta
  if (step.action === 'classify' && context.currentMessage.length < 10) {
    return {
      type: 'missing_info',
      description: 'Mensagem muito curta para classificação confiável',
      suggestedAction: 'Aguardar mais contexto ou classificar como lead',
      priority: 'low',
      relatedStepId: step.id,
    };
  }
  
  return null;
}

/**
 * Verifica violações de regras de negócio
 */
function checkRuleViolations(step: PlanStep, context: ConversationContext): Gap | null {
  // Verifica venda de alto valor sem confirmação adequada
  if (step.action === 'extract_value' && step.result?.output?.value) {
    const value = step.result.output.value as number;
    
    // Valores acima de R$ 1000 requerem validação extra
    if (value > 100000) { // centavos
      return {
        type: 'rule_violation',
        description: `Venda de alto valor (R$ ${value / 100}) requer validação adicional`,
        suggestedAction: 'Escalar para revisão humana ou verificar comprovante',
        priority: 'high',
        relatedStepId: step.id,
      };
    }
  }
  
  // Verifica ausência de confirmação de pagamento para closed_won
  if (step.action === 'check_payment' && step.result?.output?.hasPaymentConfirmation === false) {
    const classifyStep = step.result;
    
    // Se não tem pagamento mas está tentando fechar como won
    if (context.currentStage === 'closed_won' || step.result.output?.stage === 'closed_won') {
      return {
        type: 'no_payment_confirmation',
        description: 'Tentativa de fechar venda sem confirmação de pagamento',
        suggestedAction: 'Reclassificar para negociação até confirmar pagamento',
        priority: 'high',
        relatedStepId: step.id,
      };
    }
  }
  
  return null;
}

/**
 * Determina se os gaps são críticos o suficiente para parar o loop
 */
export function hasCriticalGaps(gaps: Gap[]): boolean {
  return gaps.some(gap => gap.priority === 'high' && 
    (gap.type === 'contradiction' || gap.type === 'no_payment_confirmation'));
}

/**
 * Gera ações sugeridas baseadas nos gaps detectados
 */
export function generateGapResolutionActions(gaps: Gap[]): string[] {
  return gaps.map(gap => gap.suggestedAction).filter((v, i, a) => a.indexOf(v) === i);
}
