import { getExecutiveKpis } from './packages/db/dist/queries.js';

// Simulando a rota /dashboard/kpis com periodMode=month&month=2026-03

// Função getPeriodDates (do código)
function getPeriodDates(periodMode, date, month) {
  if (periodMode === 'day' && date) {
    const [year, mon, day] = date.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, mon - 1, day, 3, 0, 0, 0)),
      endDate:   new Date(Date.UTC(year, mon - 1, day + 1, 2, 59, 59, 999)),
    };
  } else if (periodMode === 'month' && month) {
    const [year, monthNum] = month.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)),
    };
  } else {
    const now = new Date();
    return {
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    };
  }
}

const { startDate, endDate } = getPeriodDates('month', undefined, '2026-03');
console.log(`Período: ${startDate.toISOString()} até ${endDate.toISOString()}\n`);

const kpis = await getExecutiveKpis(undefined, startDate, endDate);

console.log('KPIs retornados:');
console.log(JSON.stringify({
  sales_won: kpis.sales_won,
  leads_received: kpis.leads_received,
  conversion_rate: kpis.conversion_rate,
  revenue_cents: kpis.revenue_cents
}, null, 2));

// Simulando as linhas 102-112 da rota
const taxaConversao = Math.round((kpis.sales_won / Math.max(kpis.leads_received, 1)) * 100);
console.log(`\nCálculo da taxa (linha 102):`);
console.log(`  (${kpis.sales_won} / ${kpis.leads_received}) * 100 = ${((kpis.sales_won / kpis.leads_received) * 100).toFixed(4)}`);
console.log(`  Math.round(...) = ${taxaConversao}%`);

console.log(`\nResposta da rota (linha 105-118):`);
console.log({
  faturamentoMes: kpis.revenue_cents / 100,
  vendasQtd: kpis.sales_won,
  leadsRecebidos: kpis.leads_received,
  taxaConversao: taxaConversao,
});

process.exit(0);
