import { getExecutiveKpis } from './packages/db/dist/index.js';

async function debug() {
  try {
    const start = new Date(Date.UTC(2026, 2, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 3, 0, 23, 59, 59, 999));
    
    const kpis = await getExecutiveKpis(null, start, end);
    
    console.log('[DEBUG] getExecutiveKpis result:', JSON.stringify(kpis, null, 2));
    console.log('[DEBUG] conversion_rate value:', kpis.conversion_rate);
    console.log('[DEBUG] sales_won:', kpis.sales_won);
    console.log('[DEBUG] leads_received:', kpis.leads_received);
    
    const calculated = (kpis.sales_won / Math.max(kpis.leads_received, 1)) * 100;
    console.log('[DEBUG] Calculated conversion (should use sales_won/leads_received):', calculated.toFixed(2) + '%');
    console.log('[DEBUG] Math.round(calculated):', Math.round(calculated));
    
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

debug();
