/**
 * Ralph Loop - Sistema Deliberativo Cíclico
 * 
 * Paradigma: Planejar → Executar → Observar → Replanejar
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PlanStep,
  Gap,
  RalphState,
  RalphResult,
  RalphConfig,
  ConversationContext,
  FinalDecision,
  StepExecutor,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { analyzeGaps, hasCriticalGaps } from './gap-analyzer.js';
import { logAudit, createAuditEntry } from '@supervisor/audit';

export { DEFAULT_CONFIG };
export type { StepExecutor };

/**
 * Cria contexto de conversa para o planner
 */
export function createPlannerContext(input: {
  messageId: string;
  conversationId: string;
  text: string;
  contactName?: string;
  sellerId?: string;
  currentStage?: string;
}): ConversationContext {
  return {
    conversationId: input.conversationId,
    contactName: input.contactName,
    currentMessage: input.text,
    currentStage: input.currentStage || 'lead',
    sellerId: input.sellerId,
  };
}

/**
 * Resultado simplificado para uso no worker
 */
export interface SimpleRalphResult {
  result: {
    classification: any;
    confidence: number;
  };
  gaps: Gap[];
  iterationCount: number;
}

/**
 * Ralph Loop simplificado para classificação de mensagens
 */
export async function ralphLoop(
  context: ConversationContext,
  classifier: (ctx: ConversationContext) => Promise<{ classification: any; confidence: number }>,
  config?: Partial<RalphConfig>
): Promise<SimpleRalphResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const traceId = uuidv4();
  
  console.log(`[RALPH] Iniciando para conversa ${context.conversationId}`);
  
  let iteration = 0;
  let result = await classifier(context);
  let gaps: Gap[] = [];
  
  // Análise de gaps
  if (result.classification.funnel_stage === 'closed_won') {
    if (!context.currentMessage.toLowerCase().includes('paguei') &&
        !context.currentMessage.toLowerCase().includes('pix') &&
        !context.currentMessage.toLowerCase().includes('comprei')) {
      gaps.push({
        type: 'no_payment_confirmation',
        description: 'Venda detectada mas sem confirmação de pagamento explícita',
        suggestedAction: 'Verificar se há comprovante ou confirmação de pagamento',
        priority: 'high',
      });
    }
  }
  
  return {
    result,
    gaps,
    iterationCount: iteration + 1,
  };
}

/**
 * Função principal do Ralph Loop completa (para uso futuro)
 */
export async function ralphLoopFull(
  context: ConversationContext,
  executor: StepExecutor,
  config: Partial<RalphConfig> = {}
): Promise<RalphResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Estado inicial
  const state: RalphState = {
    traceId: uuidv4(),
    conversationId: context.conversationId,
    iteration: 0,
    maxIterations: cfg.maxIterations,
    plan: [],
    executedSteps: [],
    gaps: [],
    finalDecision: null,
    confidence: 0,
    valueCents: null,
    lossReason: null,
    needsHumanReview: false,
    humanReviewReason: null,
  };
  
  console.log(`[RALPH] Iniciando loop para conversa ${context.conversationId}`);
  console.log(`[RALPH] TraceId: ${state.traceId}`);
  
  // ====== FASE 1: PLANEJAR ======
  state.plan = await generatePlan(context);
  console.log(`[RALPH] Plano gerado com ${state.plan.length} passos`);
  
  // Loop principal
  while (state.iteration < state.maxIterations) {
    console.log(`[RALPH] Iteração ${state.iteration + 1}/${state.maxIterations}`);
    
    // ====== FASE 2: EXECUTAR ======
    for (const step of state.plan) {
      if (step.status === 'completed' || step.status === 'skipped') {
        continue;
      }
      
      step.status = 'running';
      const startTime = Date.now();
      
      try {
        const execResult = await executor(step, context);
        const durationMs = Date.now() - startTime;
        step.result = {
          output: execResult.output,
          confidence: execResult.confidence,
          durationMs,
          model: execResult.model,
          tokens: execResult.tokens,
        };
        step.status = 'completed';
        state.executedSteps.push(step.id);
        
        // Log de auditoria
        await logAudit(createAuditEntry({
          traceId: state.traceId,
          jobId: `${context.conversationId}-${step.id}`,
          task: step.action === 'classify' ? 'classify' : 'analyze',
          action: step.action,
          input: step.input,
          output: { result: JSON.stringify(execResult.output), confidence: execResult.confidence },
          model: execResult.model || 'unknown',
          tokens: execResult.tokens || { input: 0, output: 0, total: 0 },
          costCents: execResult.costCents || 0,
          durationMs,
          decision: 'success',
        }));
        
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        
        // Log de erro
        await logAudit(createAuditEntry({
          traceId: state.traceId,
          jobId: `${context.conversationId}-${step.id}`,
          task: step.action === 'classify' ? 'classify' : 'analyze',
          action: step.action,
          input: step.input,
          output: { result: step.error },
          model: 'unknown',
          tokens: { input: 0, output: 0, total: 0 },
          costCents: 0,
          durationMs: Date.now() - startTime,
          decision: 'error',
          reason: step.error,
        }));
      }
    }
    
    // ====== FASE 3: OBSERVAR (GAP ANALYSIS) ======
    state.gaps = analyzeGaps(state.plan, context);
    console.log(`[RALPH] Detectados ${state.gaps.length} gaps`);
    
    // ====== FASE 4: REPLANEJAR ======
    if (state.gaps.length === 0) {
      console.log(`[RALPH] Sem gaps - decisão final`);
      break;
    }
    
    // Verifica gaps críticos
    if (hasCriticalGaps(state.gaps)) {
      console.log(`[RALPH] Gaps críticos detectados - pode requerer intervenção`);
    }
    
    // Gera novo plano baseado nos gaps
    state.plan = await replan(state, context);
    state.iteration++;
  }
  
  // ====== DECISÃO FINAL ======
  const result = await determineFinalDecision(state, context, cfg);
  
  // Log da decisão final
  await logAudit(createAuditEntry({
    traceId: state.traceId,
    jobId: `${context.conversationId}-final`,
    task: 'analyze',
    action: 'final_decision',
    input: { 
      text: context.currentMessage.substring(0, 200),
      context: { conversationId: context.conversationId }
    },
    output: { result: result.decision, confidence: result.confidence },
    model: 'ralph-loop',
    tokens: { input: 0, output: 0, total: 0 },
    costCents: 0,
    durationMs: 0,
    decision: 'success',
    reason: result.summary,
  }));
  
  return result;
}

