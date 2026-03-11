import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function reassign() {
  console.log('🔄 Reassociando conversas...\n');
  
  // Buscar IDs dos vendedores
  const sellers = await pool.query(`SELECT id, name FROM sellers`);
  const sellerMap = Object.fromEntries(sellers.rows.map(s => [s.name, s.id]));
  
  console.log('Vendedores:', sellerMap);
  
  // Buscar todas as conversas com suas mensagens
  const conversations = await pool.query(`
    SELECT c.id, c.seller_id, 
           (SELECT m.seller_id FROM messages m WHERE m.conversation_id = c.id LIMIT 1) as original_seller
    FROM conversations c
  `);
  
  // Buscar sellers antigos para identificar a instância
  const oldSellers = {
    'Multivix': sellerMap['Vendedor Padrão'],
    'Multivix-Alunos': sellerMap['Vendedor Padrão'],
    'Recepcao': sellerMap['Vendedor Padrão'],
    'Pedagogico': sellerMap['Vendedor Padrão'],
    'instituto-beatriz-cobranca': sellerMap['Vendedor Padrão'],
    'Instituto-Vendas': sellerMap['Instituto-Vendas'],
  };
  
  // Buscar mensagens para identificar a instância de origem
  const messages = await pool.query(`
    SELECT DISTINCT ON (conversation_id) 
           conversation_id, 
           raw_event->'key'->>'remoteJid' as remote_jid
    FROM messages
    ORDER BY conversation_id, timestamp ASC
  `);
  
  console.log(`Total conversas: ${conversations.rowCount}`);
  console.log(`Total mensagens: ${messages.rowCount}`);
  
  // Ver raw_event para identificar instância
  const sampleMsg = await pool.query(`
    SELECT conversation_id, raw_event 
    FROM messages 
    LIMIT 5
  `);
  console.log('\nExemplo de raw_event:', JSON.stringify(sampleMsg.rows[0]?.raw_event, null, 2)?.substring(0, 500));
  
  // Atualizar baseado no seller antigo (salvou no sync original)
  // Como não temos essa info, vamos sincronizar novamente
  
  await pool.end();
}

reassign().catch(console.error);
