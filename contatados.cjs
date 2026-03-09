const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function analisar() {
  // Encontrar conversas onde PRIMEIRA mensagem é do VENDEDOR (outbound)
  const contatados = await pool.query(`
    WITH primeira_msg AS (
      SELECT 
        conversation_id,
        direction,
        seller_id,
        timestamp,
        ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp ASC) as rn
      FROM messages
    )
    SELECT 
      s.name as vendedor,
      COUNT(DISTINCT pm.conversation_id) as total_contatados,
      COUNT(DISTINCT pm.conversation_id) FILTER (
        WHERE pm.timestamp >= CURRENT_DATE
      ) as contatados_hoje,
      COUNT(DISTINCT pm.conversation_id) FILTER (
        WHERE pm.timestamp >= CURRENT_DATE - INTERVAL '7 days'
      ) as contatados_7dias
    FROM primeira_msg pm
    JOIN sellers s ON s.id = pm.seller_id
    WHERE pm.rn = 1 
      AND pm.direction = 'outbound'
    GROUP BY s.name
  `);
  
  console.log("=== CONTATADOS (Vendedor iniciou conversa) ===\n");
  
  if (contatados.rows.length === 0) {
    console.log("Nenhuma conversa iniciada pelo vendedor ainda.");
    console.log("\nVerificando todas as conversas...");
    
    const todas = await pool.query(`
      WITH primeira_msg AS (
        SELECT 
          conversation_id,
          direction,
          seller_id,
          timestamp,
          ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp ASC) as rn
        FROM messages
      )
      SELECT 
        direction,
        COUNT(*) as total
      FROM primeira_msg
      WHERE rn = 1
      GROUP BY direction
    `);
    
    console.log("\nPrimeira mensagem por direção:");
    todas.rows.forEach(r => {
      const dir = r.direction === 'outbound' ? 'Vendedor → Cliente' : 'Cliente → Vendedor';
      console.log("  " + dir + ": " + r.total);
    });
  } else {
    contatados.rows.forEach(r => {
      console.log(r.vendedor + ":");
      console.log("  Total: " + r.total_contatados + " contatados");
      console.log("  Hoje: " + r.contatados_hoje);
      console.log("  Últimos 7 dias: " + r.contatados_7dias);
    });
  }
  
  await pool.end();
}
analisar();
