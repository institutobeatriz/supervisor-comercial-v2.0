const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function exemplo() {
  // Contar quantos leads hoje
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  
  const leadsHoje = await pool.query(`
    SELECT COUNT(*) as total
    FROM conversations
    WHERE created_at >= $1
  `, [hoje]);
  
  console.log("LEADS HOJE: " + leadsHoje.rows[0].total);
  
  // Mostrar os últimos 3 leads
  const ultimos = await pool.query(`
    SELECT 
      c.id,
      c.created_at,
      s.name as vendedor
    FROM conversations c
    JOIN sellers s ON s.id = c.seller_id
    ORDER BY c.created_at DESC
    LIMIT 3
  `);
  
  console.log("\nÚLTIMOS 3 LEADS:");
  ultimos.rows.forEach((r, i) => {
    const hora = r.created_at.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log("  " + (i+1) + ". " + hora + " - " + r.vendedor);
  });
  
  await pool.end();
}
exemplo();
