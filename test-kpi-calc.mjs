import { getExecutiveKpis } from './packages/db/dist/index.js';

async function testCalculation() {
  try {
    console.log('[TEST] Starting test...');
    
    // Test with March 2026 data
    const start = new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 3, 0, 23, 59, 59, 999));
    
    console.log('[TEST] Calling getExecutiveKpis...');
    const kpis = await getExecutiveKpis(null, start, end);
    
    console.log('[TEST] KPIs received:');
    console.log('  sales_won:', kpis.sales_won);
    console.log('  leads_received:', kpis.leads_received);
    console.log('  conversion_rate (from DB):', kpis.conversion_rate);
    
    // Apply the NEW calculation logic
    const taxaConversao = Math.round((kpis.sales_won / Math.max(kpis.leads_received, 1)) * 100);
    console.log('[TEST] CALCULATED taxaConversao:', taxaConversao);
    
    if (taxaConversao === 1) {
      console.log('[SUCCESS] Calculation is CORRECT!');
    } else {
      console.log('[ERROR] Calculation is WRONG! Expected 1, got', taxaConversao);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Exception:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    process.exit(1);
  }
}

testCalculation();
