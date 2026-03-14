# Phase 48 — Collector Service Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `service` mode (lazy polling with in-memory cache, TTL default 300s) to `phase44-operational-collector.mjs`, closing the `OPERATIONAL_COLLECTOR_INTERFACE` contract.

**Architecture:** A module-level singleton `_serviceCache = { sources, fetchedAt }` stores the last successful fetch. `buildServiceSources()` checks cache age against TTL and only calls `buildApiSources()` when stale. No background timers — refresh is lazy (on-demand), so CI processes exit cleanly.

**Tech Stack:** Node.js ESM, native `fetch`, built-in `node:http` (mock server in drills)

**Design doc:** `docs/plans/2026-03-12-phase48-collector-service-mode-design.md`

---

## Task 1: TDD Red — write failing drills

**Files:**
- Create: `scripts/phase48-collector-service-mode-drill.mjs`

**Step 1: Create the drill file**

Create `scripts/phase48-collector-service-mode-drill.mjs` with the following content:

```js
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
```

**Step 2: Run the drill to confirm it fails (TDD red)**

```bash
cd "C:\Users\user\.openclaw\workspace\supervisor-comercial\.claude\worktrees\epic-sanderson\supervisor-comercial"
node scripts/phase48-collector-service-mode-drill.mjs
```

Expected: all 4 drills fail because `service` mode is not implemented yet. Process exits with code 1.

**Step 3: Commit the failing drill**

```bash
git add scripts/phase48-collector-service-mode-drill.mjs
git commit -m "test(phase48): add failing drill for collector service mode (TDD red)"
```

---

## Task 2: Implement `service` mode in `phase44-operational-collector.mjs`

**Files:**
- Modify: `scripts/phase44-operational-collector.mjs`

**Step 1: Add `_serviceCache` singleton and `buildServiceSources()` after `buildApiSources` (around line 265)**

Insert the following block between the closing `}` of `mapApiSourcesToCollectorFormat` and the `// Main collector function` comment:

```js
// ---------------------------------------------------------------------------
// Service-based sources (lazy polling with in-memory cache)
// ---------------------------------------------------------------------------

const _serviceCache = { sources: null, fetchedAt: null };

async function buildServiceSources({ apiBaseUrl, apiKey, ttlMs }) {
  const now = Date.now();
  const age = _serviceCache.fetchedAt !== null ? now - _serviceCache.fetchedAt : Infinity;

  if (_serviceCache.sources !== null && age < ttlMs) {
    return _serviceCache.sources; // cache hit
  }

  // cache miss or stale — fetch fresh
  const fresh = await buildApiSources({ apiBaseUrl, apiKey });
  _serviceCache.sources = fresh;
  _serviceCache.fetchedAt = now;
  return fresh;
}
```

**Step 2: Update JSDoc for `collectOperationalSources`**

Change the `@param` block to include the new option:

```js
/**
 * Collect operational sources respecting OPERATIONAL_COLLECTOR_INTERFACE.
 *
 * @param {object} options
 * @param {string} [options.mode='file']        - 'file' | 'synthetic' | 'api' | 'service'
 * @param {string} [options.apiBaseUrl]         - base URL for api/service mode
 * @param {string} [options.apiKey]             - API key for api/service mode
 * @param {number} [options.serviceTtlMs]       - cache TTL for service mode (default 300000)
 * @param {string} [options.automationStateFile]
 * @param {string} [options.snapshotFile]
 * @param {string} [options.fullcycleReportFile]
 * @param {string} [options.ts]
 * @returns {{ sources, mode, schema, version, collectorMode, validationErrors }}
 */
```

**Step 3: Add `serviceTtlMs` resolution and `service` branch in `collectOperationalSources()`**

In the function body, after the existing `apiKey` resolution (around the line `envString('ADMIN_API_KEY', '')`), add:

```js
  const serviceTtlMs =
    typeof options.serviceTtlMs === 'number'
      ? options.serviceTtlMs
      : Number(envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_SERVICE_TTL_MS', '300000'));
```

Then in the mode dispatch block, add the `service` branch **before** the existing `if (mode === 'api')`:

```js
  if (mode === 'service') {
    sources = await buildServiceSources({ apiBaseUrl, apiKey, ttlMs: serviceTtlMs });
    collectorMode = 'service';
  } else if (mode === 'api') {
    sources = await buildApiSources({ apiBaseUrl, apiKey });
    collectorMode = 'api';
  } else if (mode === 'synthetic') {
    sources = buildSyntheticSources(ts);
  } else {
    sources = await buildFileSources({ automationStateFile, snapshotFile, fullcycleReportFile });
    collectorMode = 'file';
  }
```

