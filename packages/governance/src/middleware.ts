/**
 * Middleware de governança
 * Intercepta execuções para aplicar limites e regras
 */

import type { TaskLimits, TaskUsage } from './limits.js';
import { LIMITS, canExecute, updateTaskUsage, getTaskUsage } from './limits.js';
import { applyRules } from './rules.js';
import { emitAlert } from './alerts.js';
import { logAudit, createAuditEntry } from '@supervisor/audit';

/**
 * Contexto de execução
 */
export interface ExecutionContext {
  /** Tipo de tarefa */
  task: string;
  
  /** ID da conversa */
  conversationId: string;
  
  /** Trace ID */
  traceId: string;
  
  /** Input original */
  input: unknown;
  
  /** Estimativa de tokens */
  estimatedTokens: number;
  
  /** Estimativa de custo */
  estimatedCostCents: number;
  
  /** Modelo a ser usado */
  model: string;
}

/**
 * Resultado da execução
 */
export interface ExecutionResult {
  /** Output da execução */
  output: unknown;
  
  /** Sucesso */
  success: boolean;
  
  /** Tokens usados */
  tokensUsed: number;
  
  /** Custo real */
  costCents: number;
  
  /** Tempo de execução */
  durationMs: number;
  
  /** Modelo usado */
  modelUsed: string;
  
  /** Se usou fallback */
  usedFallback: boolean;
  
  /** Motivo do fallback */
  fallbackReason?: string;
}

/**
 * Função de execução
 */
export type Executor = () => Promise<ExecutionResult>;

/**
 * Middleware que envolve execução com governança
 */
export async function withGovernance(
  ctx: ExecutionContext,
  executor: Executor
): Promise<ExecutionResult> {
  const limits = LIMITS[ctx.task];
  
  // 1. Verifica limites ANTES de executar
  const check = canExecute(ctx.task, ctx.estimatedTokens, ctx.estimatedCostCents);
  
  if (!check.allowed) {
    // Log de rejeição
    await logAudit(createAuditEntry({
      traceId: ctx.traceId,
      jobId: `${ctx.conversationId}-${ctx.task}`,
      task: ctx.task as 'classify' | 'analyze' | 'rag' | 'report',
      action: 'governance_check',
      input: { estimatedTokens: ctx.estimatedTokens, estimatedCostCents: ctx.estimatedCostCents },
      output: { result: 'rejected' },
      model: ctx.model,
      tokens: { input: 0, output: 0, total: 0 },
      costCents: 0,
      durationMs: 0,
      decision: 'rejected',
      reason: check.reason,
    }));
    
    // Emite alerta
    await emitAlert(
      'limit_exceeded',
      'critical',
      check.reason || 'Limite excedido',
      { context: ctx, limits }
    );
    
    // Tenta fallback se disponível
    if (limits?.fallbackModel && limits?.escalateOnLimit) {
      await emitAlert(
        'human_review_needed',
        'warning',
        `Limite excedido para ${ctx.task} com escalation habilitada`,
        { context: ctx, limits }
      );
    }
    
    // Retorna erro
    return {
      output: null,
      success: false,
      tokensUsed: 0,
      costCents: 0,
      durationMs: 0,
      modelUsed: ctx.model,
      usedFallback: false,
      fallbackReason: check.reason,
    };
  }
  
  // 2. Executa
  const startTime = Date.now();
  let result: ExecutionResult;
  
  try {
    result = await executor();
  } catch (error) {
    // Log de erro
    await logAudit(createAuditEntry({
      traceId: ctx.traceId,
      jobId: `${ctx.conversationId}-${ctx.task}`,
      task: ctx.task as 'classify' | 'analyze' | 'rag' | 'report',
      action: 'execution',
      input: ctx.input as Record<string, unknown>,
      output: { result: 'error', error: String(error) },
      model: ctx.model,
      tokens: { input: 0, output: 0, total: 0 },
      costCents: 0,
      durationMs: Date.now() - startTime,
      decision: 'error',
      reason: error instanceof Error ? error.message : String(error),
    }));
    
    throw error;
  }
  
  // 3. Atualiza uso
  updateTaskUsage(ctx.task, result.tokensUsed, result.costCents);
  
  // 4. Verifica se precisa alertar sobre uso alto
  const usage = getTaskUsage(ctx.task);
  if (limits && usage.costCentsUsed >= limits.maxCostCentsPerDay * 0.8) {
    await emitAlert(
      'limit_warning',
      'warning',
      `${ctx.task}: Aproximando do limite diário (${Math.round(usage.costCentsUsed / limits.maxCostCentsPerDay * 100)}%)`,
      { usage, limits, context: ctx }
    );
  }
  
  // 5. Log de sucesso
  await logAudit(createAuditEntry({
    traceId: ctx.traceId,
    jobId: `${ctx.conversationId}-${ctx.task}`,
    task: ctx.task as 'classify' | 'analyze' | 'rag' | 'report',
    action: 'execution',
    input: ctx.input as Record<string, unknown>,
    output: { result: 'success', output: result.output },
    model: result.modelUsed,
    tokens: { input: result.tokensUsed * 0.7, output: result.tokensUsed * 0.3, total: result.tokensUsed },
    costCents: result.costCents,
    durationMs: result.durationMs,
    decision: result.usedFallback ? 'fallback' : 'success',
    reason: result.fallbackReason,
  }));
  
  return result;
}

/**
 * Wrapper para criar contexto de execução
 */
export function createExecutionContext(
  task: string,
  conversationId: string,
  traceId: string,
  input: unknown,
  model: string = 'glm5'
): ExecutionContext {
  const limits = LIMITS[task];
  
  // Estimativas baseadas no tipo de tarefa
  let estimatedTokens = limits?.maxTokensPerTask || 500;
  let estimatedCostCents = limits?.maxCostCentsPerTask || 1;
  
  // Ajusta estimativas baseado no input
  if (typeof input === 'object' && input !== null) {
    const inputStr = JSON.stringify(input);
    estimatedTokens = Math.min(estimatedTokens, Math.ceil(inputStr.length / 4) + 100);
  }
  
  return {
    task,
    conversationId,
    traceId,
    input,
    estimatedTokens,
    estimatedCostCents,
    model,
  };
}
