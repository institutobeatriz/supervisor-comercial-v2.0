const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function fluxo() {
  console.log("FLUXO DE RECEBIMENTO DE MENSAGEM:\n");
  
  console.log("1. EVOLUTION API recebe mensagem do WhatsApp");
  console.log("2. Faz POST para webhook do sistema");
  console.log("3. Sistema cria/atualiza CONVERSA");
  console.log("4. Se nova conversa → é um LEAD\n");
  
  // Verificar mensagens recentes
  const msgs = await pool.query(`
    SELECT m.direction, m.timestamp, m.message_type, s.name as vendedor
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN sellers s ON s.id = c.seller_id
    ORDER BY m.timestamp DESC
    LIMIT 5
  `);
  
  console.log("ÚLTIMAS 5 MENSAGENS:");
  msgs.rows.forEach((r, i) => {
    const dir = r.direction === 'inbound' ? '← Cliente' : '→ Vendedor';
    console.log("  " + (i+1) + ". " + dir + " [" + r.message_type + "] " + r.timestamp.toISOString());
    console.log("     Vendedor: " + r.vendedor);
  });
  
  await pool.end();
}
fluxo();
