const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar tipo de mídia
  const media = await pool.query(`
    SELECT 
      m.id,
      m.timestamp,
      m.raw_event::json->'message'->'imageMessage'->>'mimetype' as image_type,
      m.raw_event::json->'message'->'documentMessage'->>'mimetype' as doc_type,
      m.raw_event::json->'message'->'imageMessage'->>'caption' as caption,
      m.raw_event::json->'message'->'documentMessage'->>'fileName' as filename
    FROM messages m
    WHERE m.direction = 'inbound'
    AND m.raw_event::text LIKE '%"imageMessage"%'
    ORDER BY m.timestamp DESC
    LIMIT 10
  `);
  
  console.log("Imagens encontradas: " + media.rows.length);
  
  media.rows.forEach((r, i) => {
    if (r.image_type) {
      console.log("\n" + (i+1) + ". IMAGEM: " + r.image_type);
      console.log("   Caption: " + (r.caption || '(sem caption)'));
      console.log("   Data: " + r.timestamp.toISOString());
    }
  });
  
  // Verificar documentos
  const docs = await pool.query(`
    SELECT 
      m.id,
      m.raw_event::json->'message'->'documentMessage'->>'fileName' as filename,
      m.raw_event::json->'message'->'documentMessage'->>'mimetype' as mimetype
    FROM messages m
    WHERE m.direction = 'inbound'
    AND m.raw_event::text LIKE '%"documentMessage"%'
    ORDER BY m.timestamp DESC
    LIMIT 5
  `);
  
  console.log("\n\nDocumentos encontrados: " + docs.rows.length);
  docs.rows.forEach((r, i) => {
    if (r.filename) {
      console.log("  " + (i+1) + ". " + r.filename + " (" + r.mimetype + ")");
    }
  });
  
  await pool.end();
}
check();
