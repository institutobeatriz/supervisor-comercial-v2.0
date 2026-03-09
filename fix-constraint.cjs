const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function checkAndFix() {
  // Verificar se constraint existe
  const result = await pool.query(`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'messages' 
    AND constraint_name = 'uq_messages_remote_id'
  `);
  
  if (result.rows.length > 0) {
    console.log('Constraint uq_messages_remote_id já existe!');
  } else {
    console.log('Criando constraint...');
    try {
      await pool.query(`
        ALTER TABLE messages
        ADD CONSTRAINT uq_messages_remote_id
        UNIQUE (conversation_id, (raw_event->>'key.id'))
      `);
      console.log('Constraint criada!');
    } catch (e) {
      console.log('Erro ao criar:', e.message);
    }
  }
  
  // Criar índice se não existir
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_raw_event_key_id
      ON messages ((raw_event->>'key.id'))
    `);
    console.log('Índice criado/verificado!');
  } catch (e) {
    console.log('Erro ao criar índice:', e.message);
  }
  
  await pool.end();
}
checkAndFix();
