const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Total de conversas
  const total = await pool.query('SELECT COUNT(*) FROM conversations');
  console.log('Total conversas:', total.rows[0].count);
  
  // Por mês
  const months = await pool.query(`
    SELECT DATE_TRUNC('month', created_at) as mes, COUNT(*) as total
    FROM conversations 
    GROUP BY mes ORDER BY mes DESC LIMIT 5
  `);
  console.log('\nÚltimos meses:');
  months.rows.forEach(r => console.log('  ' + r.mes.toISOString().slice(0,7) + ': ' + r.total));
  
  // Últimas mensagens
  const lastMsgs = await pool.query(`
    SELECT created_at FROM messages ORDER BY created_at DESC LIMIT 1
  `);
  if (lastMsgs.rows.length > 0) {
    console.log('\nÚltima mensagem:', lastMsgs.rows[0].created_at.toISOString());
  }
  
  // Vendedores
  const sellers = await pool.query('SELECT id, name, active FROM sellers');
  console.log('\nVendedores:');
  sellers.rows.forEach(r => console.log('  ' + r.name + ' (' + r.id + ') - ' + (r.active ? 'ATIVO' : 'INATIVO')));
  
  await pool.end();
}
check();
