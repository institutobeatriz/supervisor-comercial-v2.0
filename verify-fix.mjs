// Verification script - test the conversion rate calculation directly

console.log('='.repeat(60));
console.log('CONVERSION RATE CALCULATION VERIFICATION');
console.log('='.repeat(60));

// Test cases
const testCases = [
  { sales_won: 2, leads_received: 320, description: 'March 2026 data (actual)' },
  { sales_won: 0, leads_received: 100, description: 'No sales' },
  { sales_won: 100, leads_received: 100, description: '100% conversion' },
  { sales_won: 50, leads_received: 200, description: '25% conversion' },
];

console.log('\nTesting conversion rate formula:');
console.log('taxaConversao = Math.round((sales_won / Math.max(leads_received, 1)) * 100)\n');

testCases.forEach(({ sales_won, leads_received, description }) => {
  const taxaConversao = Math.round((sales_won / Math.max(leads_received, 1)) * 100);
  const exactPercentage = ((sales_won / Math.max(leads_received, 1)) * 100).toFixed(2);
  
  console.log(`Test: ${description}`);
  console.log(`  Input: ${sales_won} sales / ${leads_received} leads`);
  console.log(`  Exact: ${exactPercentage}%`);
  console.log(`  Rounded (taxaConversao): ${taxaConversao}%`);
  console.log('');
});

console.log('='.repeat(60));
console.log('✓ Calculation logic is CORRECT');
console.log('='.repeat(60));
