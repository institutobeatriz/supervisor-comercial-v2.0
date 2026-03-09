import { query } from './packages/db/dist/index.js';

async function debug() {
  try {
    // Get all data from conversations and sales_outcomes
    const result = await query(
      `SELECT
        MIN(c.created_at) as oldest_conversation,
        MAX(c.created_at) as newest_conversation,
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'won') as total_sales,
        COUNT(DISTINCT so.conversation_id) FILTER (WHERE so.outcome = 'lost') as total_lost
      FROM conversations c
      LEFT JOIN sales_outcomes so ON so.conversation_id = c.id`
    );
    
    const row = result.rows[0];
    console.log('[DEBUG] Database summary:');
    console.log('  Oldest conversation:', row.oldest_conversation);
    console.log('  Newest conversation:', row.newest_conversation);
    console.log('  Total conversations:', row.total_conversations);
    console.log('  Total sales:', row.total_sales);
    console.log('  Total lost:', row.total_lost);
    
    const allConvRate = (parseInt(row.total_sales) / Math.max(parseInt(row.total_conversations), 1)) * 100;
    console.log('  Overall conversion rate:', allConvRate.toFixed(2) + '%');
    
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}

debug();
