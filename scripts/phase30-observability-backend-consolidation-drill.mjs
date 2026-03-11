import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase30-observability-backend-consolidation.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase30-drill');

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
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

  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const operationsReportFile = path.resolve(DRILL_DIR, 'operations-report.json');
  const alertReportFile = path.resolve(DRILL_DIR, 'alert-report.json');
  const alertStateFile = path.resolve(DRILL_DIR, 'alert-state.json');
  const apiSlaHistoryFile = path.resolve(DRILL_DIR, 'api-sla-history.json');
  const streamStateFile = path.resolve(DRILL_DIR, 'stream-state.json');
  const streamReportFile = path.resolve(DRILL_DIR, 'stream-report.json');
  const backendStoreFile = path.resolve(DRILL_DIR, 'backend-store.json');
  const backendReportFile = path.resolve(DRILL_DIR, 'backend-report.json');
  const backendDashboardFile = path.resolve(DRILL_DIR, 'backend-dashboard.md');
  const backendAuditFile = path.resolve(DRILL_DIR, 'backend-audit.jsonl');
  const routeMatrixFile = path.resolve(DRILL_DIR, 'route-matrix.json');

  await fs.rm(backendStoreFile, { force: true });
  await fs.rm(backendReportFile, { force: true });
  await fs.rm(backendDashboardFile, { force: true });
  await fs.rm(backendAuditFile, { force: true });

  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();

  await writeJson(routeMatrixFile, {
    version: 1,
    defaultTeam: 'comercial-ops',
    severity: {
      critical: { team: 'platform-oncall', channels: ['paging', 'itsm'], escalateAfterMinutes: 10 },
      warning: { team: 'comercial-ops', channels: ['slack'], escalateAfterMinutes: 30 },
      info: { team: 'comercial-ops', channels: ['dashboard'], escalateAfterMinutes: 120 },
    },
    sources: {
      api_sla: { team: 'platform-api', channels: ['slack', 'webhook'], escalateAfterMinutes: 15 },
      connectors_runtime: { team: 'integrations', channels: ['slack', 'webhook'], escalateAfterMinutes: 20 },
    },
  });

  const commonEnv = {
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: operationsReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE: alertReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE: alertStateFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: apiSlaHistoryFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: backendStoreFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE: backendReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE: backendDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE: backendAuditFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE: routeMatrixFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS: '1',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS: '0',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS: 'true',
  };

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-open-1',
    incidents: [
      {
        id: 'inc-open-1',
        status: 'open',
        startedAt: iso(-45 * 60_000),
        detectedAt: iso(-44 * 60_000),
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
        alertEvents: [{ timestamp: iso(-40 * 60_000), attempts: [{ target: 'slack', ok: true }] }],
      },
    ],
  });
  await writeJson(operationsReportFile, {
    generatedAt: iso(-5 * 60_000),
    summary: { environment: 'drill' },
    postmortems: [],
  });
  await writeJson(alertReportFile, {
    generatedAt: iso(-2 * 60_000),
    status: 'pass',
    violations: [
      { source: 'api_sla', code: 'latency_above_target', severity: 'warning', blocking: true, message: 'latency above target' },
    ],
    dispatch: {
      openedForDispatch: [{ source: 'api_sla', code: 'latency_above_target', message: 'latency above target' }],
      resolvedForDispatch: [],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: iso(-2 * 60_000),
    lastDispatchAt: iso(-2 * 60_000),
    openIssueKeys: ['api_sla::latency_above_target'],
    lastIssueSentAt: { 'api_sla::latency_above_target': iso(-2 * 60_000) },
  });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: iso(-2 * 60_000),
    history: [
      { timestamp: iso(-12 * 60_000), environment: 'drill', status: 'pass', availabilityPct: 99.8, worstLatencyMs: 180, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: iso(-2 * 60_000), environment: 'drill', status: 'pass', availabilityPct: 99.6, worstLatencyMs: 250, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
    ],
  });
  await writeJson(streamStateFile, { generatedAt: iso(-2 * 60_000), status: 'pass', cursor: 12 });
  await writeJson(streamReportFile, { generatedAt: iso(-2 * 60_000), status: 'pass', summary: { cursor: 12 } });

  const passRun = await runNode(SCRIPT, commonEnv);
  assert((passRun.status ?? 1) === 0, `phase30 pass run should exit 0 (stderr=${passRun.stderr})`);
  const passStore = await readJson(backendStoreFile);
  const passReport = await readJson(backendReportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert(Array.isArray(passStore?.incidents) && passStore.incidents.length === 1, 'expected one incident in backend store');
  assert(Array.isArray(passStore?.alerts) && passStore.alerts.length === 1, 'expected one alert in backend store');
  assert(passStore.incidents[0]?.ownerTeam === 'integrations', `expected incident team integrations, got ${passStore.incidents[0]?.ownerTeam}`);
  assert(passStore.alerts[0]?.ownerTeam === 'platform-api', `expected alert team platform-api, got ${passStore.alerts[0]?.ownerTeam}`);
  assert(passStore.alerts[0]?.dispatchAttemptCount === 1, 'expected dispatch history recorded for alert');

  await writeJson(alertReportFile, {
    generatedAt: iso(1 * 60_000),
    status: 'pass',
    violations: [],
    dispatch: {
      openedForDispatch: [],
      resolvedForDispatch: ['api_sla::latency_above_target'],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: iso(1 * 60_000),
    lastDispatchAt: iso(1 * 60_000),
    openIssueKeys: [],
    lastIssueSentAt: { 'api_sla::latency_above_target': iso(1 * 60_000) },
  });

  const resolveRun = await runNode(SCRIPT, commonEnv);
  assert((resolveRun.status ?? 1) === 0, `phase30 resolution run should exit 0 (stderr=${resolveRun.stderr})`);
  const resolvedStore = await readJson(backendStoreFile);
  const resolvedAlert = resolvedStore.alerts.find((item) => item.key === 'api_sla::latency_above_target');
  assert(resolvedAlert?.status === 'resolved', `expected alert resolved, got ${resolvedAlert?.status}`);
  assert(resolvedAlert?.dispatchAttemptCount === 2, `expected second dispatch recorded, got ${resolvedAlert?.dispatchAttemptCount}`);

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-open-2',
    incidents: [
      {
        id: 'inc-open-1',
        status: 'open',
        startedAt: iso(-45 * 60_000),
        detectedAt: iso(-44 * 60_000),
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
        alertEvents: [],
      },
      {
        id: 'inc-open-2',
        status: 'open',
        startedAt: iso(-20 * 60_000),
        detectedAt: iso(-19 * 60_000),
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'servicenow', code: 'http_error_rate', blocking: true, message: 'http errors above target' }],
        alertEvents: [],
      },
    ],
  });
  await writeJson(alertReportFile, {
    generatedAt: iso(2 * 60_000),
    status: 'fail',
    violations: [
      { source: 'api_sla', code: 'availability_below_target', severity: 'critical', blocking: true, message: 'availability below target' },
    ],
    dispatch: {
      openedForDispatch: [{ source: 'api_sla', code: 'availability_below_target', message: 'availability below target' }],
      resolvedForDispatch: [],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: iso(2 * 60_000),
    lastDispatchAt: iso(2 * 60_000),
    openIssueKeys: ['api_sla::availability_below_target'],
    lastIssueSentAt: { 'api_sla::availability_below_target': iso(2 * 60_000) },
  });

  const failRun = await runNode(SCRIPT, commonEnv);
  assert((failRun.status ?? 0) !== 0, 'phase30 fail run should exit non-zero');
  const failReport = await readJson(backendReportFile);
  const failCodes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(failCodes.has('open_critical_incidents_above_target'), 'expected open_critical_incidents_above_target');
  assert(failCodes.has('active_critical_alerts_above_target'), 'expected active_critical_alerts_above_target');

  console.log('[OK] phase30 drill backend consolidation pass/fail validated');
  console.log(`[OK] phase30 drill report=${backendReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase30 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
