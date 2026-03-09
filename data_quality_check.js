import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://app:app@localhost:5432/sales_supervisor' });

async function check() {
  console.log('🔍 VERIFICAÇÃO DE QUALIDADE - BANCO SUPERVISOR COMERCIAL\n');
  console.log('='.repeat(70));
  
  try {
    // Contagens
    console.log('\n📊 CONTAGENS PRINCIPAIS');
    console.log('-'.repeat(50));
    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COUNT(*) FROM messages WHERE direction = 'inbound') as inbound,
        (SELECT COUNT(*) FROM messages WHERE direction = 'outbound') as outbound,
        (SELECT COUNT(*) FROM conversations) as conversations,
        (SELECT COUNT(*) FROM conversations WHERE funnel_stage = 'lead') as leads,
        (SELECT COUNT(*) FROM conversations WHERE funnel_stage = 'sale') as sales,
        (SELECT COUNT(*) FROM conversations WHERE funnel_stage = 'lost') as lost,
        (SELECT COUNT(*) FROM contacts) as contacts,
        (SELECT COUNT(*) FROM sellers) as sellers,
        (SELECT COUNT(*) FROM sales_outcomes WHERE outcome = 'won') as won,
        (SELECT COUNT(*) FROM sales_outcomes WHERE outcome = 'lost') as lost_sales,
        (SELECT COUNT(*) FROM audio_transcripts) as transcripts,
        (SELECT COUNT(*) FROM message_labels) as labels_check,
        (SELECT COUNT(*) FROM message_labels ml JOIN messages m ON ml.message_id = m.id WHERE m.direction = 'inbound') as inbound_with_labels
    `);
    const c = counts.rows[0];
    console.log(`Mensagens:           ${c.total_messages} (inbound: ${c.inbound}, outbound: ${c.outbound})`);
    console.log(`Conversas:           ${c.conversations} (leads: ${c.leads}, sales: ${c.sales}, lost: ${c.lost})`);
    console.log(`Contatos:            ${c.contacts} | Vendedores: ${c.sellers}`);
    console.log(`Sales Outcomes:      ${c.won} ganhas, ${c.lost_sales} perdidas`);
    console.log(`Transcrições:        ${c.transcripts}`);
    console.log(`Labels de inbound:   ${c.inbound_with_labels}/${c.inbound} (${Math.round(c.inbound_with_labels/c.inbound*100 || 0)}%)`);

    // Integridade
    console.log('\n🔎 INTEGRIDADE (DADOS ÓRFÃOS)');
    console.log('-'.repeat(50));
    const checks = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM messages m LEFT JOIN conversations c ON m.conversation_id = c.id WHERE c.id IS NULL) as orphan_msg,
        (SELECT COUNT(*) FROM conversations c LEFT JOIN contacts ct ON c.contact_id = ct.id WHERE ct.id IS NULL) as orphan_conv,
        (SELECT COUNT(*) FROM conversations c LEFT JOIN sellers s ON c.seller_id = s.id WHERE s.id IS NULL) as orphan_seller,
        (SELECT COUNT(*) FROM sales_outcomes so LEFT JOIN conversations c ON so.conversation_id = c.id WHERE c.id IS NULL) as orphan_sales,
        (SELECT COUNT(*) FROM audio_transcripts at2 LEFT JOIN messages m ON at2.message_id = m.id WHERE m.id IS NULL) as orphan_trans,
        (SELECT COUNT(*) FROM message_labels ml LEFT JOIN messages m ON ml.message_id = m.id WHERE m.id IS NULL) as orphan_labels,
        (SELECT COUNT(*) FROM conversation_insights ci LEFT JOIN conversations c ON ci.conversation_id = c.id WHERE c.id IS NULL) as orphan_insights
    `);
    const chk = checks.rows[0];
    console.log(`Mensagens sem conversa:       ${chk.orphan_msg} ${chk.orphan_msg > 0 ? '❌' : '✅'}`);
    console.log(`Conversas sem contato:        ${chk.orphan_conv} ${chk.orphan_conv > 0 ? '❌' : '✅'}`);
    console.log(`Conversas sem vendedor:       ${chk.orphan_seller} ${chk.orphan_seller > 0 ? '❌' : '✅'}`);
    console.log(`Sales sem conversa:           ${chk.orphan_sales} ${chk.orphan_sales > 0 ? '❌' : '✅'}`);
    console.log(`Transcrições sem mensagem:    ${chk.orphan_trans} ${chk.orphan_trans > 0 ? '❌' : '✅'}`);
    console.log(`Labels sem mensagem:          ${chk.orphan_labels} ${chk.orphan_labels > 0 ? '❌' : '✅'}`);
    console.log(`Insights sem conversa:        ${chk.orphan_insights} ${chk.orphan_insights > 0 ? '❌' : '✅'}`);

    // Duplicados
    console.log('\n🔄 VERIFICAÇÃO DE DUPLICADOS');
    console.log('-'.repeat(50));
    const dups = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM (SELECT phone_e164 FROM contacts GROUP BY phone_e164 HAVING COUNT(*) > 1)sq) as dup_phones,
        (SELECT COUNT(*) FROM (SELECT conversation_id FROM sales_outcomes GROUP BY conversation_id HAVING COUNT(*) > 1)sq) as dup_sales,
        (SELECT COUNT(*) FROM (SELECT contact_id, seller_id FROM conversations GROUP BY contact_id, seller_id HAVING COUNT(*) > 1)sq) as dup_conversations
    `);
    const d = dups.rows[0];
    console.log(`Telefones duplicados:         ${d.dup_phones} ${d.dup_phones > 0 ? '❌' : '✅'}`);
    console.log(`Conversas duplicadas:           ${d.dup_conversations} ${d.dup_conversations > 0 ? '❌' : '✅'}`);
    console.log(`Sales outcomes duplicados:    ${d.dup_sales} ${d.dup_sales > 0 ? '❌' : '✅'}`);

    // Cruzamento mensagens → leads → vendas
    console.log('\n🔗 CRUZAMENTO: MENSAGENS → LEADS → VENDAS');
    console.log('-'.repeat(50));
    const cross = await pool.query(`
      SELECT 
        m.conversation_id,
        COUNT(*) as msg_count,
        MIN(m.timestamp) as first_msg,
        MAX(m.timestamp) as last_msg,
        c.funnel_stage,
        c.status,
        c.last_message_at,
        so.outcome,
        so.value_cents
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN sales_outcomes so ON c.id = so.conversation_id
      GROUP BY m.conversation_id, c.funnel_stage, c.status, c.last_message_at, so.outcome, so.value_cents
      ORDER BY msg_count DESC
      LIMIT 5
    `);
    console.log('Top 5 conversas por volume de mensagens:');
    for (const row of cross.rows) {
      console.log(`  • ${row.conversation_id.slice(0,8)}: ${row.msg_count.toString().padStart(3,' ')} msgs | ${row.funnel_stage.padEnd(6)} | ${row.outcome || 'null'} | valor: ${row.value_cents || 'n/a'}`);
    }

    // Análise temporal
    console.log('\n📅 ATIVIDADE RECENTE (7 dias)');
    console.log('-'.repeat(50));
    const recent = await pool.query(`
      SELECT 
        DATE_TRUNC('day', timestamp) as day,
        COUNT(*) as messages,
        COUNT(DISTINCT conversation_id) as conversations
      FROM messages
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY day DESC
    `);
    for (const row of recent.rows) {
      const date = new Date(row.day).toLocaleDateString('pt-BR');
      console.log(`  • ${date}: ${row.messages.toString().padStart(3,' ')} msgs, ${row.conversations} conversas`);
    }

    // Anomalias
    console.log('\n⚠️  ANOMALIAS DETECTADAS');
    console.log('-'.repeat(50));
    const anomalies = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM conversations WHERE last_message_at < NOW() - INTERVAL '30 days' AND status = 'open') as old_open,
        (SELECT COUNT(*) FROM messages WHERE text IS NULL AND media_url IS NULL) as empty_msgs,
        (SELECT COUNT(*) FROM messages WHERE timestamp > NOW() + INTERVAL '1 day') as future_msgs,
        (SELECT COUNT(*) FROM sales_outcomes WHERE outcome = 'won' AND value_cents IS NULL) as won_no_value,
        (SELECT COUNT(*) FROM conversations WHERE funnel_stage = 'sale' AND status = 'open') as sale_not_closed
    `);
    const a = anomalies.rows[0];
    console.log(`Conversas abertas > 30 dias:   ${a.old_open} ${a.old_open > 10 ? '⚠️ ' : '✅'}`);
    console.log(`Mensagens vazias:              ${a.empty_msgs} ${a.empty_msgs > 0 ? '❌' : '✅'}`);
    console.log(`Mensagens no futuro:           ${a.future_msgs} ${a.future_msgs > 0 ? '❌' : '✅'}`);
    console.log(`Vendas sem valor:              ${a.won_no_value} ${a.won_no_value > 0 ? '⚠️ ' : '✅'}`);
    console.log(`Vendas não fechadas:           ${a.sale_not_closed} ${a.sale_not_closed > 0 ? '⚠️ ' : '✅'}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ VERIFICAÇÃO CONCLUÍDA');
    console.log('='.repeat(70));

  } catch (e) {
    console.error('\n❌ ERRO:', e.message);
  } finally {
    await pool.end();
  }
}

check();