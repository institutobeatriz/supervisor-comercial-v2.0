import fs from 'fs';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'app',
  password: 'app',
  database: 'sales_supervisor',
});

const SELLER_ID = '7ac25038-9649-43b2-b0a5-abd89a750a5f'; // Instituto Beatriz Oliveira
const BATCH_SIZE = 500;

interface RawMessage {
  id: string;
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  pushName?: string;
  messageType: string;
  message: any;
  messageTimestamp: number;
  instanceId: string;
}

async function importMessages() {
  console.log('Carregando arquivo JSON...');
  const buffer = fs.readFileSync('../instituto-vendas-messages.json');
  // Detectar e converter UTF-16 LE para UTF-8
  const raw = buffer.toString('utf16le').replace(/^\uFEFF/, '');
  const messages: RawMessage[] = JSON.parse(raw);
  console.log(`Total de mensagens: ${messages.length}`);

  // Agrupar por contato (remoteJid)
  const byContact = new Map<string, RawMessage[]>();
  for (const msg of messages) {
    const jid = msg.key.remoteJid;
    if (!byContact.has(jid)) byContact.set(jid, []);
    byContact.get(jid)!.push(msg);
  }
  console.log(`Contatos únicos: ${byContact.size}`);

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Criar contatos e conversas
    console.log('\nCriando contatos e conversas...');
    let contactCount = 0;
    const contactMap = new Map<string, string>(); // jid -> contact_id
    const conversationMap = new Map<string, string>(); // jid -> conversation_id

    for (const [jid, msgs] of byContact) {
      // Pular grupos
      if (jid.includes('@g.us')) continue;
      
      // Extrair telefone
      const phone = jid.split('@')[0];
      const pushName = msgs.find(m => m.pushName)?.pushName || null;

      // Inserir contato (upsert)
      const contactResult = await client.query(
        `INSERT INTO contacts (phone_e164, display_name)
         VALUES ($1, $2)
         ON CONFLICT (phone_e164) DO UPDATE SET display_name = COALESCE($2, contacts.display_name)
         RETURNING id`,
        [phone, pushName]
      );
      const contactId = contactResult.rows[0].id;
      contactMap.set(jid, contactId);

      // Inserir conversa
      const firstMsg = msgs.reduce((a, b) => a.messageTimestamp < b.messageTimestamp ? a : b);
      const lastMsg = msgs.reduce((a, b) => a.messageTimestamp > b.messageTimestamp ? a : b);
      
      const convResult = await client.query(
        `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage, last_message_at, created_at)
         VALUES ($1, $2, 'open', 'lead', $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [contactId, SELLER_ID, 
         new Date(lastMsg.messageTimestamp * 1000),
         new Date(firstMsg.messageTimestamp * 1000)]
      );
      
      if (convResult.rows[0]) {
        conversationMap.set(jid, convResult.rows[0].id);
      } else {
        // Buscar conversa existente
        const existing = await client.query(
          `SELECT id FROM conversations WHERE contact_id = $1 AND seller_id = $2`,
          [contactId, SELLER_ID]
        );
        if (existing.rows[0]) {
          conversationMap.set(jid, existing.rows[0].id);
        }
      }

      contactCount++;
      if (contactCount % 100 === 0) {
        console.log(`  ${contactCount}/${byContact.size} contatos processados...`);
      }
    }

    // Inserir mensagens em batches
    console.log('\nInserindo mensagens...');
    let msgCount = 0;
    const msgValues: any[] = [];

    for (const [jid, msgs] of byContact) {
      if (jid.includes('@g.us')) continue;
      
      const conversationId = conversationMap.get(jid);
      if (!conversationId) continue;

      for (const msg of msgs) {
        const timestamp = new Date(msg.messageTimestamp * 1000);
        const text = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text ||
                     msg.message?.imageMessage?.caption ||
                     msg.message?.videoMessage?.caption || null;

        msgValues.push([
          randomUUID(), // Gerar UUID válido
          conversationId,
          SELLER_ID,
          msg.key.fromMe ? 'outbound' : 'inbound',
          msg.messageType,
          text,
          timestamp,
          { ...msg, original_id: msg.key.id }, // Preservar ID original
        ]);

        if (msgValues.length >= BATCH_SIZE) {
          await insertBatch(client, msgValues);
          msgCount += msgValues.length;
          console.log(`  ${msgCount}/${messages.length} mensagens inseridas...`);
          msgValues.length = 0;
        }
      }
    }

    // Inserir restante
    if (msgValues.length > 0) {
      await insertBatch(client, msgValues);
      msgCount += msgValues.length;
    }

    await client.query('COMMIT');
    console.log(`\n✅ Importação concluída! ${msgCount} mensagens inseridas.`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

async function insertBatch(client: any, values: any[]) {
  const query = `
    INSERT INTO messages (id, conversation_id, seller_id, direction, type, text, timestamp, raw_event)
    VALUES ${values.map((_, i) => `($${i*8+1}, $${i*8+2}, $${i*8+3}, $${i*8+4}, $${i*8+5}, $${i*8+6}, $${i*8+7}, $${i*8+8})`).join(', ')}
  `;
  const flatValues = values.flat();
  await client.query(query, flatValues);
}

importMessages().catch(console.error);
