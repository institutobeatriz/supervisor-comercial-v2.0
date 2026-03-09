import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function cleanup() {
  console.log('🧹 Limpando vendedores...\n');
  
  // Buscar IDs dos vendedores a manter
  const keepSellers = await pool.query(
    `SELECT id, name FROM sellers WHERE name IN ('Vendedor Padrão', 'Instituto-Vendas')`
  );
  console.log('Vendedores a manter:', keepSellers.rows);
  
  // Buscar ID do Vendedor Padrão
  const defaultSeller = await pool.query(
    `SELECT id FROM sellers WHERE name = 'Vendedor Padrão'`
  );
  const defaultId = defaultSeller.rows[0]?.id;
  
  if (!defaultId) {
    console.log('Criando Vendedor Padrão...');
    await pool.query(`INSERT INTO sellers (name, active) VALUES ('Vendedor Padrão', true)`);
  }
  
  // Atualizar conversas
  const updateConvs = await pool.query(`
    UPDATE conversations 
    SET seller_id = (SELECT id FROM sellers WHERE name = 'Vendedor Padrão' LIMIT 1)
    WHERE seller_id NOT IN (
      SELECT id FROM sellers WHERE name IN ('Vendedor Padrão', 'Instituto-Vendas')
    )
  `);
  console.log(`Conversas atualizadas: ${updateConvs.rowCount}`);
  
  // Atualizar mensagens
  const updateMsgs = await pool.query(`
    UPDATE messages 
    SET seller_id = (SELECT id FROM sellers WHERE name = 'Vendedor Padrão' LIMIT 1)
    WHERE seller_id NOT IN (
      SELECT id FROM sellers WHERE name IN ('Vendedor Padrão', 'Instituto-Vendas')
    )
  `);
  console.log(`Mensagens atualizadas: ${updateMsgs.rowCount}`);
  
  // Deletar vendedores indesejados
  const deleteSellers = await pool.query(`
    DELETE FROM sellers 
    WHERE name NOT IN ('Vendedor Padrão', 'Instituto-Vendas')
  `);
  console.log(`Vendedores removidos: ${deleteSellers.rowCount}`);
  
  // Verificar resultado
  const result = await pool.query(`SELECT id, name FROM sellers`);
  console.log('\n✅ Vendedores restantes:', result.rows);
  
  await pool.end();
}

cleanup().catch(console.error);
