const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://app:app@localhost:5432/sales_supervisor" });
(async () => {
  const r = await pool.query("SELECT s.name, COUNT(c.id) as total FROM sellers s LEFT JOIN conversations c ON c.seller_id = s.id GROUP BY s.name HAVING COUNT(c.id) > 0");
  r.rows.forEach(r => console.log("   " + r.name + ": " + r.total + " conversas"));
  await pool.end();
})();
