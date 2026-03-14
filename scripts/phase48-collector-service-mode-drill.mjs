/**
 * Phase 48 — Collector Service Mode Drill
 * Drills: service_cache_hit / service_cache_miss / service_stale_refresh / service_env_selection
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { collectOperationalSources } from './phase44-operational-collector.mjs';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const DRILL_NAME = 'phase48-collector-service-mode-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase48-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

// ---------------------------------------------------------------------------
// Mock HTTP server helper (same pattern as phase47)
// ---------------------------------------------------------------------------

function withMockServer(responseBody, callback) {
  return new Promise((resolve, reject) => {
    let requestCount = 0;
    const server = http.createServer((req, res) => {
      requestCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        const result = await callback(`http://127.0.0.1:${port}`, () => requestCount);
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

const MOCK_REPORT = {
  status: 'pass',
  sources: {
    incidentAutomation: {
      loaded: true,
      timestamp: '2026-03-12T10:00:00.000Z',
      incidents: { 'INC-001': { owner: 'alice', ownerAssignedAt: '2026-03-12T09:00:00Z', ownerTimezone: 'UTC', updatedAt: '2026-03-12T09:00:00Z', paging: { externalId: 'PAGE-001' }, ticket: { externalId: 'TKT-001' } } },
      incidentCount: 1,
    },
    itsmSnapshot: {
      loaded: true,
      timestamp: '2026-03-12T10:00:00.000Z',
      paging: [{ externalId: 'PAGE-001', incidentId: 'INC-001', status: 'open', owner: 'alice', raw: {} }],
      tickets: [{ externalId: 'TKT-001', incidentId: 'INC-001', status: 'open', owner: 'alice', raw: {} }],
      pagingCount: 1,
      ticketCount: 1,
    },
    fullcycleReport: {
      loaded: true,
      timestamp: '2026-03-12T10:00:00.000Z',
      status: 'pass',
      ownerCoveragePct: 100,
      summary: { ownerCoveragePct: 100 },
    },
  },
};

// ---------------------------------------------------------------------------
// Drill 1: service_cache_hit — 2nd call must NOT hit the server again
// ---------------------------------------------------------------------------

async function drillServiceCacheHit() {
  console.log('\n[Drill 1] service_cache_hit — 2nd call uses cache (server called only once)');

  await withMockServer(MOCK_REPORT, async (apiBaseUrl, getRequestCount) => {
    // First call — fetches from server
    const r1 = await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 60000 });
    assert(r1.collectorMode === 'service', 'r1.collectorMode=service');
    assert(r1.valid === true, 'r1 valid');
    assert(getRequestCount() === 1, 'server received 1 request after first call', `got ${getRequestCount()}`);

    // Second call — must use cache
    const r2 = await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 60000 });
    assert(r2.collectorMode === 'service', 'r2.collectorMode=service');
    assert(r2.valid === true, 'r2 valid');
    assert(getRequestCount() === 1, 'server still received only 1 request after second call', `got ${getRequestCount()}`);
  });
}

// ---------------------------------------------------------------------------
// Drill 2: service_cache_miss — TTL=0 forces fetch on every call
// ---------------------------------------------------------------------------

async function drillServiceCacheMiss() {
  console.log('\n[Drill 2] service_cache_miss — TTL=0 forces fresh fetch every call');

  await withMockServer(MOCK_REPORT, async (apiBaseUrl, getRequestCount) => {
    await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 0 });
    assert(getRequestCount() === 1, '1st call: 1 request', `got ${getRequestCount()}`);

    await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 0 });
    assert(getRequestCount() === 2, '2nd call: 2 requests total (no cache)', `got ${getRequestCount()}`);
  });
}

// ---------------------------------------------------------------------------
// Drill 3: service_stale_refresh — stale cache triggers fresh fetch
// ---------------------------------------------------------------------------

async function drillServiceStaleRefresh() {
  console.log('\n[Drill 3] service_stale_refresh — stale cache (TTL=1ms) triggers refresh');

  await withMockServer(MOCK_REPORT, async (apiBaseUrl, getRequestCount) => {
    // First call — populates cache
    await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 1 });
    assert(getRequestCount() === 1, '1st call fetches once', `got ${getRequestCount()}`);

    // Wait 5ms so TTL expires
    await new Promise(resolve => setTimeout(resolve, 5));

    // Second call — cache is stale, must refresh
    await collectOperationalSources({ mode: 'service', apiBaseUrl, apiKey: 'test', serviceTtlMs: 1 });
    assert(getRequestCount() === 2, '2nd call after stale fetches again', `got ${getRequestCount()}`);
  });
}

// ---------------------------------------------------------------------------
// Drill 4: service_env_selection — env var selects service mode
// ---------------------------------------------------------------------------

async function drillServiceEnvSelection() {
  console.log('\n[Drill 4] service_env_selection — FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=service');

  await withMockServer(MOCK_REPORT, async (apiBaseUrl) => {
    const origMode = process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE;
    const origUrl  = process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL;
    process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE = 'service';
    process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL = apiBaseUrl;
    try {
      const result = await collectOperationalSources({});  // no explicit mode
      assert(result.collectorMode === 'service', 'collectorMode=service from env');
      assert(result.valid === true, 'validation passes');
    } finally {
      if (origMode === undefined) delete process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE;
      else process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE = origMode;
      if (origUrl === undefined) delete process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL;
      else process.env.FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL = origUrl;
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n[${DRILL_NAME}] Starting...`);
  const ts = new Date().toISOString();

  const { mkdir } = await import('node:fs/promises');
  await mkdir(REPORT_DIR, { recursive: true });

  const errors = [];

  try { await drillServiceCacheHit();      } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'service_cache_hit',      error: err.message }); }
  try { await drillServiceCacheMiss();     } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'service_cache_miss',     error: err.message }); }
  try { await drillServiceStaleRefresh();  } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'service_stale_refresh',  error: err.message }); }
  try { await drillServiceEnvSelection();  } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'service_env_selection',  error: err.message }); }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = {
    generatedAt: ts,
    drill: DRILL_NAME,
    status,
    errors,
    contract: {
      schema: 'fullcycle.observability.phase48.collector-service-mode.v1',
      serviceModeImplemented: errors.length === 0,
    },
  };

  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);
  console.log(`\n[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (status !== 'pass') {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
  console.log(`[${DRILL_NAME}] All drills passed — service mode is operational`);
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
