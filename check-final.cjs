const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });
(async () => {
  const result = await pool.query("SELECT COUNT(*) FILTER (WHERE value_cents > 0) as com_valor, COUNT(*) as total FROM sales_outcomes WHERE outcome = 'won'");
  console.log("   Vendas com valor: " + result.rows[0].com_valor + "/" + result.rows[0].total);
  await pool.end();
})();
