/**
 * Sistema de alertas
 * Notifica sobre limites, erros e anomalias
 */

import type { TaskUsage, TaskLimits } from './limits.js';
import { LIMITS, getTaskUsage } from './limits.js';

/**
 * Tipo de alerta
 */
export type AlertType = 
  | 'limit_warning' 
  | 'limit_exceeded' 
  | 'cost_spike' 
  | 'error_rate_high'
  | 'human_review_needed';

/**
 * Severidade do alerta
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alerta gerado
 */
export interface Alert {
  /** Tipo do alerta */
  type: AlertType;
  
  /** Severidade */
  severity: AlertSeverity;
  
  /** Mensagem principal */
  message: string;
  
  /** Contexto adicional */
  context: Record<string, unknown>;
  
  /** Timestamp */
  timestamp: string;
  
  /** Se já foi notificado */
  notified: boolean;
}

/**
 * Armazenamento de alertas em memória (em produção, usar Redis/banco)
 */
const alertsStore: Alert[] = [];

/**
 * Handlers de notificação
 */
const notificationHandlers: Array<(alert: Alert) => Promise<void>> = [];

/**
 * Registra um handler de notificação
 */
export function onAlert(handler: (alert: Alert) => Promise<void>): void {
  notificationHandlers.push(handler);
}

/**
 * Gera um alerta
 */
export async function emitAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  context: Record<string, unknown> = {}
): Promise<Alert> {
  const alert: Alert = {
    type,
    severity,
    message,
    context,
    timestamp: new Date().toISOString(),
    notified: false,
  };
  
  alertsStore.push(alert);
  
  console.log(`[ALERT][${severity.toUpperCase()}] ${type}: ${message}`);
  
  // Notifica handlers
  for (const handler of notificationHandlers) {
    try {
      await handler(alert);
      alert.notified = true;
    } catch (error) {
      console.error('[ALERT] Erro ao notificar handler:', error);
    }
  }
  
  return alert;
}

/**
 * Verifica uso e gera alertas se necessário
 */
export async function checkUsageAndAlert(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  
  for (const [task, limits] of Object.entries(LIMITS)) {
    const usage = getTaskUsage(task);
    
    // Alerta de aviso (80% do limite)
    if (usage.costCentsUsed >= limits.maxCostCentsPerDay * 0.8) {
      const alert = await emitAlert(
        'limit_warning',
        'warning',
        `${task}: Custo em ${usage.costCentsUsed}/${limits.maxCostCentsPerDay} centavos (${Math.round(usage.costCentsUsed / limits.maxCostCentsPerDay * 100)}%)`,
        { task, usage, limits }
      );
      alerts.push(alert);
    }
    
    // Alerta de limite excedido
    if (usage.costCentsUsed >= limits.maxCostCentsPerDay) {
      const alert = await emitAlert(
        'limit_exceeded',
        'critical',
        `${task}: Limite diário de custo excedido! R$ ${usage.costCentsUsed / 100}`,
        { task, usage, limits }
      );
      alerts.push(alert);
    }
    
    // Alerta de tokens
    if (usage.tokensUsed >= limits.maxTokensPerDay * 0.9) {
      const alert = await emitAlert(
        'limit_warning',
        'warning',
        `${task}: Tokens em ${usage.tokensUsed}/${limits.maxTokensPerDay} (${Math.round(usage.tokensUsed / limits.maxTokensPerDay * 100)}%)`,
        { task, usage, limits }
      );
      alerts.push(alert);
    }
  }
  
  return alerts;
}

/**
 * Obtém alertas recentes
 */
export function getRecentAlerts(limit: number = 20): Alert[] {
  return alertsStore.slice(-limit);
}

/**
 * Obtém alertas por severidade
 */
export function getAlertsBySeverity(severity: AlertSeverity): Alert[] {
  return alertsStore.filter(a => a.severity === severity);
}

/**
 * Limpa alertas antigos (mais de 24h)
 */
export function clearOldAlerts(): number {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const initialLength = alertsStore.length;
  
  const index = alertsStore.findIndex(
    a => new Date(a.timestamp).getTime() >= oneDayAgo
  );
  
  if (index > 0) {
    alertsStore.splice(0, index);
  }
  
  return initialLength - alertsStore.length;
}

/**
 * Formata alerta para notificação
 */
export function formatAlertForNotification(alert: Alert): string {
  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
  }[alert.severity];
  
  const typeLabel = {
    limit_warning: 'Aviso de Limite',
    limit_exceeded: 'Limite Excedido',
    cost_spike: 'Pico de Custo',
    error_rate_high: 'Taxa de Erro Alta',
    human_review_needed: 'Revisão Humana Necessária',
  }[alert.type];
  
  return `${emoji} **${typeLabel}**\n\n${alert.message}\n\n_Timestamp: ${alert.timestamp}_`;
}
