import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase31-observability-panel-backend-integration.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase31-drill');

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function assertStrictHtmlShell(html, { cssRef, jsRef, templateId, label }) {
  assert(html.includes(cssRef), `${label} should reference external css asset`);
  assert(html.includes(jsRef), `${label} should reference external js asset`);
  assert(html.includes(`id="${templateId}"`), `${label} should expose bootstrap template`);
  assert(!/<style[\s>]/i.test(html), `${label} should not contain inline style tags`);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${label} should not contain inline script tags`);
}

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const streamStateFile = path.resolve(DRILL_DIR, 'stream-state.json');
  const streamReportFile = path.resolve(DRILL_DIR, 'stream-report.json');
  const alertReportFile = path.resolve(DRILL_DIR, 'alert-report.json');
  const apiSlaHistoryFile = path.resolve(DRILL_DIR, 'api-sla-history.json');
  const backendStoreFile = path.resolve(DRILL_DIR, 'backend-store.json');
  const backendReportFile = path.resolve(DRILL_DIR, 'backend-report.json');
  const panelReportFile = path.resolve(DRILL_DIR, 'panel-report.json');
  const panelDashboardFile = path.resolve(DRILL_DIR, 'panel-dashboard.html');
  const panelAuditFile = path.resolve(DRILL_DIR, 'panel-audit.jsonl');
  const panelAssetsDir = path.resolve(DRILL_DIR, 'assets');

  await fs.rm(panelReportFile, { force: true });
  await fs.rm(panelDashboardFile, { force: true });
  await fs.rm(panelAuditFile, { force: true });
  await fs.rm(panelAssetsDir, { recursive: true, force: true });

  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();

  const commonEnv = {
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE: alertReportFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: apiSlaHistoryFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: backendStoreFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE: backendReportFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE: panelReportFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE: panelDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE: panelAuditFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE: 'http://127.0.0.1:3000',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '2',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS: '2',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN: '180',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN: '180',
    FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
  };

  await writeJson(streamStateFile, { generatedAt: iso(-60_000), status: 'pass', cursor: 22 });
  await writeJson(streamReportFile, { generatedAt: iso(-60_000), status: 'pass', summary: { cursor: 22 } });
  await writeJson(alertReportFile, { generatedAt: iso(-60_000), status: 'pass', summary: { activeIssues: 1 } });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: iso(-30_000),
    history: [
      { timestamp: iso(-120_000), environment: 'drill', status: 'pass', availabilityPct: 99.9, worstLatencyMs: 170, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: iso(-60_000), environment: 'drill', status: 'pass', availabilityPct: 99.7, worstLatencyMs: 240, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
      { timestamp: iso(-30_000), environment: 'drill', status: 'warn', availabilityPct: 99.4, worstLatencyMs: 380, observedPayloadAgeMinutes: 3, blockingViolations: 1 },
    ],
  });
  await writeJson(backendStoreFile, {
    version: 1,
    generatedAt: iso(-30_000),
    status: 'pass',
    teams: [
      { team: 'integrations', openIncidents: 1, criticalOpenIncidents: 1, activeAlerts: 0, criticalActiveAlerts: 0, channels: ['slack', 'webhook'] },
      { team: 'platform-api', openIncidents: 0, criticalOpenIncidents: 0, activeAlerts: 1, criticalActiveAlerts: 0, channels: ['slack'] },
    ],
    incidents: [
      {
        id: 'inc-drill-1',
        source: 'connectors_runtime',
        environment: 'drill',
        status: 'open',
        severity: 'critical',
        ownerTeam: 'integrations',
        routing: { team: 'integrations' },
        connectors: ['jira'],
        openedAt: iso(-35 * 60_000),
        startedAt: iso(-35 * 60_000),
        lastSeenAt: iso(-2 * 60_000),
        violationCount: 1,
      },
    ],
    alerts: [
      {
        key: 'api_sla::latency_above_target',
        source: 'api_sla',
        environment: 'drill',
        status: 'open',
        severity: 'warning',
        ownerTeam: 'platform-api',
        routing: { team: 'platform-api' },
        message: 'latency above target',
        dispatchAttemptCount: 1,
        lastSeenAt: iso(-2 * 60_000),
      },
    ],
  });
  await writeJson(backendReportFile, {
    generatedAt: iso(-30_000),
    status: 'pass',
    summary: { incidents: { open: 1, openCritical: 1 }, alerts: { active: 1, activeCritical: 0 }, teams: 2 },
  });

  const passRun = await runNode(SCRIPT, commonEnv);
  assert((passRun.status ?? 1) === 0, `phase31 pass run should exit 0 (stderr=${passRun.stderr})`);
  const passReport = await readJson(panelReportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  const passHtml = await fs.readFile(panelDashboardFile, 'utf-8');
  assert(passHtml.includes('Connect SSE'), 'panel html should expose SSE action');
  assert(passHtml.includes('for=\"team\"'), 'panel html should expose team filter');
  assert(!passHtml.includes('bootstrap'), 'panel html should not embed legacy bootstrap payload');
  assertStrictHtmlShell(passHtml, {
    cssRef: './assets/fullcycle-connectors-observability-ops-panel.css',
    jsRef: './assets/fullcycle-connectors-observability-ops-panel.js',
    templateId: 'phase31-panel-data',
    label: 'panel html',
  });
  const panelCssFile = path.resolve(panelAssetsDir, 'fullcycle-connectors-observability-ops-panel.css');
  const panelJsFile = path.resolve(panelAssetsDir, 'fullcycle-connectors-observability-ops-panel.js');
  assert(await fs.access(panelCssFile).then(() => true).catch(() => false), 'panel html should publish css asset');
  assert(await fs.access(panelJsFile).then(() => true).catch(() => false), 'panel html should publish js asset');
  const passJs = await fs.readFile(panelJsFile, 'utf-8');
  assert(passJs.includes('/api/observability/connectors/incidents/summary'), 'panel js should consume incidents summary endpoint');
  assert(passJs.includes('/api/observability/connectors/alerts/summary'), 'panel js should consume alerts summary endpoint');
  assert(passJs.includes('/api/observability/connectors/api-sla/summary'), 'panel js should consume api-sla summary endpoint');
  assert(passJs.includes('/api/observability/connectors/backend/report'), 'panel js should consume backend report endpoint for exec roles');

  await writeJson(backendStoreFile, {
    version: 1,
    generatedAt: iso(60_000),
    status: 'fail',
    teams: [{ team: 'integrations', openIncidents: 1, criticalOpenIncidents: 1, activeAlerts: 1, criticalActiveAlerts: 1, channels: ['slack'] }],
    incidents: [
      {
        id: 'inc-drill-2',
        source: 'connectors_runtime',
        environment: 'drill',
        status: 'open',
        severity: 'critical',
        ownerTeam: 'unassigned',
        routing: { team: 'unassigned' },
        connectors: ['servicenow'],
        openedAt: iso(-20 * 60_000),
        lastSeenAt: iso(30_000),
        violationCount: 2,
      },
    ],
    alerts: [
      {
        key: 'api_sla::availability_below_target',
        source: 'api_sla',
        environment: 'drill',
        status: 'open',
        severity: 'critical',
        ownerTeam: '',
        routing: { team: 'unassigned' },
        message: 'availability below target',
        dispatchAttemptCount: 2,
        lastSeenAt: iso(30_000),
      },
    ],
  });
  await writeJson(backendReportFile, {
    generatedAt: iso(60_000),
    status: 'fail',
    summary: { incidents: { open: 1, openCritical: 1 }, alerts: { active: 1, activeCritical: 1 }, teams: 1 },
  });

  const failRun = await runNode(SCRIPT, commonEnv);
  assert((failRun.status ?? 0) !== 0, 'phase31 fail run should exit non-zero');
  const failReport = await readJson(panelReportFile);
  const failCodes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(failCodes.has('backend_not_pass'), 'expected backend_not_pass');
  assert(failCodes.has('backend_teams_insufficient'), 'expected backend_teams_insufficient');
  assert(failCodes.has('team_routing_missing'), 'expected team_routing_missing');

  console.log('[OK] phase31 drill backend-first panel pass/fail validated');
  console.log(`[OK] phase31 drill report=${panelReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase31 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
