const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  console.log("=== VERIFICACAO DE INTEGRIDADE ===\n");
  
  try {
    const c = await pool.query("SELECT (SELECT COUNT(*) FROM conversations) as conv, (SELECT COUNT(*) FROM messages) as msgs, (SELECT COUNT(*) FROM sellers) as sellers, (SELECT COUNT(*) FROM sales_outcomes) as outcomes");
    console.log("CONTAGENS:", c.rows[0]);
    
    const sales = await pool.query("SELECT s.name, COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won') as vendas, COALESCE(SUM(so.value_cents) FILTER (WHERE so.outcome = 'won'), 0) as faturamento FROM sellers s LEFT JOIN conversations c ON c.seller_id = s.id LEFT JOIN sales_outcomes so ON so.conversation_id = c.id GROUP BY s.id, s.name ORDER BY vendas DESC");
    console.log("\nVENDAS POR VENDEDOR:");
    sales.rows.forEach(r => console.log("  " + r.name + ": " + r.vendas + " vendas, R$ " + (r.faturamento/100)));
    
    const kpi = await pool.query("SELECT (SELECT COUNT(*) FROM sales_outcomes WHERE outcome = 'won') as vendas, (SELECT COALESCE(SUM(value_cents), 0) FROM sales_outcomes WHERE outcome = 'won') as faturamento, (SELECT COUNT(DISTINCT c.id) FROM conversations c WHERE c.created_at >= DATE_TRUNC('month', CURRENT_DATE)) as leads_mes");
    console.log("\nKPIs REAIS:", kpi.rows[0]);
    console.log("  Faturamento: R$ " + (kpi.rows[0].faturamento/100));
    console.log("  Vendas: " + kpi.rows[0].vendas);
    console.log("  Leads mes: " + kpi.rows[0].leads_mes);
    
    const funnel = await pool.query("SELECT funnel_stage, COUNT(*) as total FROM conversations GROUP BY funnel_stage ORDER BY total DESC");
    console.log("\nFUNIL:");
    funnel.rows.forEach(r => console.log("  " + r.funnel_stage + ": " + r.total));
    
    const losses = await pool.query("SELECT loss_reason, COUNT(*) as total FROM sales_outcomes WHERE outcome = 'lost' AND loss_reason IS NOT NULL GROUP BY loss_reason ORDER BY total DESC LIMIT 5");
    console.log("\nPERDAS:");
    losses.rows.forEach(r => console.log("  - " + r.loss_reason.substring(0, 60) + " (" + r.total + ")"));
    
    const recentSales = await pool.query("SELECT s.name, so.value_cents/100 as valor, so.updated_at::date as data FROM sales_outcomes so JOIN conversations c ON c.id = so.conversation_id JOIN sellers s ON s.id = c.seller_id WHERE so.outcome = 'won' ORDER BY so.updated_at DESC LIMIT 5");
    console.log("\nULTIMAS VENDAS:");
    recentSales.rows.forEach(r => console.log("  " + r.name + ": R$ " + r.valor + " em " + r.data));
    
    console.log("\n=== VERIFICACAO OK ===");
  } catch (e) {
    console.error("ERRO:", e.message);
  }
  await pool.end();
}
test();
