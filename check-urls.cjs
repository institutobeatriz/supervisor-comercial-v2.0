const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  // Verificar se há media_url
  const mediaUrl = await pool.query(`
    SELECT 
      m.id,
      m.raw_event::json->'message'->'imageMessage'->>'url' as url,
      m.raw_event::json->'message'->'imageMessage'->>'mediaKey' as media_key
    FROM messages m
    WHERE m.direction = 'inbound'
    AND m.raw_event::text LIKE '%"imageMessage"%'
    ORDER BY m.timestamp DESC
    LIMIT 3
  `);
  
  console.log("Mensagens com URL de mídia: " + mediaUrl.rows.filter(r => r.url).length);
  
  mediaUrl.rows.forEach((r, i) => {
    console.log("\n" + (i+1) + ".");
    console.log("   URL: " + (r.url ? r.url.substring(0, 60) + "..." : "(sem URL)"));
    console.log("   MediaKey: " + (r.media_key ? "SIM" : "NÃO"));
  });
  
  // Verificar se Evolution API está baixando mídias
  console.log("\n\n=== PRÓXIMOS PASSOS ===");
  console.log("1. Configurar Evolution API para baixar mídias");
  console.log("2. Implementar OCR para detectar comprovantes");
  console.log("3. Extrair valores automaticamente");
  
  await pool.end();
}
check();
