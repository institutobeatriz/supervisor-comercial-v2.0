import pino from 'pino';
import type { Logger } from 'pino';
import { Pool } from 'pg';

/**
 * Cria um logger Pino estruturado com o nome do componente.
 * Todos os campos são serializados como JSON para facilitar
 * ingestão em sistemas de log (Loki, CloudWatch, etc.).
 *
 * @param name - Nome do componente (ex: 'classify', 'webhook')
 */
export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export const logger = createLogger('supervisor');

let _auditPool: Pool | null = null;

function getAuditPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!_auditPool) {
    _auditPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _auditPool;
}

/**
 * Interface para entrada de auditoria
 * Registra todas as decisões da IA para rastreabilidade
 */
export interface AuditEntry {
  /** Timestamp ISO 8601 da decisão */
  timestamp: string;
  
  /** ID de rastreamento para correlacionar jobs da mesma conversa */
  traceId: string;
  
  /** ID do job BullMQ que gerou esta entrada */
  jobId: string;
  
  /** Tipo de tarefa executada */
  task: 'classify' | 'analyze' | 'rag' | 'report' | 'won_lost';
  
  /** Ação específica executada */
  action: string;
  
  /** Input da tarefa (flexível para diferentes contextos) */
  input: {
    text?: string;
    context?: object;
    suggestedStage?: string;
    suggestedValue?: number;
    estimatedTokens?: number;
    [key: string]: unknown;
  };
  
  /** Output da tarefa (flexível para diferentes resultados) */
  output: {
    result: string;
    confidence?: number;
    reason?: string;
    error?: string;
    stage?: string;
    value?: number;
    [key: string]: unknown;
  };
  
  /** Modelo de IA utilizado */
  model: string;
  
  /** Contagem de tokens utilizados */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  
  /** Custo em centavos (R$ * 100) */
  costCents: number;
  
  /** Tempo de execução em milissegundos */
  durationMs: number;
  
  /** Resultado da decisão */
  decision: 'success' | 'fallback' | 'error' | 'rejected';
  
  /** Motivo detalhado para fallback ou erro */
  reason?: string;
}

/**
 * Função para registrar uma entrada de auditoria no arquivo JSONL
 * Implementa rotação diária automática e persiste no banco de dados.
 * 
 * @param entry - Entrada de auditoria a ser registrada
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Garante que o diretório logs existe (relativo à raiz do projeto)
    // Usamos process.cwd() para obter o diretório atual e subir 2 níveis
    const projectRoot = path.join(process.cwd(), '..', '..');
    const logsDir = path.join(projectRoot, 'logs');
    
    // Cria diretório logs se não existir
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Determina o nome do arquivo baseado na data atual (rotação diária)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const auditFile = path.join(logsDir, `audit-${today}.jsonl`);
    
    // Formata a entrada como linha JSON
    const logLine = JSON.stringify(entry) + '\n';
    
    // Escreve no arquivo (append)
    fs.appendFileSync(auditFile, logLine, { encoding: 'utf8' });
    
    logger.info({ traceId: entry.traceId, jobId: entry.jobId }, 'Audit entry recorded');
  } catch (error) {
    logger.error({ err: error }, 'Failed to record audit entry');
    // Não lança exceção para não interromper o fluxo principal
  }

  // Persist to database (append-only audit trail)
  const pool = getAuditPool();
  if (pool) {
    pool.query(
      `INSERT INTO audit_log
         (trace_id, job_id, task, action, model,
          tokens_in, tokens_out, cost_cents, duration_ms, decision, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.traceId,
        entry.jobId,
        entry.task,
        entry.action,
        entry.model,
        entry.tokens?.input ?? 0,
        entry.tokens?.output ?? 0,
        entry.costCents ?? 0,
        entry.durationMs ?? 0,
        entry.decision,
        entry.reason ?? null,
      ]
    ).catch((err: Error) => {
      // Never propagate audit errors — just log them
      logger.error({ err }, 'Failed to persist audit entry to DB');
    });
  }
}

/**
 * Função auxiliar para criar uma entrada de auditoria com valores padrão
 * 
 * @param partialEntry - Dados parciais da entrada
 * @returns Entrada de auditoria completa
 */
export function createAuditEntry(partialEntry: Partial<AuditEntry>): AuditEntry {
  const now = new Date().toISOString();
  
  return {
    timestamp: now,
    traceId: partialEntry.traceId || 'unknown',
    jobId: partialEntry.jobId || 'unknown',
    task: partialEntry.task || 'classify',
    action: partialEntry.action || 'unknown',
    input: partialEntry.input || { text: '' },
    output: partialEntry.output || { result: '' },
    model: partialEntry.model || 'unknown',
    tokens: partialEntry.tokens || { input: 0, output: 0, total: 0 },
    costCents: partialEntry.costCents || 0,
    durationMs: partialEntry.durationMs || 0,
    decision: partialEntry.decision || 'success',
    reason: partialEntry.reason,
  };
}

/**
 * Função para truncar texto muito longo para evitar arquivos enormes
 * 
 * @param text - Texto a ser truncado
 * @param maxLength - Comprimento máximo (padrão: 1000 caracteres)
 * @returns Texto truncado com indicador
 */
export function truncateText(text: string, maxLength: number = 1000): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  
  return text.substring(0, maxLength) + `...[truncado ${text.length - maxLength} caracteres]`;
}
