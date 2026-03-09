import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fix() {
  // ID do Vendedor Padrão a manter (o que foi criado primeiro)
  const keepId = '80a50431-8f36-477c-9072-f0adcba3696e';
  const removeId = 'bd37efe4-0f9c-426e-aee9-f877943a6bd2';
  
  // Atualizar conversas e mensagens
  await pool.query(`UPDATE conversations SET seller_id = $1 WHERE seller_id = $2`, [keepId, removeId]);
  await pool.query(`UPDATE messages SET seller_id = $1 WHERE seller_id = $2`, [keepId, removeId]);
  
  // Deletar duplicado
  await pool.query(`DELETE FROM sellers WHERE id = $1`, [removeId]);
  
  const result = await pool.query(`SELECT id, name FROM sellers`);
  console.log('✅ Vendedores finais:', result.rows);
  
  await pool.end();
}

fix().catch(console.error);
