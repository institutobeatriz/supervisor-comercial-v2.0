// Simular exatamente o que a API faz para o período mensal

import { getExecutiveKpis } from './packages/db/dist/queries.js';

function getPeriodDates(periodMode, date, month) {
  if (periodMode === 'month' && month) {
    const [year, monthNum] = month.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)),
    };
  }
}

const { startDate, endDate } = getPeriodDates('month', undefined, '2026-03');
const kpis = await getExecutiveKpis(undefined, startDate, endDate);

const taxaConversao = Math.round((kpis.sales_won / Math.max(kpis.leads_received, 1)) * 100);

console.log('\n=== VALORES REAIS QUE CHEGAM NA API ===\n');
console.log('kpis.sales_won:', kpis.sales_won);
console.log('kpis.leads_received:', kpis.leads_received);
console.log('kpis.conversion_rate (do banco):', kpis.conversion_rate);
console.log('taxaConversao (calculado):', taxaConversao);
console.log('\n=== O QUE A API RETORNA ===\n');
console.log({
  vendasQtd: kpis.sales_won,
  leadsRecebidos: kpis.leads_received,
  taxaConversao: taxaConversao,
  __debug: {
    kpis_sales_won: kpis.sales_won,
    kpis_leads_received: kpis.leads_received,
    kpis_conversion_rate_from_db: kpis.conversion_rate,
    calculated_conversion: taxaConversao,
  }
});

process.exit(0);
