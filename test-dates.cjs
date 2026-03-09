function getPeriodDates(periodMode, date, month) {
  console.log('getPeriodDates called with:', {periodMode, date, month});
  if (periodMode === 'day' && date) {
    return {
      startDate: new Date(date + 'T00:00:00.000Z'),
      endDate: new Date(date + 'T23:59:59.999Z'),
    };
  } else if (periodMode === 'month' && month) {
    const [year, monthNum] = month.split('-').map(Number);
    console.log('Parsing month:', {year, monthNum});
    return {
      startDate: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)),
    };
  } else {
    console.log('Using default (current month)');
    const now = new Date();
    return {
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    };
  }
}

// Simulando query params
console.log("=== Test 1: month=2026-01 ===");
const r1 = getPeriodDates('month', undefined, '2026-01');
console.log('Result:', { startDate: r1.startDate.toISOString(), endDate: r1.endDate.toISOString() });

console.log("\n=== Test 2: month=2026-02 ===");
const r2 = getPeriodDates('month', undefined, '2026-02');
console.log('Result:', { startDate: r2.startDate.toISOString(), endDate: r2.endDate.toISOString() });

console.log("\n=== Test 3: day=2026-02-25 ===");
const r3 = getPeriodDates('day', '2026-02-25', undefined);
console.log('Result:', { startDate: r3.startDate.toISOString(), endDate: r3.endDate.toISOString() });
