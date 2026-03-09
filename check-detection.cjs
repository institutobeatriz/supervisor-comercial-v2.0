const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar mensagens com mídia (imagens)
  const media = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE raw_event::text LIKE '%"image"%') as imagens,
           COUNT(*) FILTER (WHERE raw_event::text LIKE '%"document"%') as documentos
    FROM messages
    WHERE direction = 'inbound'
  `);
  
  console.log("Mensagens recebidas:");
  console.log("  Total: " + media.rows[0].total);
  console.log("  Com imagens: " + media.rows[0].imagens);
  console.log("  Com documentos: " + media.rows[0].documentos);
  
  // Verificar se há detection de vendas
  const detection = await pool.query(`
    SELECT id, conversation_id, outcome, value_cents, updated_at
    FROM sales_outcomes
    ORDER BY updated_at DESC
    LIMIT 5
  `);
  
  console.log("\nÚltimas detecções de venda:");
  detection.rows.forEach((r, i) => {
    console.log("  " + (i+1) + ". " + r.outcome + " - R$ " + (r.value_cents/100 || 0) + " (" + r.updated_at.toISOString().slice(0,10) + ")");
  });
  
  await pool.end();
}
check();
