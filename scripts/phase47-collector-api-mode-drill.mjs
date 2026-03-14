/**
 * Phase 47 — Collector API Mode Drill
 * Drills: api_unreachable / api_mode_contract / mode_env_selection
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { collectOperationalSources, validateCollectorSources } from './phase44-operational-collector.mjs';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const DRILL_NAME = 'phase47-collector-api-mode-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase47-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

// ---------------------------------------------------------------------------
// Mock HTTP server helper — spins up, calls callback, shuts down
// ---------------------------------------------------------------------------

function withMockServer(responseBody, callback) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        const result = await callback(`http://127.0.0.1:${port}`);
        server.close();
        resolve(result);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Drill 1: api_unreachable — closed port → clear error thrown
// ---------------------------------------------------------------------------

async function drillApiUnreachable() {
  console.log('\n[Drill 1] api_unreachable — closed port must throw clear error');

  let threw = false;
  let errorMessage = '';
  try {
    await collectOperationalSources({
      mode: 'api',
      apiBaseUrl: 'http://127.0.0.1:19999',  // nothing listening here
      apiKey: 'test-key',
    });
  } catch (err) {
    threw = true;
    errorMessage = err.message;
  }

  assert(threw, 'collectOperationalSources throws when API unreachable');
  assert(
    errorMessage.toLowerCase().includes('collector api'),
    'error message includes "collector api"',
    `got: "${errorMessage}"`,
  );
}

// ---------------------------------------------------------------------------
// Drill 2: api_mode_contract — mock server → sources correctly mapped
// ---------------------------------------------------------------------------

async function drillApiModeContract() {
  console.log('\n[Drill 2] api_mode_contract — mock server returns valid report, sources mapped correctly');

  const mockReport = {
    status: 'pass',
    sources: {
      incidentAutomation: {
        loaded: true,
        timestamp: '2026-03-11T12:00:00.000Z',
        incidents: { 'INC-001': { owner: 'alice', ownerAssignedAt: '2026-03-11T10:00:00Z', ownerTimezone: 'UTC', updatedAt: '2026-03-11T10:00:00Z', paging: { externalId: 'PAGE-001' }, ticket: { externalId: 'TKT-001' } } },
        incidentCount: 1,
      },
      itsmSnapshot: {
        loaded: true,
        timestamp: '2026-03-11T12:00:00.000Z',
        paging: [{ externalId: 'PAGE-001', incidentId: 'INC-001', status: 'open', owner: 'alice', raw: {} }],
        tickets: [{ externalId: 'TKT-001', incidentId: 'INC-001', status: 'open', owner: 'alice', raw: {} }],
        pagingCount: 1,
        ticketCount: 1,
      },
      fullcycleReport: {
        loaded: true,
        timestamp: '2026-03-11T12:00:00.000Z',
        status: 'pass',
        ownerCoveragePct: 100,
        summary: { ownerCoveragePct: 100 },
      },
    },
  };

  const result = await withMockServer(mockReport, async (apiBaseUrl) => {
    return collectOperationalSources({
      mode: 'api',
      apiBaseUrl,
      apiKey: 'test-key',
    });
  });

  assert(result.collectorMode === 'api', 'collectorMode is api');
  assert(result.valid === true, 'validation passes');
  assert(result.sources.incidentAutomation.loaded === true, 'incidentAutomation.loaded=true');
  assert(result.sources.incidentAutomation.incidentCount === 1, 'incidentCount=1');
  assert(result.sources.itsmSnapshot.loaded === true, 'itsmSnapshot.loaded=true');
  assert(result.sources.itsmSnapshot.pagingCount === 1, 'pagingCount=1');
  assert(result.sources.itsmSnapshot.ticketCount === 1, 'ticketCount=1');
  assert(result.sources.fullcycleReport.loaded === true, 'fullcycleReport.loaded=true');
  assert(result.sources.fullcycleReport.status === 'pass', 'fullcycleReport.status=pass');

  const errors = validateCollectorSources(result.sources);
  assert(errors.length === 0, 'validateCollectorSources returns no errors');

  return result;
}

// ---------------------------------------------------------------------------
// Drill 3: mode_env_selection — COLLECTOR_MODE=api env var selects api mode
// ---------------------------------------------------------------------------

async function drillModeEnvSelection() {
  console.log('\n[Drill 3] mode_env_selection — env FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=api selects api mode');

  const mockReport = {
    status: 'pass',
    sources: {
      incidentAutomation: { loaded: false, timestamp: null, incidents: {}, incidentCount: 0 },
      itsmSnapshot: { loaded: false, timestamp: null, paging: [], tickets: [], pagingCount: 0, ticketCount: 0 },
      fullcycleReport: { loaded: false, timestamp: null, status: 'unknown', ownerCoveragePct: null, summary: {} },
    },
  };

  const result = await withMockServer(mockReport, async (apiBaseUrl) => {
    const origMode = process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE;
    const origUrl = process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL;
    process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE = 'api';
    process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL = apiBaseUrl;
    try {
      return await collectOperationalSources({});  // no explicit mode — read from env
    } finally {
      if (origMode === undefined) delete process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE;
      else process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE = origMode;
      if (origUrl === undefined) delete process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL;
      else process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL = origUrl;
    }
  });

  assert(result.collectorMode === 'api', 'collectorMode=api when env is set');
  assert(result.valid === true, 'validation passes');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n[${DRILL_NAME}] Starting...`);
  const ts = new Date().toISOString();

  const { mkdir } = await import('node:fs/promises');
  await mkdir(REPORT_DIR, { recursive: true });

  let errors = [];
  let contractReport = null;

  try { await drillApiUnreachable(); } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'api_unreachable', error: err.message }); }
  try { contractReport = await drillApiModeContract(); } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'api_mode_contract', error: err.message }); }
  try { await drillModeEnvSelection(); } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'mode_env_selection', error: err.message }); }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = {
    generatedAt: ts,
    drill: DRILL_NAME,
    status,
    errors,
    contract: {
      schema: 'fullcycle.observability.phase47.collector-api-mode.v1',
      apiModeImplemented: contractReport !== null,
      apiModeReturnsValidSources: contractReport?.valid === true,
    },
  };

  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);

  console.log(`\n[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (!status.startsWith('pass')) {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
  console.log(`[${DRILL_NAME}] All drills passed — api mode is operational`);
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
