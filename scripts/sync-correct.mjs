import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Mapeamento: instância -> vendedor
const INSTANCE_MAP = {
  'Multivix': 'Vendedor Padrão',
  'Instituto-Vendas': 'Instituto-Vendas',
};

const sellerCache = new Map();
const contactCache = new Map();
const conversationCache = new Map();

async function getSellerId(name) {
  if (sellerCache.has(name)) return sellerCache.get(name);
  const result = await pool.query(`SELECT id FROM sellers WHERE name = $1`, [name]);
  if (result.rows.length > 0) {
    sellerCache.set(name, result.rows[0].id);
    return result.rows[0].id;
  }
  return null;
}

async function ensureContact(phone) {
  if (contactCache.has(phone)) return contactCache.get(phone);
  let result = await pool.query(`SELECT id FROM contacts WHERE phone_e164 = $1`, [phone]);
  if (result.rows.length === 0) {
    result = await pool.query(`INSERT INTO contacts (phone_e164) VALUES ($1) RETURNING id`, [phone]);
  }
  contactCache.set(phone, result.rows[0].id);
  return result.rows[0].id;
}

async function ensureConversation(contactId, sellerId) {
  const key = `${contactId}-${sellerId}`;
  if (conversationCache.has(key)) return conversationCache.get(key);
  
  let result = await pool.query(
    `SELECT id FROM conversations WHERE contact_id = $1 AND seller_id = $2`,
    [contactId, sellerId]
  );
  
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage) VALUES ($1, $2, 'open', 'lead') RETURNING id`,
      [contactId, sellerId]
    );
  }
  
  conversationCache.set(key, result.rows[0].id);
  return result.rows[0].id;
}

async function getMessages(instance, page = 1) {
  const url = `${EVOLUTION_URL}/chat/findMessages/${instance}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ where: {}, limit: 100, page })
  });
  return response.json();
}

async function sync() {
  if (!EVOLUTION_KEY) {
    throw new Error('EVOLUTION_API_KEY is required');
  }

  console.log('🔄 Sincronizando mensagens...\n');
  
  // Limpar dados existentes
  console.log('Limpando dados antigos...');
  await pool.query(`DELETE FROM messages`);
  await pool.query(`DELETE FROM conversations`);
  await pool.query(`DELETE FROM contacts`);
  console.log('Dados limpos!\n');
  
  let total = 0;
  
  for (const [instance, sellerName] of Object.entries(INSTANCE_MAP)) {
    console.log(`\n📱 ${instance} → ${sellerName}`);
    
    const sellerId = await getSellerId(sellerName);
    if (!sellerId) {
      console.log(`  ❌ Vendedor não encontrado: ${sellerName}`);
      continue;
    }
    
    let page = 1;
    let hasMore = true;
    let instanceTotal = 0;
    
    // Sincronizar últimas 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    while (hasMore && page <= 10) {
      try {
        const data = await getMessages(instance, page);
        
        if (!data.messages?.records?.length) {
          hasMore = false;
          break;
        }
        
        for (const msg of data.messages.records) {
          const remoteJid = msg.key?.remoteJid || '';
          
          let phone = null;
          if (remoteJid.includes('@s.whatsapp.net')) {
            phone = remoteJid.split('@')[0];
          } else if (remoteJid.includes('@lid')) {
            continue; // Grupos
          }
          
          if (!phone || phone.length < 8) continue;
          
          const msgTime = new Date(msg.messageTimestamp * 1000);
          if (msgTime < yesterday) {
            hasMore = false;
            break;
          }
          
          try {
            const contactId = await ensureContact(phone);
            const conversationId = await ensureConversation(contactId, sellerId);
            
            const text = msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';
            
            const direction = msg.key?.fromMe ? 'outbound' : 'inbound';
            
            await pool.query(
              `INSERT INTO messages (conversation_id, seller_id, direction, type, text, timestamp, raw_event)
               VALUES ($1, $2, $3, 'text', $4, $5, $6)`,
              [conversationId, sellerId, direction, text, msgTime, JSON.stringify(msg)]
            );
            
            instanceTotal++;
          } catch (err) {
            // Ignorar duplicados
          }
        }
        
        console.log(`  Página ${page}: ${instanceTotal} mensagens`);
        page++;
      } catch (err) {
        console.log(`  Erro: ${err.message}`);
        hasMore = false;
      }
    }
    
    total += instanceTotal;
    console.log(`  ✅ Total ${instance}: ${instanceTotal}`);
  }
  
  console.log(`\n🎉 Sincronização completa! Total: ${total} mensagens`);
  
  // Verificar resultado
  const result = await pool.query(`
    SELECT s.name as seller, COUNT(m.id) as messages, COUNT(DISTINCT c.id) as conversations
    FROM sellers s
    LEFT JOIN conversations c ON c.seller_id = s.id
    LEFT JOIN messages m ON m.seller_id = s.id
    GROUP BY s.name
  `);
  console.log('\nResumo:', result.rows);
  
  await pool.end();
}

sync().catch(console.error);
