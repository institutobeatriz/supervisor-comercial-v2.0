import { query } from '@supervisor/db';

async function checkMessage() {
  console.log('=== Verificando mensagem de teste ===\n');
  
  // Buscar mensagem recente do contato de teste
  const result = await query(
    `SELECT m.id, m.text, m.direction, m.type, m.created_at,
            c.display_name, c.phone_e164,
            s.name as seller_name, s.id as seller_id
     FROM messages m
     JOIN conversations conv ON m.conversation_id = conv.id
     JOIN contacts c ON conv.contact_id = c.id
     JOIN sellers s ON conv.seller_id = s.id
     WHERE c.phone_e164 = '5511999999999'
     ORDER BY m.created_at DESC
     LIMIT 1`
  );
  
  if (result.rows.length === 0) {
    console.log('❌ Mensagem não encontrada');
    return;
  }
  
  const msg = result.rows[0];
  console.log('✅ Mensagem encontrada!');
  console.log(`   ID: ${msg.id}`);
  console.log(`   Texto: ${msg.text}`);
  console.log(`   Direção: ${msg.direction}`);
  console.log(`   Contato: ${msg.display_name} (${msg.phone_e164})`);
  console.log(`   Seller: ${msg.seller_name} (${msg.seller_id})`);
  console.log(`   Criada em: ${msg.created_at}`);
  
  // Verificar se é o seller correto
  if (msg.seller_name === 'Instituto Beatriz Oliveira') {
    console.log('\n✅✅✅ MULTI-TENANCY FUNCIONANDO!');
    console.log('   Mensagem corretamente atribuída ao seller Beatriz Oliveira');
  } else {
    console.log('\n⚠️  Mensagem atribuída a:', msg.seller_name);
    console.log('   Esperado: Instituto Beatriz Oliveira');
  }
}

checkMessage().catch(console.error);
