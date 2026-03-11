import { query } from './pool.js';

// ============================================================
// TAXA DE RESOLUCAO DE OBJECOES
// ============================================================
export async function getObjectionResolutionRate(
  sellerId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<number> {
  const result = await query<{
    total_with_objection: string;
    won_with_objection: string;
  }>(
    `SELECT
      COUNT(DISTINCT c.id) FILTER (
        WHERE ml.objection IS NOT NULL AND ml.objection != '''' AND ml.objection != 'none'
      ) as total_with_objection,
      COUNT(DISTINCT c.id) FILTER (
        WHERE ml.objection IS NOT NULL AND ml.objection != '''' AND ml.objection != 'none' AND so.outcome = 'won'
      ) as won_with_objection
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    JOIN message_labels ml ON ml.message_id = m.id
    LEFT JOIN sales_outcomes so ON so.conversation_id = c.id
    WHERE ($1::uuid IS NULL OR c.seller_id = $1)
      AND ($2::timestamp IS NULL OR c.created_at >= $2)
      AND ($3::timestamp IS NULL OR c.created_at <= $3)`,
    [sellerId || null, startDate || null, endDate || null]
  );

  const row = result.rows[0];
  const total = parseInt(row.total_with_objection) || 0;
  const won = parseInt(row.won_with_objection) || 0;
  
  return total > 0 ? Math.round((won / total) * 100) : 0;
}
