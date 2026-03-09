const fs = require('fs');
const path = require('path');

const queriesPath = path.join(__dirname, 'packages/db/dist/queries.js');
let content = fs.readFileSync(queriesPath, 'utf8');

// Remover função incorreta se existir
const startMarker = '// ============================================================\n// CONTATADOS';
const startIdx = content.indexOf(startMarker);
if (startIdx > 0) {
  content = content.substring(0, startIdx);
}

// Adicionar função correta
const novaFuncao = `
// ============================================================
// CONTATADOS - Conversas iniciadas pelo vendedor
// ============================================================
async function getContatados(sellerId, startDate, endDate) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();
    const sql = "WITH primeira_msg AS (SELECT m.conversation_id, m.direction, m.seller_id, m.timestamp, ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp ASC) as rn FROM messages m) SELECT COUNT(DISTINCT pm.conversation_id)::text as total, COUNT(DISTINCT pm.conversation_id) FILTER (WHERE pm.timestamp >= $1 AND pm.timestamp <= $2)::text as period FROM primeira_msg pm WHERE pm.rn = 1 AND pm.direction = 'outbound' AND ($3::uuid IS NULL OR pm.seller_id = $3)";
    const result = await (0, exports.query)(sql, [start, end, sellerId || null]);
    const row = result.rows[0];
    return { total: parseInt(row.total) || 0, period: parseInt(row.period) || 0 };
}
exports.getContatados = getContatados;
`;

fs.writeFileSync(queriesPath, content + novaFuncao, 'utf8');
console.log('Função corrigida!');
