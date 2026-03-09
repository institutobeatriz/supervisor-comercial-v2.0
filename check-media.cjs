const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar mensagens com mídia
  const media = await pool.query(`
    SELECT 
      m.id,
      m.timestamp,
      m.direction,
      substring(m.raw_event::text, 1, 300) as raw_preview
    FROM messages m
    WHERE m.direction = 'inbound'
    AND (
      m.raw_event::text LIKE '%"imageMessage"%'
      OR m.raw_event::text LIKE '%"documentMessage"%'
      OR m.raw_event::text LIKE '%"mediaKey"%'
    )
    ORDER BY m.timestamp DESC
    LIMIT 5
  `);
  
  console.log("Mensagens com mídia encontradas: " + media.rows.length);
  
  if (media.rows.length > 0) {
    console.log("\nÚltimas mídias:");
    media.rows.forEach((r, i) => {
      console.log((i+1) + ". " + r.timestamp.toISOString());
      console.log("   Preview: " + r.raw_preview.substring(0, 150));
    });
  } else {
    console.log("\nNenhuma mídia encontrada nas mensagens.");
    console.log("Isso pode indicar que:");
    console.log("1. A Evolution API não está baixando mídias");
    console.log("2. As mensagens são apenas texto");
    console.log("3. O raw_event não contém informações de mídia");
  }
  
  await pool.end();
}
check();
