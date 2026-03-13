# Phase 47 — Collector API Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `mode: 'api'` to the operational collector so it can fetch source data via HTTP from the project's own `/api/observability/connectors/backend/report` endpoint instead of reading local files.

**Architecture:** New `buildApiSources()` function inside `phase44-operational-collector.mjs` makes a `fetch()` call with 8-second timeout. The `collectOperationalSources()` dispatch switch gains a third branch. A mock HTTP server inside the drill enables deterministic CI testing without a real running API.

**Tech Stack:** Node.js built-in `fetch` (Node 18+), `node:http` for mock server in drill, existing `validateCollectorSources` for validation.

---

## Task 1: Write the failing drill (TDD first)

Create the drill **before** implementing the feature. The drill imports the api mode and asserts it works — this will initially fail because `mode: 'api'` doesn't exist yet.

**Files:**
- Create: `scripts/phase47-collector-api-mode-drill.mjs`

**Step 1: Create drill file**

```js
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

  // Minimal backend/report response (same shape as what the real endpoint returns)
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
```

**Step 2: Run drill to verify it FAILS (TDD red)**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase47-collector-api-mode-drill.mjs
```

Expected: **FAIL** — `api_unreachable` throws but the error message won't say "collector api", OR the drill itself fails because mode `api` hits the `else` branch (treated as `file` mode, doesn't throw). Either way status=fail.

**Step 3: Commit the failing drill**

```bash
git add scripts/phase47-collector-api-mode-drill.mjs
git commit -m "test(phase47): add failing drill for collector api mode (TDD red)"
```

---

## Task 2: Implement `api` mode in `phase44-operational-collector.mjs`

**Files:**
- Modify: `scripts/phase44-operational-collector.mjs`

**Step 1: Add `buildApiSources()` function after line ~222 (after `buildFileSources`)**

Insert this block between `buildFileSources` and the `// Main collector function` comment:

```js
// ---------------------------------------------------------------------------
// API-based sources (fetches from internal observability API endpoint)
// ---------------------------------------------------------------------------

async function buildApiSources({ apiBaseUrl, apiKey }) {
  const url = `${apiBaseUrl}/api/observability/connectors/backend/report`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'x-admin-key': apiKey || '',
        'x-observability-role': 'executive',
        'accept': 'application/json',
      },
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const msg = fetchErr?.name === 'AbortError'
      ? 'collector api timeout (8s)'
      : `collector api unreachable: ${fetchErr?.message || String(fetchErr)}`;
    throw new Error(msg);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`collector api returned status ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('collector api response not JSON');
  }

  const s = data?.sources || {};

  // Map API response structure → OPERATIONAL_COLLECTOR_INTERFACE sources shape
  const ia = s.incidentAutomation || {};
  const its = s.itsmSnapshot || {};
  const fcr = s.fullcycleReport || {};

  return {
    incidentAutomation: {
      key: 'incidentAutomation',
      label: 'Incident automation state (api)',
      loaded: Boolean(ia.loaded),
      timestamp: ia.timestamp || null,
      incidentCount: Number(ia.incidentCount ?? 0),
      incidents: ia.incidents && typeof ia.incidents === 'object' ? ia.incidents : {},
    },
    itsmSnapshot: {
      key: 'itsmSnapshot',
      label: 'ITSM snapshot (api)',
      loaded: Boolean(its.loaded),
      timestamp: its.timestamp || null,
      pagingCount: Number(its.pagingCount ?? (Array.isArray(its.paging) ? its.paging.length : 0)),
      ticketCount: Number(its.ticketCount ?? (Array.isArray(its.tickets) ? its.tickets.length : 0)),
      paging: Array.isArray(its.paging) ? its.paging : [],
      tickets: Array.isArray(its.tickets) ? its.tickets : [],
    },
    fullcycleReport: {
      key: 'fullcycleReport',
      label: 'Fullcycle report (api)',
      loaded: Boolean(fcr.loaded),
      timestamp: fcr.timestamp || null,
      status: String(fcr.status || 'unknown'),
      ownerCoveragePct: Number.isFinite(Number(fcr.ownerCoveragePct)) ? Number(fcr.ownerCoveragePct) : null,
      summary: fcr.summary && typeof fcr.summary === 'object' ? fcr.summary : {},
    },
  };
}
```

**Step 2: Update `collectOperationalSources()` — add `api` to the dispatch and env vars**

Find the current function signature block (around line 239) and replace it:

```js
export async function collectOperationalSources(options = {}) {
  const ts = options.ts || new Date().toISOString();
  const mode = options.mode || envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE', 'file');
  const automationStateFile = /* same as before */;
  const snapshotFile = /* same as before */;
  const fullcycleReportFile = /* same as before */;
  // phase47: api mode config
  const apiBaseUrl = options.apiBaseUrl || envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL', 'http://localhost:3000');
  const apiKey = options.apiKey || envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY', envString('ADMIN_API_KEY', ''));

  let sources;
  let collectorMode = mode;

  if (mode === 'api') {
    sources = await buildApiSources({ apiBaseUrl, apiKey });
    collectorMode = 'api';
  } else if (mode === 'synthetic') {
    sources = buildSyntheticSources(ts);
  } else {
    sources = await buildFileSources({ automationStateFile, snapshotFile, fullcycleReportFile });
    collectorMode = 'file';
  }

  const validationErrors = validateCollectorSources(sources);

  return {
    sources,
    mode: collectorMode,
    schema: OPERATIONAL_COLLECTOR_SCHEMA,
    version: OPERATIONAL_COLLECTOR_VERSION,
    collectorMode,
    interface: OPERATIONAL_COLLECTOR_INTERFACE,
    generatedAt: ts,
    validationErrors,
    valid: validationErrors.length === 0,
  };
}
```

> The key changes are: (1) add `apiBaseUrl` and `apiKey` resolution, (2) add `if (mode === 'api')` branch BEFORE the `synthetic` check.

**Step 3: Run drill to verify it PASSES (TDD green)**

```bash
node scripts/phase47-collector-api-mode-drill.mjs
```

Expected:
```
[Drill 1] api_unreachable — closed port must throw clear error
  [OK] collectOperationalSources throws when API unreachable
  [OK] error message includes "collector api"
