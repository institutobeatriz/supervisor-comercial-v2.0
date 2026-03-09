import { getExecutiveKpis } from './packages/db/dist/queries.js';

const start = new Date(Date.UTC(2026, 2, 1, 0, 0, 0)); // 2026-03-01
const end = new Date(Date.UTC(2026, 2, 31, 23, 59, 59)); // 2026-03-31

const kpis = await getExecutiveKpis(undefined, start, end);

console.log('KPIs para período mensal (2026-03):');
console.log(`  sales_won: ${kpis.sales_won}`);
console.log(`  leads_received: ${kpis.leads_received}`);
console.log(`  conversion_rate (do banco): ${kpis.conversion_rate}%`);

const calc = (kpis.sales_won / kpis.leads_received) * 100;
console.log(`  conversion_rate (cálculo JS): ${calc.toFixed(2)}%`);
console.log(`  conversion_rate (arredondado): ${Math.round(calc)}%`);

process.exit(0);
