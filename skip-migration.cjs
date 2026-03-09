const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function fix() {
  // Inserir todas como aplicadas
  await pool.query(`
    INSERT INTO schema_migrations (version) VALUES 
    ('009_message_deduplication.sql')
    ON CONFLICT (version) DO NOTHING
  `);
  console.log('Migração 009 marcada como aplicada');
  await pool.end();
}
fix();
