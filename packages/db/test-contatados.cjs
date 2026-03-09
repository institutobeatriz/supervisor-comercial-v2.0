const { getContatados } = require('./dist/queries.js');

async function test() {
  try {
    // Teste sem período (últimos 30 dias)
    const result = await getContatados();
    console.log("Contatados (30 dias):", result.period);
    console.log("Contatados (total):", result.total);
    
    // Teste com período específico
    const start = new Date('2026-03-01');
    const end = new Date('2026-03-03');
    const mar = await getContatados(null, start, end);
    console.log("\nContatados Março:", mar.period);
    
    process.exit(0);
  } catch (e) {
    console.error("Erro:", e.message);
    process.exit(1);
  }
}
test();