/**
 * Gera plano inicial baseado no contexto
 */
async function generatePlan(context: ConversationContext): Promise<PlanStep[]> {
  const steps: PlanStep[] = [];
  let stepId = 1;
  
  // Sempre classificar primeiro
  steps.push({
    id: `step-${stepId++}`,
    action: 'classify',
    input: {
      text: context.currentMessage,
      context: {
        contactName: context.contactName,
        currentStage: context.currentStage,
      },
    },
    expectedOutput: {
      result: 'intent_classification',
      confidence: 0.7,
    },
    status: 'pending',
  });
  
  // Se estágio é lead ou negociação, verificar pagamento
  if (['lead', 'negociacao', 'proposta'].includes(context.currentStage)) {
    steps.push({
      id: `step-${stepId++}`,
      action: 'check_payment',
      input: {
        text: context.currentMessage,
      },
      expectedOutput: {
        result: 'payment_check',
        confidence: 0.8,
      },
      status: 'pending',
    });
  }
  
  // Se houver menção a valor, extrair
  if (/\d+.*?(reais?|R\$|\$)/i.test(context.currentMessage)) {
    steps.push({
      id: `step-${stepId++}`,
      action: 'extract_value',
      input: {
        text: context.currentMessage,
      },
      expectedOutput: {
        result: 'value_extraction',
        confidence: 0.8,
      },
      status: 'pending',
    });
  }
  
  // Validar regras de negócio
  steps.push({
    id: `step-${stepId++}`,
    action: 'validate_rule',
    input: {
      text: context.currentMessage,
      context: {
        currentStage: context.currentStage,
      },
    },
    expectedOutput: {
      result: 'rule_validation',
      confidence: 1.0,
    },
    status: 'pending',
  });
  
  return steps;
}

/**
 * Replaneja baseado nos gaps detectados
 */
async function replan(state: RalphState, context: ConversationContext): Promise<PlanStep[]> {
  const newSteps: PlanStep[] = [];
  
  // Mantém passos pendentes ou falhos que podem ser reexecutados
  for (const step of state.plan) {
    if (step.status === 'pending' || step.status === 'failed') {
      // Reinicia passos falhos com mais contexto
      if (step.status === 'failed') {
        step.status = 'pending';
        step.error = undefined;
        
        // Adiciona contexto dos gaps ao input
        step.input.context = {
          ...step.input.context,
          previousGaps: state.gaps.map(g => g.description),
        };
      }
      newSteps.push(step);
    }
  }
  
  // Adiciona passos extras baseados nos gaps
  for (const gap of state.gaps) {
    if (gap.type === 'low_confidence' && gap.priority === 'high') {
      newSteps.push({
        id: `step-retry-${Date.now()}`,
        action: 'classify',
        input: {
          text: context.currentMessage,
          context: {
            retry: true,
            reason: gap.description,
          },
        },
        expectedOutput: {
          result: 'intent_classification',
          confidence: 0.7,
        },
        status: 'pending',
      });
    }
    
    if (gap.type === 'missing_info') {
      newSteps.push({
        id: `step-check-${Date.now()}`,
        action: 'check_objection',
        input: {
          text: context.currentMessage,
          context: {
            checkType: gap.description,
          },
        },
        expectedOutput: {
          result: 'objection_check',
          confidence: 0.7,
        },
        status: 'pending',
      });
    }
  }
  
  return newSteps;
}

