const { getContatados } = require('./packages/db/dist/queries.js');

async function test() {
  const start = new Date('2026-03-01');
  const end = new Date('2026-03-03');
  
  console.log('Testando getContatados...');
  const result = await getContatados(null, start, end);
  console.log('Resultado:', result);
}

test().catch(e => console.error('Erro:', e.message));
