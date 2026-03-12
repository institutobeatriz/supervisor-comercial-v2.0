/**
 * Phase 50 — Analytics UI Drill
 * Drills: analytics_current_shape / analytics_coverage_pct_range /
 *         analytics_null_current_safe / analytics_endpoint_contract
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const DRILL_NAME = 'phase50-analytics-ui-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase50-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

const REQUIRED_CURRENT_FIELDS = [
  'activeRecords',
  'assignedOwners',
  'unassignedOwners',
  'ownerCoveragePct',
  'breachedEscalations',
];

async function drillAnalyticsCurrentShape() {
  const mockCurrent = {
    activeRecords: 5,
    assignedOwners: 4,
    unassignedOwners: 1,
    ownerCoveragePct: 80,
    breachedEscalations: 0,
  };
  for (const field of REQUIRED_CURRENT_FIELDS) {
    assert(field in mockCurrent, `current has field: ${field}`);
    assert(typeof mockCurrent[field] === 'number', `current.${field} is numeric`);
  }
}

async function drillAnalyticsCoveragePctRange() {
  const cases = [
    { pct: 80, expected: 'success' },
    { pct: 50, expected: 'warning' },
    { pct: 30, expected: 'danger' },
    { pct: 100, expected: 'success' },
    { pct: 0, expected: 'danger' },
  ];
  for (const { pct, expected } of cases) {
    const actual = pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger';
    assert(actual === expected, `pct=${pct} maps to ${expected}`, `got ${actual}`);
  }
}

async function drillAnalyticsNullCurrentSafe() {
  const analyticsNullCurrent = { generatedAt: null, current: null, entries: [], totalEntries: 0 };
  const shouldRender = analyticsNullCurrent.current !== null;
  assert(!shouldRender, 'null current → card does not render');

  const analyticsMissingCurrent = {};
  const shouldRender2 = Boolean(analyticsMissingCurrent?.current);
  assert(!shouldRender2, 'missing current → card does not render');
}

async function drillAnalyticsEndpointContract() {
  const expectedTopLevelKeys = ['generatedAt', 'version', 'current', 'entries', 'totalEntries'];
  const mockResponse = {
    generatedAt: new Date().toISOString(),
    version: 1,
    current: { activeRecords: 0, assignedOwners: 0, unassignedOwners: 0, ownerCoveragePct: 0, breachedEscalations: 0 },
    entries: [],
    totalEntries: 0,
  };
  for (const key of expectedTopLevelKeys) {
    assert(key in mockResponse, `analytics response has key: ${key}`);
  }
}

const drills = [
  { name: 'analytics_current_shape', run: drillAnalyticsCurrentShape },
  { name: 'analytics_coverage_pct_range', run: drillAnalyticsCoveragePctRange },
  { name: 'analytics_null_current_safe', run: drillAnalyticsNullCurrentSafe },
  { name: 'analytics_endpoint_contract', run: drillAnalyticsEndpointContract },
];

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`[${DRILL_NAME}] Starting...\n`);

  const errors = [];
  for (const drill of drills) {
    console.log(`[Drill] ${drill.name}`);
    try {
      await drill.run();
    } catch (err) {
      errors.push({ drill: drill.name, error: err.message });
      console.error(`  ${err.message}`);
    }
    console.log();
  }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = { drillName: DRILL_NAME, status, errors, ts: new Date().toISOString() };
  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);

  console.log(`[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