/**
 * Determina a decisão final baseada no estado
 */
async function determineFinalDecision(
  state: RalphState,
  context: ConversationContext,
  config: RalphConfig
): Promise<RalphResult> {
  let decision: FinalDecision = 'in_progress';
  let confidence = 0;
  let valueCents: number | null = null;
  let lossReason: string | null = null;
  let needsHumanReview = false;
  let humanReviewReason: string | null = null;
  
  // Analisa resultados dos passos
  const classifyStep = state.plan.find(s => s.action === 'classify' && s.status === 'completed');
  const paymentStep = state.plan.find(s => s.action === 'check_payment' && s.status === 'completed');
  const valueStep = state.plan.find(s => s.action === 'extract_value' && s.status === 'completed');
  
  // Determina decisão baseada na classificação
  if (classifyStep?.result?.output) {
    const output = classifyStep.result.output;
    confidence = classifyStep.result.confidence;
    
    // Verifica se é venda
    if (output.stage === 'closed_won' || output.intent === 'purchase_confirmation') {
      // Confirma se tem pagamento
      const hasPayment = paymentStep?.result?.output?.hasPaymentConfirmation === true;
      
      if (hasPayment) {
        decision = 'won';
        valueCents = (valueStep?.result?.output?.value as number) || null;
        
        // Verifica se precisa revisão humana
        if (config.enableHumanReview && valueCents && valueCents > config.humanReviewThreshold) {
          needsHumanReview = true;
          humanReviewReason = `Venda de alto valor (R$ ${valueCents / 100}) requer confirmação`;
        }
      } else {
        // Sem confirmação de pagamento - não é venda ainda
        decision = 'in_progress';
        confidence = Math.min(confidence, 0.5);
      }
    }
    
    // Verifica se é perda
    if (output.stage === 'closed_lost' || output.intent === 'rejection') {
      decision = 'lost';
      lossReason = (output.lossReason as string) || 'Desistiu';
    }
    
    // Verifica objeções
    if (output.intent === 'objection') {
      decision = 'in_progress';
    }
  }
  
  // Verifica gaps críticos que requerem humano
  const criticalGaps = state.gaps.filter(g => g.priority === 'high');
  if (criticalGaps.length > 0 && confidence < config.minConfidence) {
    needsHumanReview = true;
    humanReviewReason = criticalGaps.map(g => g.description).join('; ');
  }
  
  // Ajusta decisão se atingiu máximo de iterações sem resolver
  if (state.iteration >= state.maxIterations && decision === 'in_progress') {
    if (confidence < config.minConfidence) {
      needsHumanReview = true;
      humanReviewReason = `Máximo de iterações atingido com confiança baixa (${confidence.toFixed(2)})`;
    }
  }
  
  // Atualiza estado
  state.finalDecision = decision;
  state.confidence = confidence;
  state.valueCents = valueCents;
  state.lossReason = lossReason;
  state.needsHumanReview = needsHumanReview;
  state.humanReviewReason = humanReviewReason;
  
  // Gera resumo
  const summary = generateSummary(state);
  
  return {
    state,
    decision,
    confidence,
    valueCents,
    lossReason,
    needsHumanReview,
    summary,
  };
}

/**
 * Gera resumo da execução
 */
function generateSummary(state: RalphState): string {
  const parts: string[] = [];
  
  parts.push(`Decisão: ${state.finalDecision}`);
  parts.push(`Confiança: ${(state.confidence * 100).toFixed(0)}%`);
  parts.push(`Iterações: ${state.iteration}`);
  parts.push(`Passos executados: ${state.executedSteps.length}`);
  
  if (state.valueCents) {
    parts.push(`Valor: R$ ${state.valueCents / 100}`);
  }
  
  if (state.lossReason) {
    parts.push(`Motivo perda: ${state.lossReason}`);
  }
  
  if (state.needsHumanReview) {
    parts.push(`⚠️ Requer revisão humana: ${state.humanReviewReason}`);
  }
  
  if (state.gaps.length > 0) {
    parts.push(`Gaps: ${state.gaps.length}`);
  }
  
  return parts.join(' | ');
}