const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar estrutura de raw_event
  const sample = await pool.query(`
    SELECT 
      m.timestamp,
      m.direction,
      substring(m.raw_event::text, 1, 200) as raw_preview
    FROM messages m
    WHERE m.raw_event IS NOT NULL
    ORDER BY m.timestamp DESC
    LIMIT 5
  `);
  
  console.log("=== ULTIMAS 5 MENSAGENS (preview raw_event) ===\n");
  sample.rows.forEach((r, i) => {
    console.log((i+1) + ". " + r.timestamp.toISOString() + " [" + r.direction + "]");
    console.log("   " + r.raw_preview.substring(0, 150) + "...");
    console.log("");
  });
  
  // Vendas com valor
  const sales = await pool.query(`
    SELECT id, outcome, value_cents, updated_at 
    FROM sales_outcomes 
    WHERE value_cents > 0
  `);
  
  console.log("=== VENDAS COM VALOR ===");
  if (sales.rows.length === 0) {
    console.log("  NENHUMA venda com valor real!");
    console.log("  Todas as vendas têm valor R$ 0.");
    console.log("  Isso indica que sao dados de SEED/DEMO.");
  } else {
    sales.rows.forEach((r, i) => {
      console.log("  " + (i+1) + ". " + r.outcome + " - R$ " + (r.value_cents/100));
    });
  }
  
  // Total de vendas
  const total = await pool.query(`
    SELECT outcome, COUNT(*) as qtd FROM sales_outcomes GROUP BY outcome
  `);
  console.log("\n=== RESUMO ===");
  total.rows.forEach(r => console.log("  " + r.outcome + ": " + r.qtd));
  
  await pool.end();
}
check();
