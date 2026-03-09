const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function explicar() {
  console.log("=== COMO O SISTEMA CONTA LEADS ===\n");
  
  // 1. Definição de lead
  console.log("1. DEFINIÇÃO:");
  console.log("   Um 'lead' é uma CONVERSA criada no período.");
  console.log("   Query: COUNT(c.id) WHERE c.created_at >= inicio AND c.created_at <= fim\n");
  
  // 2. Verificar estrutura
  const struct = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'conversations' 
    ORDER BY ordinal_position
    LIMIT 10
  `);
  
  console.log("2. CAMPOS DA TABELA CONVERSATIONS:");
  struct.rows.forEach(r => {
    console.log("   - " + r.column_name + " (" + r.data_type + ")");
  });
  
  // 3. Como é criado
  console.log("\n3. COMO UMA CONVERSA É CRIADA:");
  console.log("   - Via webhook da Evolution API");
  console.log("   - Quando chega primeira mensagem de um contato");
  console.log("   - created_at = timestamp do primeiro contato");
  
  // 4. Exemplo real
  const exemplo = await pool.query(`
    SELECT id, contact_id, seller_id, created_at, status, funnel_stage
    FROM conversations 
    ORDER BY created_at DESC 
    LIMIT 3
  `);
  
  console.log("\n4. ÚLTIMAS CONVERSAS CRIADAS:");
  exemplo.rows.forEach((r, i) => {
    console.log("   " + (i+1) + ". " + r.id.substring(0,8) + "...");
    console.log("      Criada: " + r.created_at.toISOString());
    console.log("      Vendedor: " + r.seller_id);
    console.log("      Status: " + r.status);
  });
  
  await pool.end();
}
explicar();
