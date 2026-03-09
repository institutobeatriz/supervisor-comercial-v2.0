const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  // Query EXATA do getExecutiveKpis
  const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));
  
  console.log("Testando Janeiro 2026:");
  console.log("  Start:", start.toISOString());
  console.log("  End:", end.toISOString());
  
  const result = await pool.query(`
    SELECT COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads
    FROM conversations c
  `, [start, end]);
  
  console.log("  Resultado:", result.rows[0].leads);
  
  // Verificar dados por mês
  const months = await pool.query(`
    SELECT DATE_TRUNC('month', created_at) as mes, COUNT(*) as total
    FROM conversations GROUP BY mes ORDER BY mes
  `);
  console.log("\nDados por mês:");
  months.rows.forEach(r => console.log("  " + r.mes.toISOString().slice(0,7) + ": " + r.total));
  
  await pool.end();
}
test();
