const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  const startDate = new Date('2026-03-01');
  const endDate = new Date();
  
  console.log('Start:', startDate.toISOString());
  console.log('End:', endDate.toISOString());
  
  const result = await pool.query(`
    WITH primeira_msg AS (
      SELECT 
        m.conversation_id,
        m.direction,
        m.seller_id,
        m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
      FROM messages m
    )
    SELECT COUNT(DISTINCT pm.conversation_id) as period
    FROM primeira_msg pm
    WHERE pm.rn = 1 
      AND pm.direction = 'outbound'
      AND pm.timestamp >= $1 AND pm.timestamp <= $2
  `, [startDate, endDate]);
  
  console.log('Resultado:', result.rows[0]);
  
  // Ver se há outbound messages hoje
  const hoje = await pool.query(`
    SELECT COUNT(*) as total
    FROM messages
    WHERE direction = 'outbound'
    AND timestamp >= CURRENT_DATE
  `);
  
  console.log('Mensagens outbound hoje:', hoje.rows[0].total);
  
  await pool.end();
}
test();
