const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function fix() {
  // Deletar e reinserir todas as migrações
  await pool.query('DELETE FROM schema_migrations');
  
  const migrations = [
    '001_init.sql',
    '002_human_reviews.sql', 
    '003_add_monthly_goal.sql',
    '004_seed_sellers.sql',
    '008_ralph_feedback.sql',
    '009_message_deduplication.sql'
  ];
  
  for (const m of migrations) {
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m]);
  }
  
  console.log('Todas migrações marcadas como aplicadas!');
  await pool.end();
}
fix();
