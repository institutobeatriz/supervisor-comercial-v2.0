const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar estrutura da tabela sellers
  const columns = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'sellers'
  `);
  console.log("Colunas em sellers:", columns.rows.map(r => r.column_name).join(", "));
  
  // Listar vendedores com detalhes
  const sellers = await pool.query(`
    SELECT id, name, active, created_at, monthly_goal_cents,
           (SELECT COUNT(*) FROM conversations c WHERE c.seller_id = s.id) as conversas
    FROM sellers s
    ORDER BY created_at
  `);
  
  console.log("\n=== VENDEDORES ===\n");
  sellers.rows.forEach((r, i) => {
    console.log((i+1) + ". " + r.name);
    console.log("   ID: " + r.id);
    console.log("   Criado: " + r.created_at.toISOString());
    console.log("   Conversas: " + r.conversas);
    console.log("   Meta: R$ " + (r.monthly_goal_cents/100 || 50000));
    console.log("");
  });
  
  // Verificar se há instância vinculada
  const withInstance = await pool.query(`
    SELECT s.name, COUNT(DISTINCT c.metadata->>'instance') as instancias
    FROM sellers s
    LEFT JOIN conversations c ON c.seller_id = s.id
    GROUP BY s.name
  `);
  
  console.log("=== INSTANCIAS POR VENDEDOR ===");
  withInstance.rows.forEach(r => {
    console.log("  " + r.name + ": " + r.instancias + " instancia(s)");
  });
  
  await pool.end();
}
check();
