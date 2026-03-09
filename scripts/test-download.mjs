import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

async function downloadAndTranscribe() {
  if (!EVOLUTION_KEY) {
    throw new Error('EVOLUTION_API_KEY is required');
  }

  // Buscar áudio com raw_event
  const result = await pool.query(`
    SELECT id, media_url, raw_event, conversation_id
    FROM messages
    WHERE direction = 'inbound' 
      AND type = 'audio'
      AND (text IS NULL OR text = '')
    LIMIT 1
  `);
  
  if (result.rows.length === 0) {
    console.log('Nenhum áudio para processar');
    await pool.end();
    return;
  }
  
  const msg = result.rows[0];
  console.log('Mensagem:', msg.id);
  console.log('Raw event:', JSON.stringify(msg.raw_event, null, 2).substring(0, 500));
  
  // Extrair key do raw_event (nível raiz)
  const key = msg.raw_event?.key;
  if (!key) {
    console.log('Sem key no raw_event');
    await pool.end();
    return;
  }
  
  console.log('\nKey:', JSON.stringify(key));
  
  // Determinar instância (hardcoded por enquanto)
  const instance = 'Multivix';
  
  // Baixar via Evolution API
  const downloadUrl = `${EVOLUTION_URL}/chat/downloadBase64/${instance}`;
  console.log('\nTentando:', downloadUrl);
  
  try {
    const response = await fetch(downloadUrl, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: msg.raw_event }),
    });
    
    const data = await response.json();
    console.log('Resposta:', JSON.stringify(data, null, 2).substring(0, 500));
  } catch (err) {
    console.error('Erro:', err.message);
  }
  
  await pool.end();
}

downloadAndTranscribe().catch(console.error);
