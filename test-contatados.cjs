const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  // Teste direto no banco
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = new Date();
  
  const result = await pool.query(`
    WITH primeira_msg AS (
      SELECT 
        m.conversation_id,
        m.direction,
        m.seller_id,
        m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
      FROM messages m
    )
    SELECT 
      COUNT(DISTINCT pm.conversation_id) as total,
      COUNT(DISTINCT pm.conversation_id) FILTER (
        WHERE pm.timestamp >= $1 AND pm.timestamp <= $2
      ) as period
    FROM primeira_msg pm
    WHERE pm.rn = 1 
      AND pm.direction = 'outbound'
  `, [start, end]);
  
  console.log("=== CONTATADOS ===");
  console.log("Últimos 30 dias:", result.rows[0].period);
  console.log("Total:", result.rows[0].total);
  
  // Por vendedor
  const bySeller = await pool.query(`
    WITH primeira_msg AS (
      SELECT 
        m.conversation_id,
        m.direction,
        m.seller_id,
        m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
      FROM messages m
    )
    SELECT 
      s.name as vendedor,
      COUNT(DISTINCT pm.conversation_id) as total,
      COUNT(DISTINCT pm.conversation_id) FILTER (
        WHERE pm.timestamp >= CURRENT_DATE
      ) as hoje
    FROM primeira_msg pm
    JOIN sellers s ON s.id = pm.seller_id
    WHERE pm.rn = 1 AND pm.direction = 'outbound'
    GROUP BY s.name
  `);
  
  console.log("\n=== POR VENDEDOR ===");
  bySeller.rows.forEach(r => {
    console.log(r.vendedor + ": " + r.total + " total, " + r.hoje + " hoje");
  });
  
  await pool.end();
}
test();
