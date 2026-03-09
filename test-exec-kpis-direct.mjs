import { getExecutiveKpis } from './packages/db/dist/queries.js';

const start = new Date(Date.UTC(2026, 2, 5, 3, 0, 0));
const end = new Date(Date.UTC(2026, 2, 6, 2, 59, 59));

console.log(`Testando getExecutiveKpis direto para período:`);
console.log(`  ${start.toISOString()} até ${end.toISOString()}\n`);

const kpis = await getExecutiveKpis(undefined, start, end);

console.log('Resultado:');
console.log(JSON.stringify(kpis, null, 2));

process.exit(0);
