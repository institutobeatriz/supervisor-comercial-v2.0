const pool = require('pg').Pool;
const { Pool } = require('pg');
const db = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function test() {
  const start = new Date('2026-03-01');
  const end = new Date('2026-03-03');
  
  const result = await db.query(`
    WITH primeira_msg AS (
      SELECT 
        m.conversation_id,
        m.direction,
        m.seller_id,
        m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn
      FROM messages m
    )
    SELECT 
      COUNT(DISTINCT pm.conversation_id) as period
    FROM primeira_msg pm
    WHERE pm.rn = 1 
      AND pm.direction = 'outbound'
      AND pm.timestamp >= $1 AND pm.timestamp <= $2
  `, [start, end]);
  
  console.log("Resultado direto:", result.rows[0].period);
  await db.end();
}
test();