[Drill 2] api_mode_contract — mock server returns valid report...
  [OK] collectorMode is api
  [OK] validation passes
  ... (all OK)
[Drill 3] mode_env_selection — env var selects api mode
  [OK] collectorMode=api when env is set
  [OK] validation passes

[phase47-collector-api-mode-drill] status=pass errors=0
```

**Step 4: Run phase44 drill to verify retrocompatibility**

```bash
node scripts/phase44-operational-collector-drill.mjs
```

Expected: last line `=== phase44-operational-collector-drill: PASS (3 passed, 0 failed) ===`

**Step 5: Run phase46 drill to verify no regression**

```bash
node scripts/phase46-collector-default-drill.mjs
```

Expected: `status=pass errors=0`

**Step 6: Commit**

```bash
git add scripts/phase44-operational-collector.mjs
git commit -m "feat(phase47): add api mode to operational collector"
```

---

## Task 3: Wire into package.json and standalone-export.json

**Files:**
- Modify: `package.json` — add `test:phase47` script
- Modify: `config/standalone-export.json` — add to `validateCommands`

**Step 1: Add to package.json**

In `package.json`, after the `test:phase46` line:
```json
"test:phase47": "node scripts/phase47-collector-api-mode-drill.mjs",
```

**Step 2: Add to standalone-export.json**

In `config/standalone-export.json`, after `"npm run test:phase46"`:
```json
"npm run test:phase47"
```

**Step 3: Verify both files parse as valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node -e "JSON.parse(require('fs').readFileSync('config/standalone-export.json','utf8')); console.log('standalone-export.json OK')"
```

Expected: both print `OK`

**Step 4: Run full drill suite**

```bash
node scripts/phase47-collector-api-mode-drill.mjs && node scripts/phase46-collector-default-drill.mjs && node scripts/phase44-operational-collector-drill.mjs
```

Expected: all pass

