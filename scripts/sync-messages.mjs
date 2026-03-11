#!/usr/bin/env node
/**
 * Script para sincronizar mensagens da Evolution API
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

const INSTANCES = [
  'Multivix',
  'Instituto-Vendas', 
  'Multivix-Alunos',
  'Recepcao',
  'Pedagogico',
  'instituto-beatriz-cobranca'
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Cache para evitar queries repetidas
const sellerCache = new Map();
const contactCache = new Map();
const conversationCache = new Map();

async function getMessages(instance, page = 1) {
  const url = `${EVOLUTION_URL}/chat/findMessages/${instance}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      where: {},
      limit: 100,
      page
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.status}`);
  }
  
  return response.json();
}

async function ensureSeller(name) {
  if (sellerCache.has(name)) {
    return sellerCache.get(name);
  }
  
  let result = await pool.query(`SELECT id FROM sellers WHERE name = $1`, [name]);
  
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO sellers (name, active) VALUES ($1, true) RETURNING id`,
      [name]
    );
  }
  
  const id = result.rows[0].id;
  sellerCache.set(name, id);
  return id;
}

async function ensureContact(phone) {
  if (contactCache.has(phone)) {
    return contactCache.get(phone);
  }
  
  let result = await pool.query(`SELECT id FROM contacts WHERE phone_e164 = $1`, [phone]);
  
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO contacts (phone_e164) VALUES ($1) RETURNING id`,
      [phone]
    );
  }
  
  const id = result.rows[0].id;
  contactCache.set(phone, id);
  return id;
}

async function ensureConversation(contactId, sellerId) {
  const key = `${contactId}-${sellerId}`;
  
  if (conversationCache.has(key)) {
    return conversationCache.get(key);
  }
  
  let result = await pool.query(
    `SELECT id FROM conversations WHERE contact_id = $1`,
    [contactId]
  );
  
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage) 
       VALUES ($1, $2, 'open', 'lead') RETURNING id`,
      [contactId, sellerId]
    );
  }
  
  const id = result.rows[0].id;
  conversationCache.set(key, id);
  return id;
}

async function saveMessage(msg, sellerId) {
  const remoteJid = msg.key?.remoteJid || '';
  
  // Extract phone from various formats
  let phone = null;
  
  if (remoteJid.includes('@s.whatsapp.net')) {
    phone = remoteJid.split('@')[0];
  } else if (remoteJid.includes('@lid')) {
    return false; // Skip group messages
  } else {
    return false;
  }
  
  if (!phone || phone.length < 8) return false;
  
  try {
    const contactId = await ensureContact(phone);
    const conversationId = await ensureConversation(contactId, sellerId);
    
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || '';
    
    const direction = msg.key?.fromMe ? 'outbound' : 'inbound';
    const timestamp = new Date(msg.messageTimestamp * 1000);
    
    await pool.query(
      `INSERT INTO messages (conversation_id, seller_id, direction, type, text, timestamp, raw_event)
       VALUES ($1, $2, $3, 'text', $4, $5, $6)`,
      [conversationId, sellerId, direction, text, timestamp, JSON.stringify(msg)]
    );
    
    return true;
  } catch (err) {
    // Ignore duplicate errors
    if (!err.message.includes('unique') && !err.message.includes('duplicate')) {
      console.error('Error:', err.message.substring(0, 50));
    }
    return false;
  }
}

async function syncInstance(instance) {
  console.log(`\n📱 Syncing ${instance}...`);
  
  const sellerId = await ensureSeller(instance);
  let total = 0;
  let page = 1;
  let hasMore = true;
  
  // Only sync last 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  while (hasMore && page <= 10) {
    try {
      const data = await getMessages(instance, page);
      
      if (!data.messages?.records?.length) {
        hasMore = false;
        break;
      }
      
      for (const msg of data.messages.records) {
        const msgTime = new Date(msg.messageTimestamp * 1000);
        
        if (msgTime < yesterday) {
          hasMore = false;
          break;
        }
        
        const saved = await saveMessage(msg, sellerId);
        if (saved) total++;
      }
      
      console.log(`  Page ${page}: ${total} saved`);
      page++;
      
      if (page > (data.messages?.pages || 1)) {
        hasMore = false;
      }
    } catch (err) {
      console.error(`  Error:`, err.message);
      hasMore = false;
    }
  }
  
  return total;
}

async function main() {
  if (!EVOLUTION_KEY) {
    throw new Error('EVOLUTION_API_KEY is required');
  }

  console.log('🔄 Starting message sync (last 24h)...\n');
  
  let grandTotal = 0;
  
  for (const instance of INSTANCES) {
    try {
      const count = await syncInstance(instance);
      grandTotal += count;
    } catch (err) {
      console.error(`❌ Error syncing ${instance}:`, err.message);
    }
  }
  
  console.log(`\n✅ Sync complete! Total: ${grandTotal} messages`);
  
  await pool.end();
}

main().catch(console.error);
