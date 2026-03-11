import { createHumanReview, approveReview, getReviewStats } from '@supervisor/db';
import { recordFeedback, getAdjustedThreshold, analyzeFeedbackPatterns, generateRalphInsights } from '@supervisor/planner';
import { query } from '@supervisor/db';

async function simulateReview() {
  console.log('=== SIMULAÇÃO REVISÃO HUMANA ===\n');
  
  // 1. Criar revisão humana
  console.log('1. Criando revisão humana...');
  const review = await createHumanReview({
    conversation_id: 'sim-test-001',
    contact_name: 'Cliente Teste',
    suggested_outcome: 'won',
    suggested_value_cents: 75000,
    confidence: 0.92,
    reason: 'Valor acima de R$ 500 - requer confirmação humana',
    message_text: 'Quero fechar o pacote premium hoje',
    trace_id: 'trace-sim-001',
  });
  console.log(`✓ Revisão criada: ID ${review.id}`);
  console.log(`  - Valor: R$ ${(review.suggested_value_cents / 100).toFixed(2)}`);
  console.log(`  - Confiança: ${(review.confidence * 100).toFixed(0)}%`);
  console.log(`  - Motivo: ${review.reason}\n`);
  
  // 2. Ver stats antes
  console.log('2. Stats antes da aprovação:');
  const statsBefore = await getReviewStats();
  console.log(`  - Pendentes: ${statsBefore.pending}`);
  console.log(`  - Aprovadas: ${statsBefore.approved}`);
  console.log(`  - Rejeitadas: ${statsBefore.rejected}\n`);
  
  // 3. Aprovar revisão
  console.log('3. Aprovando revisão (simulando decisão humana)...');
  const approved = await approveReview(review.id, 'Admin Teste', 'approved', 75000, 'Venda confirmada - comprovante recebido');
  console.log(`✓ Revisão aprovada: ${approved.status}`);
  console.log(`  - Revisado por: ${approved.reviewed_by}`);
  console.log(`  - Notas: ${approved.review_notes}\n`);
  
  // 4. Registrar feedback
  console.log('4. Registrando feedback no Ralph...');
  await recordFeedback(
    review.conversation_id,
    review.trace_id,
    'classify',
    review.confidence,
    true, // estava correto
    'Admin Teste',
    'Venda de alto valor - classificação correta'
  );
  console.log('✓ Feedback registrado\n');
  
  // 5. Analisar padrões
  console.log('5. Analisando padrões de feedback...');
  const patterns = await analyzeFeedbackPatterns('classify', 30);
  console.log(`  - Total avaliações: ${patterns.total}`);
  console.log(`  - Taxa de acerto: ${(patterns.correctRate * 100).toFixed(1)}%`);
  console.log(`  - Threshold recomendado: ${(patterns.recommendedThreshold * 100).toFixed(0)}%`);
  if (patterns.patterns.length > 0) {
    console.log(`  - Padrões detectados: ${patterns.patterns.join(', ')}`);
  }
  console.log();
  
  // 6. Veirificar threshold ajustado
  console.log('6. Verificando threshold ajustado...');
  const adjusted = await getAdjustedThreshold('classify', 0.7);
  console.log(`  - Threshold base: 70%`);
  console.log(`  - Threshold ajustado: ${(adjusted * 100).toFixed(0)}%`);
  const diff = adjusted - 0.7;
  if (diff > 0) {
    console.log(`  → Aumentado em ${(diff * 100).toFixed(0)}% (mais rigoroso)`);
  } else if (diff < 0) {
    console.log(`  → Diminuído em ${(Math.abs(diff) * 100).toFixed(0)}% (mais permissivo)`);
  } else {
    console.log(`  → Mantido no mesmo valor`);
  }
  console.log();
  
  // 7. Gerar insights
  console.log('7. Gerando insights...');
  const insights = await generateRalphInsights();
  console.log(insights);
  
  console.log('\n=== SIMULAÇÃO COMPLETA ===');
}

simulateReview().catch(console.error);
