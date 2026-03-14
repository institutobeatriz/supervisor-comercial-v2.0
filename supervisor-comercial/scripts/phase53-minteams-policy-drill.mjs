/**
 * Phase 53 — minTeams Policy Drill
 * Drills: minteams_zero_no_violation / minteams_one_fires /
 *         minteams_one_satisfied / regression_phase31_drill
 *
 * Formaliza a política de minTeams na gate do painel operacional.
 * Valida que FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0 dispensa
 * o requisito de times, e que =1 dispara backend_teams_insufficient
 * quando teams=0, mas passa quando teams>=1.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase53-minteams-policy-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase53-drill');
const PANEL_SCRIPT = path.resolve(__dirname, 'phase31-observability-panel-backend-integration.mjs');
const PHASE31_DRILL = path.resolve(__dirname, 'phase31-observability-panel-backend-integration-drill.mjs');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function makeSlaHistory(n = 5) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 60_000).toISOString(),
    environment: 'drill',
    status: 'pass',
    availabilityPct: 99.9,
    worstLatencyMs: 45,
  }));
}

async function runPanel(drillId, extraEnv) {
  const panelReportFile = path.resolve(REPORT_DIR, `panel-report-${drillId}.json`);
  const backendReportFile = path.resolve(REPORT_DIR, `backend-report-${drillId}.json`);
  const slaHistoryFile = path.resolve(REPORT_DIR, `sla-history-${drillId}.json`);

  // Provide required synthetic files
  await writeJson(backendReportFile, { status: 'pass', generatedAt: new Date().toISOString() });
  await writeJson(slaHistoryFile, { history: makeSlaHistory(5) });

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      // Isolate minTeams: disable other blocking requirements
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
      // Point to synthetic files
      FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE: panelReportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE: backendReportFile,
      FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: slaHistoryFile,
      FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE: path.resolve(REPORT_DIR, `panel-dashboard-${drillId}.html`),
      FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE: path.resolve(REPORT_DIR, `panel-audit-${drillId}.jsonl`),
      ...extraEnv,
    };

    const child = spawn('node', [PANEL_SCRIPT], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let exitCode = null;
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', async (code) => {
      exitCode = code;
      const report = await readJsonSafe(panelReportFile);
      resolve({ exitCode, report, panelReportFile });
    });
  });
}

// ---------------------------------------------------------------------------
// Drill 1: minteams_zero_no_violation
// ---------------------------------------------------------------------------
async function drillMinteamsZeroNoViolation() {
  console.log('\n[Drill 1] minteams_zero_no_violation — MIN_TEAMS=0 com 0 times: sem violação backend_teams_insufficient');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d1.json');
  await writeJson(storeFile, { teams: [], incidents: [], alerts: [] });

  const { report } = await runPanel('d1', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '0',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    !codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient NÃO dispara quando MIN_TEAMS=0 e teams=0',
    `violations=${JSON.stringify([...codes])}`,
  );
  console.log('  [INFO] decisão: MIN_TEAMS=0 => gate permissiva, sem exigência de times');
}

// ---------------------------------------------------------------------------
// Drill 2: minteams_one_fires
// ---------------------------------------------------------------------------
async function drillMinteamsOneFires() {
  console.log('\n[Drill 2] minteams_one_fires — MIN_TEAMS=1 com 0 times: backend_teams_insufficient dispara');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d2.json');
  await writeJson(storeFile, { teams: [], incidents: [], alerts: [] });

  const { report, exitCode } = await runPanel('d2', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '1',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient dispara quando MIN_TEAMS=1 e teams=0',
    `violations=${JSON.stringify([...codes])}`,
  );
  assert(exitCode !== 0, 'script exits non-zero com enforceTargets=true e teams_insufficient', `exitCode=${exitCode}`);
  console.log('  [INFO] gate é bloqueante quando ENFORCE_TARGETS=true e times insuficientes');
}

// ---------------------------------------------------------------------------
// Drill 3: minteams_one_satisfied
// ---------------------------------------------------------------------------
async function drillMinteamsOneSatisfied() {
  console.log('\n[Drill 3] minteams_one_satisfied — MIN_TEAMS=1 com 1 time: sem violação backend_teams_insufficient');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d3.json');
  await writeJson(storeFile, { teams: [{ id: 'team-alpha', name: 'Team Alpha' }], incidents: [], alerts: [] });

  const { report } = await runPanel('d3', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '1',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    !codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient NÃO dispara quando MIN_TEAMS=1 e teams=1',
    `violations=${JSON.stringify([...codes])}`,
  );
}

// ---------------------------------------------------------------------------
// Drill 4: regression_phase31_drill
// ---------------------------------------------------------------------------
async function drillRegressionPhase31() {
  console.log('\n[Drill 4] regression_phase31_drill — drill oficial do phase31 ainda passa');

  const { exitCode } = await new Promise((resolve) => {
    const child = spawn('node', [PHASE31_DRILL], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let exitCode = null;
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { exitCode = code; resolve({ exitCode }); });
  });

  assert(exitCode === 0, 'phase31 drill subprocess exits 0', `got=${exitCode}`);
}

const drills = [
  { name: 'minteams_zero_no_violation', run: drillMinteamsZeroNoViolation },
  { name: 'minteams_one_fires', run: drillMinteamsOneFires },
  { name: 'minteams_one_satisfied', run: drillMinteamsOneSatisfied },
  { name: 'regression_phase31_drill', run: drillRegressionPhase31 },
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
