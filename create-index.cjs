const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function fix() {
  // Criar índice único (funciona melhor que constraint com expressões)
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_remote_id
      ON messages (conversation_id, (raw_event->>''"'"'key.id'"'"'))
    `);
    console.log('Índice único criado!');
  } catch (e) {
    console.log('Erro:', e.message);
    // Tentar alternativamente
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_remote_id
        ON messages (conversation_id, (raw_event->>'"'"'key.id"'"'))
      `);
      console.log('Índice único criado (alternativo)!');
    } catch (e2) {
      console.log('Erro alternativo:', e2.message);
    }
  }
  
  await pool.end();
}
fix();
