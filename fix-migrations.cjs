const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function fix() {
  try {
    // Verificar se tabela existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'schema_migrations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Tabela schema_migrations não existe. Criando...');
      await pool.query(`
        CREATE TABLE schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }
    
    // Verificar migrações existentes
    const existing = await pool.query('SELECT version FROM schema_migrations');
    console.log('Migrações existentes:', existing.rows.map(r => r.version));
    
    // Inserir migrações pendentes
    const migrations = ['001_initial.sql', '002_add_timestamp_fields.sql', '003_add_monthly_goal.sql', 
                       '004_add_audit_fields.sql', '005_add_funnel_stage.sql', '009_message_deduplication.sql'];
    
    for (const migration of migrations) {
      const exists = existing.rows.some(r => r.version === migration);
      if (!exists) {
        console.log(`Inserindo ${migration}...`);
        await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration]);
      }
    }
    
    console.log('Migrações atualizadas!');
  } catch (e) {
    console.error('Erro:', e.message);
  }
  
  await pool.end();
}

fix();