**Step 5: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "chore(phase47): add test:phase47 to package.json and standalone-export.json"
```

---

## Task 4: Sync to export-repo and push for CI

**Files:**
- Modify: `.export-repo/` (via standalone sync script)

**Step 1: Run standalone sync**

```bash
node scripts/phase37-standalone-sync.mjs
```

Expected: `[STANDALONE-SYNC] status=pass mode=apply copy=N delete=0 unchanged=M`

**Step 2: Stage and commit in export-repo**

```bash
cd .export-repo
git add scripts/phase44-operational-collector.mjs \
        scripts/phase47-collector-api-mode-drill.mjs \
        package.json \
        config/standalone-export.json
git commit -m "feat(observability): phase47 — collector api mode

Add mode=api to collectOperationalSources():
- buildApiSources() fetches GET /api/observability/connectors/backend/report
- 8s timeout with AbortController
- Clear error messages for unreachable/non-200/non-JSON
- New env vars: FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL, FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY
- Drill phase47: api_unreachable / api_mode_contract (mock HTTP server) / mode_env_selection
- test:phase47 added to package.json and standalone-export.json

Closes OPERATIONAL_COLLECTOR_INTERFACE integrationModes=['file','api','service'] contract.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

**Step 3: Push to canonical CI repo**

```bash
git push origin codex/phase44-operational-collector
```

**Step 4: Wait for CI run and verify green**

```bash
cd ..
gh run list --branch codex/phase44-operational-collector --limit 1
# Wait for in_progress run, then:
gh run watch <RUN_ID> --exit-status
```

Expected: `✓ quality-and-smoke` — conclusion: success

---

## Task 5: Update project state and create WIP commit

**Files:**
- Create: `docs/analise-projeto/58-fase-47-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Create evidence file `docs/analise-projeto/58-fase-47-validacao.md`**

Content minimum:
```markdown
# 58 - Fase 47 - Validacao

## Objetivo
Adicionar modo `api` ao coletor operacional.

## Data
2026-03-11

## Resultado
CONCLUIDA — drill local passa, CI verde.

## CI
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/10
- Ultimo run CI verde: <RUN_ID>

## O que foi alterado
- `scripts/phase44-operational-collector.mjs`: adicionado modo `api` + `buildApiSources()`
- `scripts/phase47-collector-api-mode-drill.mjs`: novo drill (3 cenários)
- `package.json`: `test:phase47` adicionado
- `config/standalone-export.json`: `npm run test:phase47` em `validateCommands`

## Drills validados
- api_unreachable: PASS
- api_mode_contract: PASS
- mode_env_selection: PASS
```

**Step 2: Add Phase 47 row to `10-memoria-execucao-fases.md`**

After the Phase 46 row:
```
| Fase 47 - Collector modo api | CONCLUIDA | 2026-03-11 | 2026-03-11 | `58-fase-47-validacao.md` | buildApiSources() com fetch + timeout 8s; drill api_unreachable/api_mode_contract/mode_env_selection passando; CI verde run <RUN_ID> |
```

**Step 3: Update HANDOFF.md**

- `Ultima fase concluida: Fase 47`
- `Proxima fase liberada: Fase 48`
- Update "O que foi concluido" and "Proximo passo"
- Update `Leitura minima` to reference `58-fase-47-validacao.md`

**Step 4: Update TODO_AI.md**

- `Ultima fase concluida: Fase 47`
- Mark phase47 items as `[x]`
- Remove "o coletor é um stub" from bugs/riscos (now has api mode)

**Step 5: Create WIP commit**

```bash
git add HANDOFF.md TODO_AI.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        docs/analise-projeto/58-fase-47-validacao.md
git commit -m "handoff(phase47): collector api mode — fetch do endpoint interno

Fecha o contrato OPERATIONAL_COLLECTOR_INTERFACE.integrationModes=['file','api','service'].
Drill phase47: 3 cenários passando.
CI remoto verde: run <RUN_ID>.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Arquivos | Commit |
|------|----------|--------|
| 1 | `phase47-collector-api-mode-drill.mjs` | `test(phase47): add failing drill (TDD red)` |
| 2 | `phase44-operational-collector.mjs` | `feat(phase47): add api mode to operational collector` |
| 3 | `package.json`, `standalone-export.json` | `chore(phase47): add test:phase47` |
| 4 | `.export-repo/` push | `feat(observability): phase47 — collector api mode` |
| 5 | `HANDOFF.md`, `TODO_AI.md`, memory, evidence | `handoff(phase47): collector api mode` |
