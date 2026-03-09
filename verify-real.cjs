const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  console.log("=== VERIFICACAO DE AUTENTICIDADE ===\n");
  
  // 1. Mensagens com raw_event (dados reais do WhatsApp)
  const withRawEvent = await pool.query(`
    SELECT COUNT(*) as total, 
           COUNT(raw_event) as com_raw_event,
           COUNT(*) FILTER (WHERE raw_event IS NOT NULL AND raw_event::text != '{}') as dados_reais
    FROM messages
  `);
  console.log("Mensagens:");
  console.log("  Total:", withRawEvent.rows[0].total);
  console.log("  Com dados reais (raw_event):", withRawEvent.rows[0].com_raw_event);
  
  // 2. Verificar contatos reais
  const contacts = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(phone_e164) as com_telefone
    FROM contacts
  `);
  console.log("\nContatos:");
  console.log("  Total:", contacts.rows[0].total);
  console.log("  Com telefone real:", contacts.rows[0].com_telefone);
  
  // 3. Vendas com valores
  const sales = await pool.query(`
    SELECT outcome, COUNT(*) as total, SUM(value_cents) as valor_total
    FROM sales_outcomes
    GROUP BY outcome
  `);
  console.log("\nVendas:");
  sales.rows.forEach(r => {
    console.log("  " + r.outcome + ": " + r.total + " (R$ " + (r.valor_total/100 || 0) + ")");
  });
  
  // 4. Mensagens recentes (últimas 5)
  const recentMsgs = await pool.query(`
    SELECT m.timestamp, m.direction, m.content, c.id as conv_id
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    ORDER BY m.timestamp DESC
    LIMIT 5
  `);
  console.log("\nÚltimas 5 mensagens:");
  recentMsgs.rows.forEach((r, i) => {
    const preview = r.content ? r.content.substring(0, 50) + '...' : '(sem conteúdo)';
    console.log("  " + (i+1) + ". [" + r.direction + "] " + preview);
  });
  
  // 5. Verificar se há instâncias Evolution API conectadas
  const instances = await pool.query(`
    SELECT DISTINCT 
      c.metadata->>'instance' as instance,
      COUNT(*) as mensagens
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.metadata IS NOT NULL
    GROUP BY c.metadata->>'instance'
  `);
  console.log("\nInstâncias Evolution API:");
  if (instances.rows.length > 0) {
    instances.rows.forEach(r => {
      console.log("  " + (r.instance || 'default') + ": " + r.mensagens + " mensagens");
    });
  } else {
    console.log("  Nenhuma instância detectada nos metadados");
  }
  
  await pool.end();
}
check();
