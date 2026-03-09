/**
 * Limites por tarefa
 * Governança de custo e contenção de risco
 */

/**
 * Limites para uma tarefa específica
 */
export interface TaskLimits {
  /** Máximo de tokens por execução */
  maxTokensPerTask: number;
  
  /** Máximo de tokens por dia */
  maxTokensPerDay: number;
  
  /** Custo máximo por execução (centavos) */
  maxCostCentsPerTask: number;
  
  /** Custo máximo por dia (centavos) */
  maxCostCentsPerDay: number;
  
  /** Máximo de tentativas */
  maxRetries: number;
  
  /** Modelo de fallback se primário falhar */
  fallbackModel?: string;
  
  /** Escalar para humano se limite excedido */
  escalateOnLimit: boolean;
}

/**
 * Limites configurados por tipo de tarefa
 */
export const LIMITS: Record<string, TaskLimits> = {
  // Classificação de mensagens - alta frequência, baixo custo
  classify: {
    maxTokensPerTask: 500,
    maxTokensPerDay: 500000,
    maxCostCentsPerTask: 1,
    maxCostCentsPerDay: 100,
    maxRetries: 2,
    fallbackModel: 'kimi',
    escalateOnLimit: false,
  },
  
  // Análise de conversa - média frequência
  analyze: {
    maxTokensPerTask: 2000,
    maxTokensPerDay: 100000,
    maxCostCentsPerTask: 5,
    maxCostCentsPerDay: 50,
    maxRetries: 1,
    fallbackModel: 'deepseek',
    escalateOnLimit: false,
  },
  
  // RAG - baixa frequência, mais tokens
  rag: {
    maxTokensPerTask: 3000,
    maxTokensPerDay: 50000,
    maxCostCentsPerTask: 10,
    maxCostCentsPerDay: 30,
    maxRetries: 1,
    fallbackModel: 'deepseek',
    escalateOnLimit: false,
  },
  
  // Relatórios - baixa frequência, alto custo
  report: {
    maxTokensPerTask: 5000,
    maxTokensPerDay: 50000,
    maxCostCentsPerTask: 20,
    maxCostCentsPerDay: 100,
    maxRetries: 1,
    fallbackModel: 'deepseek',
    escalateOnLimit: true,
  },
  
  // Won/Lost - crítico, usar melhor modelo
  won_lost: {
    maxTokensPerTask: 1000,
    maxTokensPerDay: 50000,
    maxCostCentsPerTask: 10,
    maxCostCentsPerDay: 50,
    maxRetries: 3,
    fallbackModel: 'opus',
    escalateOnLimit: true,
  },
};

/**
 * Uso atual de uma tarefa
 */
export interface TaskUsage {
  /** Tokens usados hoje */
  tokensUsed: number;
  
  /** Custo acumulado hoje (centavos) */
  costCentsUsed: number;
  
  /** Número de execuções hoje */
  executions: number;
  
  /** Timestamp do reset (início do dia) */
  resetAt: string;
}

/**
 * Armazenamento em memória do uso (em produção, usar Redis)
 */
const usageStore: Map<string, TaskUsage> = new Map();

/**
 * Obtém o uso atual de uma tarefa
 */
export function getTaskUsage(task: string): TaskUsage {
  const today = new Date().toISOString().split('T')[0];
  const key = `${task}-${today}`;
  
  let usage = usageStore.get(key);
  
  if (!usage) {
    usage = {
      tokensUsed: 0,
      costCentsUsed: 0,
      executions: 0,
      resetAt: today,
    };
    usageStore.set(key, usage);
  }
  
  return usage;
}

/**
 * Atualiza o uso de uma tarefa
 */
export function updateTaskUsage(
  task: string,
  tokens: number,
  costCents: number
): TaskUsage {
  const usage = getTaskUsage(task);
  
  usage.tokensUsed += tokens;
  usage.costCentsUsed += costCents;
  usage.executions += 1;
  
  const today = new Date().toISOString().split('T')[0];
  const key = `${task}-${today}`;
  usageStore.set(key, usage);
  
  return usage;
}

/**
 * Verifica se pode executar dentro dos limites
 */
export function canExecute(
  task: string,
  estimatedTokens: number,
  estimatedCostCents: number
): { allowed: boolean; reason?: string } {
  const limits = LIMITS[task];
  
  if (!limits) {
    return { allowed: true };
  }
  
  const usage = getTaskUsage(task);
  
  // Verifica limite diário de tokens
  if (usage.tokensUsed + estimatedTokens > limits.maxTokensPerDay) {
    return {
      allowed: false,
      reason: `Limite diário de tokens excedido: ${usage.tokensUsed + estimatedTokens}/${limits.maxTokensPerDay}`,
    };
  }
  
  // Verifica limite diário de custo
  if (usage.costCentsUsed + estimatedCostCents > limits.maxCostCentsPerDay) {
    return {
      allowed: false,
      reason: `Limite diário de custo excedido: R$ ${(usage.costCentsUsed + estimatedCostCents) / 100}`,
    };
  }
  
  // Verifica limite por tarefa de tokens
  if (estimatedTokens > limits.maxTokensPerTask) {
    return {
      allowed: false,
      reason: `Limite de tokens por tarefa excedido: ${estimatedTokens}/${limits.maxTokensPerTask}`,
    };
  }
  
  // Verifica limite por tarefa de custo
  if (estimatedCostCents > limits.maxCostCentsPerTask) {
    return {
      allowed: false,
      reason: `Limite de custo por tarefa excedido: R$ ${estimatedCostCents / 100}`,
    };
  }
  
  return { allowed: true };
}

/**
 * Obtém resumo de uso de todas as tarefas
 */
export function getUsageSummary(): Record<string, TaskUsage & { limits: TaskLimits }> {
  const summary: Record<string, TaskUsage & { limits: TaskLimits }> = {};
  
  for (const task of Object.keys(LIMITS)) {
    const usage = getTaskUsage(task);
    summary[task] = {
      ...usage,
      limits: LIMITS[task],
    };
  }
  
  return summary;
}

/**
 * Reseta uso (para testes ou manual)
 */
export function resetUsage(task?: string): void {
  if (task) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${task}-${today}`;
    usageStore.delete(key);
  } else {
    usageStore.clear();
  }
}
