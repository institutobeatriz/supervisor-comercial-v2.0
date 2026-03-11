/**
 * Métricas de uso da IA
 */

import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { resolveAuditLogDir } from '@supervisor/audit';

const LOGS_DIR = resolveAuditLogDir();

interface MetricRow {
  date: string;
  task: string;
  model: string;
  tokens: number;
  costCents: number;
}

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metrics/usage', async (request, reply) => {
    const days = parseInt((request.query as any).days) || 7;
    
    const metrics: MetricRow[] = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const logFile = path.join(LOGS_DIR, `audit-${dateStr}.jsonl`);
      
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            metrics.push({
              date: dateStr,
              task: entry.task || 'unknown',
              model: entry.model || 'unknown',
              tokens: entry.tokens?.total || 0,
              costCents: entry.costCents || 0,
            });
          } catch {}
        }
      }
    }
    
    // Aggregate by date
    const byDate: Record<string, { tokens: number; costCents: number; count: number }> = {};
    const byTask: Record<string, { tokens: number; costCents: number; count: number }> = {};
    const byModel: Record<string, { tokens: number; costCents: number; count: number }> = {};
    
    let totalTokens = 0;
    let totalCostCents = 0;
    
    for (const m of metrics) {
      totalTokens += m.tokens;
      totalCostCents += m.costCents;
      
      // By date
      if (!byDate[m.date]) byDate[m.date] = { tokens: 0, costCents: 0, count: 0 };
      byDate[m.date].tokens += m.tokens;
      byDate[m.date].costCents += m.costCents;
      byDate[m.date].count++;
      
      // By task
      if (!byTask[m.task]) byTask[m.task] = { tokens: 0, costCents: 0, count: 0 };
      byTask[m.task].tokens += m.tokens;
      byTask[m.task].costCents += m.costCents;
      byTask[m.task].count++;
      
      // By model
      if (!byModel[m.model]) byModel[m.model] = { tokens: 0, costCents: 0, count: 0 };
      byModel[m.model].tokens += m.tokens;
      byModel[m.model].costCents += m.costCents;
      byModel[m.model].count++;
    }
    
    return {
      total: {
        tokens: totalTokens,
        costCents: totalCostCents,
        costBRL: (totalCostCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      },
      byDate: Object.entries(byDate)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byTask: Object.entries(byTask)
        .map(([task, data]) => ({ task, ...data }))
        .sort((a, b) => b.tokens - a.tokens),
      byModel: Object.entries(byModel)
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.tokens - a.tokens),
    };
  });
};

export default metricsRoutes;
