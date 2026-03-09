import { query } from './packages/db/dist/index.js';

async function debug() {
  try {
    // Query for entire March 2026
    const result = await query(
      `SELECT
        COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2) as leads_received,
        COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won' AND c.created_at >= $1 AND c.created_at <= $2) as sales_won,
        COALESCE(ROUND(100.0 * SUM(CASE WHEN so.outcome = 'won' AND c.created_at >= $1 AND c.created_at <= $2 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= $1 AND c.created_at <= $2), 0)), 0) as conversion_rate_db
      FROM conversations c
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id`,
      [
        new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0)),
        new Date(Date.UTC(2026, 3, 0, 23, 59, 59, 999))
      ]
    );
    
    const row = result.rows[0];
    console.log('[DEBUG] March 2026 Query result:', row);
    console.log('[DEBUG] leads_received:', row.leads_received);
    console.log('[DEBUG] sales_won:', row.sales_won);
    console.log('[DEBUG] conversion_rate_db:', row.conversion_rate_db);
    
    const calculated = (parseInt(row.sales_won) / Math.max(parseInt(row.leads_received), 1)) * 100;
    console.log('[DEBUG] Manual calculation:', calculated.toFixed(2) + '%');
    
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}

debug();
