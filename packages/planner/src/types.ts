/**
 * Tipos para o Ralph Loop
 * Sistema deliberativo cíclico para tomada de decisão
 */

/**
 * Passo de um plano de execução
 */
export interface PlanStep {
  /** ID único do passo */
  id: string;
  
  /** Ação a ser executada */
  action: 'classify' | 'extract_value' | 'check_objection' | 'check_payment' | 'update_stage' | 'validate_rule';
  
  /** Input esperado para a ação */
  input: {
    text?: string;
    context?: Record<string, unknown>;
  };
  
  /** Output esperado da ação */
  expectedOutput: {
    result?: string;
    confidence?: number;
    value?: number;
    stage?: string;
  };
  
  /** Status atual do passo */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  
  /** Resultado real da execução (preenchido após execução) */
  result?: {
    output: Record<string, unknown>;
    confidence: number;
    durationMs: number;
    model?: string;
    tokens?: { input: number; output: number; total: number };
  };
  
  /** Motivo de falha, se houver */
  error?: string;
}

/**
 * Gap detectado durante análise
 */
export interface Gap {
  /** Tipo do gap */
  type: 'missing_info' | 'low_confidence' | 'contradiction' | 'rule_violation' | 'no_payment_confirmation';
  
  /** Descrição detalhada do gap */
  description: string;
  
  /** Ação sugerida para resolver o gap */
  suggestedAction: string;
  
  /** Prioridade do gap */
  priority: 'high' | 'medium' | 'low';
  
  /** Passo relacionado (se aplicável) */
  relatedStepId?: string;
}

/**
 * Decisão final do loop
 */
export type FinalDecision = 'won' | 'lost' | 'in_progress' | 'needs_human' | 'rejected';

/**
 * Estado completo do Ralph Loop
 */
export interface RalphState {
  /** ID de rastreamento (correlaciona com audit) */
  traceId: string;
  
  /** ID da conversa sendo analisada */
  conversationId: string;
  
  /** Número da iteração atual */
  iteration: number;
  
  /** Máximo de iterações permitidas */
  maxIterations: number;
  
  /** Plano de execução */
  plan: PlanStep[];
  
  /** IDs dos passos já executados */
  executedSteps: string[];
  
  /** Gaps detectados na última iteração */
  gaps: Gap[];
  
  /** Decisão final */
  finalDecision: FinalDecision | null;
  
  /** Nível de confiança da decisão (0-1) */
  confidence: number;
  
  /** Valor da venda (se aplicável) */
  valueCents: number | null;
  
  /** Motivo da perda (se aplicável) */
  lossReason: string | null;
  
  /** Requer revisão humana */
  needsHumanReview: boolean;
  
  /** Motivo da revisão humana */
  humanReviewReason: string | null;
}

/**
 * Contexto da conversa para análise
 */
export interface ConversationContext {
  /** ID da conversa */
  conversationId: string;
  
  /** Nome do contato */
  contactName?: string;
  
  /** Texto da mensagem atual */
  currentMessage: string;
  
  /** Histórico de mensagens (opcional) */
  messageHistory?: Array<{
    text: string;
    direction: 'inbound' | 'outbound';
    timestamp: string;
  }>;
  
  /** Estágio atual do funil */
  currentStage: string;
  
  /** ID do vendedor */
  sellerId?: string;
}

/**
 * Resultado do Ralph Loop
 */
export interface RalphResult {
  /** Estado final do loop */
  state: RalphState;
  
  /** Decisão tomada */
  decision: FinalDecision;
  
  /** Confiança na decisão */
  confidence: number;
  
  /** Valor da venda (se won) */
  valueCents: number | null;
  
  /** Motivo da perda (se lost) */
  lossReason: string | null;
  
  /** Requer revisão humana */
  needsHumanReview: boolean;
  
  /** Resumo da execução */
  summary: string;
}

/**
 * Configuração do Ralph Loop
 */
export interface RalphConfig {
  /** Máximo de iterações */
  maxIterations: number;
  
  /** Confiança mínima para aceitar decisão */
  minConfidence: number;
  
  /** Valor máximo para aceitar automaticamente (em centavos) */
  maxValueAutoAccept: number;
  
  /** Habilitar revisão humana para valores altos */
  enableHumanReview: boolean;
  
  /** Limite de valor para revisão humana */
  humanReviewThreshold: number;
}

/**
 * Configuração padrão do Ralph Loop
 */
export const DEFAULT_CONFIG: RalphConfig = {
  maxIterations: 3,
  minConfidence: 0.7,
  maxValueAutoAccept: 50000, // R$ 500
  enableHumanReview: true,
  humanReviewThreshold: 100000, // R$ 1000
};

/**
 * Tipo para função executora de passos
 */
export type StepExecutor = (
  step: PlanStep,
  context: ConversationContext
) => Promise<{
  output: Record<string, unknown>;
  confidence: number;
  model?: string;
  tokens?: { input: number; output: number; total: number };
  costCents?: number;
}>;
