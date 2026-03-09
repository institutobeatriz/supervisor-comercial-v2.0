function getPeriodDates(periodMode, date, month) {
  if (periodMode === 'day' && date) {
    return {
      startDate: new Date(date + 'T00:00:00.000Z'),
      endDate: new Date(date + 'T23:59:59.999Z'),
    };
  } else if (periodMode === 'month' && month) {
    const [year, monthNum] = month.split('-').map(Number);
    return {
      startDate: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)),
    };
  } else {
    const now = new Date();
    return {
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)),
      endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    };
  }
}

console.log("=== TESTE getPeriodDates ===\n");

console.log("Janeiro 2026:");
const jan = getPeriodDates('month', undefined, '2026-01');
console.log("  Start:", jan.startDate.toISOString());
console.log("  End:", jan.endDate.toISOString());

console.log("\nFevereiro 2026:");
const fev = getPeriodDates('month', undefined, '2026-02');
console.log("  Start:", fev.startDate.toISOString());
console.log("  End:", fev.endDate.toISOString());

console.log("\nDia 2026-02-25:");
const day = getPeriodDates('day', '2026-02-25', undefined);
console.log("  Start:", day.startDate.toISOString());
console.log("  End:", day.endDate.toISOString());