**Step 4: Run the drill to confirm it passes (TDD green)**

```bash
node scripts/phase48-collector-service-mode-drill.mjs
```

Expected output:
```
[phase48-collector-service-mode-drill] status=pass errors=0
[phase48-collector-service-mode-drill] All drills passed — service mode is operational
```

**Step 5: Verify no regression on phase44, phase47 drills**

```bash
node scripts/phase44-operational-collector-drill.mjs
node scripts/phase47-collector-api-mode-drill.mjs
```

Both must show `PASS` / `status=pass errors=0`.

**Step 6: Commit the implementation**

```bash
git add scripts/phase44-operational-collector.mjs
git commit -m "feat(phase48): add service mode to operational collector"
```

---

## Task 3: Wire `test:phase48` into package.json and standalone-export.json

**Files:**
- Modify: `package.json`
- Modify: `config/standalone-export.json`

**Step 1: Add `test:phase48` to `package.json` scripts**

In `package.json`, after the `"test:phase47"` line, add:

```json
"test:phase48": "node scripts/phase48-collector-service-mode-drill.mjs",
```

**Step 2: Add `npm run test:phase48` to `config/standalone-export.json`**

In `config/standalone-export.json`, after the `"npm run test:phase47"` entry in `validateCommands`, add:

```json
"npm run test:phase48"
```

**Step 3: Verify the script runs via npm**

```bash
node scripts/phase48-collector-service-mode-drill.mjs
```

(npm run resolves to the same node call; direct invocation confirms the path is correct.)

**Step 4: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "feat(phase48): wire test:phase48 to package.json and standalone-export"
```

---

## Task 4: Sync to export-repo, push, verify CI green

**Step 1: Run standalone sync**

```bash
node scripts/phase37-standalone-sync.mjs
```

Expected: `status=pass mode=apply copy=N delete=0`

**Step 2: Check export-repo status**

```bash
cd .export-repo
git status --short
```

Confirm the following are in the diff:
- `scripts/phase44-operational-collector.mjs` (M)
- `scripts/phase48-collector-service-mode-drill.mjs` (new ??)
- `package.json` (M)
- `config/standalone-export.json` (M)

**Step 3: Stage and commit export-repo**

```bash
git add -A
git commit -m "handoff(phase48): collector service mode — lazy polling cache + drill + CI wire"
```

**Step 4: Push**

```bash
git push
```

**Step 5: Monitor CI**

```bash
cd ..
gh run list --branch codex/phase44-operational-collector --limit 3
```

Wait for the new run to appear as `in_progress`, then:

```bash
gh run watch <RUN_ID> --exit-status
```

Expected: `quality-and-smoke` → `success`.

---

## Task 5: Update project state

**Files:**
- Create: `docs/analise-projeto/59-fase-48-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Create evidence file**

Create `docs/analise-projeto/59-fase-48-validacao.md` documenting:
- Objective of Phase 48
- What was implemented (`_serviceCache`, `buildServiceSources()`, `service` branch)
- 4 drills and their results
- Regression check (phase44, phase47 drills)
- CI run ID and conclusion
- Files changed

**Step 2: Update memory table**

In `docs/analise-projeto/10-memoria-execucao-fases.md`, add a new row after the Phase 47 row:

```
| Fase 48 - Modo service no coletor operacional | CONCLUIDA | 2026-03-12 | 2026-03-12 | `59-fase-48-validacao.md` | _serviceCache singleton; buildServiceSources() lazy poll (TTL 300s); 4 drills (cache_hit/cache_miss/stale_refresh/env_selection) passando; CI verde run <ID> |
```

**Step 3: Update HANDOFF.md**

- `Ultima fase concluida: Fase 48`
- `Proxima fase liberada: Fase 49 (a definir)`
- List changed files
- Update "O que esta funcionando" section
- Update evidence reference to `59-fase-48-validacao.md`

**Step 4: Update TODO_AI.md**

- Mark Phase 48 todos as `[x]`
- Add Phase 49 as next open item
- Update `Estado da fila`

**Step 5: Create WIP commit**

```bash
git add docs/analise-projeto/59-fase-48-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md \
        TODO_AI.md
git commit -m "handoff(phase48): collector service mode completed — evidence + memory + handoff"
```
