const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Estrutura da tabela sales_outcomes
  const columns = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'sales_outcomes'
  `);
  console.log("Colunas em sales_outcomes:", columns.rows.map(r => r.column_name).join(", "));
  
  // Vendas
  const sales = await pool.query(`
    SELECT id, outcome, value_cents, updated_at FROM sales_outcomes ORDER BY updated_at DESC
  `);
  console.log("\nVENDAS:");
  sales.rows.forEach((r, i) => {
    console.log("  " + (i+1) + ". " + r.outcome + " - R$ " + (r.value_cents/100 || 0) + " (" + r.updated_at.toISOString().slice(0,10) + ")");
  });
  
  // Mensagens recentes
  const msgs = await pool.query(`
    SELECT timestamp, direction, message_type FROM messages ORDER BY timestamp DESC LIMIT 5
  `);
  console.log("\nULTIMAS MENSAGENS:");
  msgs.rows.forEach((r, i) => {
    console.log("  " + (i+1) + ". " + r.direction + "/" + r.message_type + " - " + r.timestamp.toISOString());
  });
  
  // Verificar raw_event para confirmar dados reais
  const raw = await pool.query(`
    SELECT raw_event->>'key'->>'remoteJid' as phone
    FROM messages 
    WHERE raw_event IS NOT NULL 
    LIMIT 3
  `);
  console.log("\nEXEMPLOS DE TELEFONES REAIS:");
  raw.rows.forEach((r, i) => {
    if (r.phone) console.log("  " + (i+1) + ". " + r.phone);
  });
  
  await pool.end();
}
check();
