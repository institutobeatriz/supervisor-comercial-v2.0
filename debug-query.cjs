const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function debug() {
  console.log("\n=== TESTE 1: QUERY DIRETA COM DATAS DO GETPERIODDATES ===");
  
  // Janeiro 2026 - exatamente como getPeriodDates retorna
  const janStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const janEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));
  
  console.log("Janeiro Start:", janStart.toISOString());
  console.log("Janeiro End:", janEnd.toISOString());
  
  const janResult = await pool.query(`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads
    FROM conversations c
  `, [janStart, janEnd]);
  
  console.log("Resultado Janeiro:", janResult.rows[0].leads);
  
  // Fevereiro 2026
  const fevStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
  const fevEnd = new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999));
  
  console.log("\nFevereiro Start:", fevStart.toISOString());
  console.log("Fevereiro End:", fevEnd.toISOString());
  
  const fevResult = await pool.query(`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads
    FROM conversations c
  `, [fevStart, fevEnd]);
  
  console.log("Resultado Fevereiro:", fevResult.rows[0].leads);
  
  // Verificar dados reais no banco
  console.log("\n=== DADOS REAIS NO BANCO ===");
  const allData = await pool.query(`
    SELECT DATE_TRUNC('month', created_at) as mes, COUNT(*) as total
    FROM conversations
    GROUP BY mes
    ORDER BY mes
  `);
  console.table(allData.rows);
  
  await pool.end();
}
debug();
