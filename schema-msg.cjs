const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Colunas da tabela messages
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'messages'
    ORDER BY ordinal_position
  `);
  
  console.log("Tabela MESSAGES:");
  cols.rows.forEach(r => {
    console.log("  - " + r.column_name + " (" + r.data_type + ")");
  });
  
  // Últimas mensagens
  const msgs = await pool.query(`
    SELECT id, direction, timestamp, created_at
    FROM messages
    ORDER BY timestamp DESC
    LIMIT 5
  `);
  
  console.log("\nÚLTIMAS 5 MENSAGENS:");
  msgs.rows.forEach((r, i) => {
    console.log("  " + (i+1) + ". " + r.id.substring(0,8) + "... [" + r.direction + "] " + r.timestamp);
  });
  
  await pool.end();
}
check();
