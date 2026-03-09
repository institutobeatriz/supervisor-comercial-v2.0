const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Vendas detectadas recentemente
  const recent = await pool.query(`
    SELECT 
      so.id,
      so.outcome,
      so.value_cents,
      so.updated_at,
      s.name as vendedor
    FROM sales_outcomes so
    JOIN conversations c ON c.id = so.conversation_id
    JOIN sellers s ON s.id = c.seller_id
    ORDER BY so.updated_at DESC
    LIMIT 10
  `);
  
  console.log("Últimas detecções de venda:");
  recent.rows.forEach((r, i) => {
    console.log("  " + (i+1) + ". " + r.outcome + " - R$ " + (r.value_cents/100 || 0) + " (" + r.vendedor + ")");
  });
  
  await pool.end();
}
check();
