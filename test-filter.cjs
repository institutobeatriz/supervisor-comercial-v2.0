const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  console.log("=== TESTE DE FILTRO DE PERIODO ===\n");
  
  // Janeiro 2026
  const janStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const janEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));
  console.log("Janeiro:", janStart.toISOString(), "ate", janEnd.toISOString());
  
  const janResult = await pool.query(`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads
    FROM conversations c
  `, [janStart, janEnd]);
  console.log("Leads janeiro:", janResult.rows[0].leads);
  
  // Fevereiro 2026
  const fevStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
  const fevEnd = new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999));
  console.log("\nFevereiro:", fevStart.toISOString(), "ate", fevEnd.toISOString());
  
  const fevResult = await pool.query(`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads
    FROM conversations c
  `, [fevStart, fevEnd]);
  console.log("Leads fevereiro:", fevResult.rows[0].leads);
  
  // Teste direto
  console.log("\n=== QUERY DIRETA (sem filtro) ===");
  const directJan = await pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01'");
  const directFev = await pool.query("SELECT COUNT(*) FROM conversations WHERE created_at >= '2026-02-01' AND created_at < '2026-03-01'");
  console.log("Janeiro (direto):", directJan.rows[0].count);
  console.log("Fevereiro (direto):", directFev.rows[0].count);
  
  await pool.end();
}
test();
