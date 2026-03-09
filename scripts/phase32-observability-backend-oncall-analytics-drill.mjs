import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase32-observability-backend-oncall-analytics.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase32-drill');

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
  const backendAnalyticsFile = path.resolve(DRILL_DIR, 'backend-analytics.json');
  const routeMatrixFile = path.resolve(DRILL_DIR, 'route-matrix.json');
  const rotationFile = path.resolve(DRILL_DIR, 'rotation.json');
  const calendarFile = path.resolve(DRILL_DIR, 'calendar.json');
  const missingRotationFile = path.resolve(DRILL_DIR, 'rotation-missing.json');
  const missingCalendarFile = path.resolve(DRILL_DIR, 'calendar-missing.json');

  for (const filePath of [
    backendStoreFile,
    backendReportFile,
    backendDashboardFile,
    backendAuditFile,
    backendAnalyticsFile,
    missingRotationFile,
    missingCalendarFile,
  ]) {
    await fs.rm(filePath, { force: true });
  }

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

  await writeJson(rotationFile, {
    timezone: 'America/Sao_Paulo',
    rules: [
      {
        id: 'weekday-integrations',
        days: [1, 2, 3, 4, 5],
        start: '08:00',
        end: '17:59',
        teams: ['integrations'],
        ownerByTier: {
          P1: 'integrations-p1',
          P2: 'integrations-p2',
          P3: 'integrations-p3',
        },
      },
      {
        id: 'default-fallback',
        days: [0, 1, 2, 3, 4, 5, 6],
        start: '00:00',
        end: '23:59',
        owner: 'shared-oncall',
      },
    ],
  });

  await writeJson(calendarFile, {
    timezone: 'America/Sao_Paulo',
    overrides: [
      {
        id: 'api-special-day',
        date: '2026-03-03',
        teams: ['platform-api'],
        tier: 'P2',
        owner: 'calendar-platform-api',
      },
    ],
    holidays: [],
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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE: backendAnalyticsFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE: routeMatrixFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE: rotationFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE: calendarFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES: '10',
  };

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-open-1',
    incidents: [
      {
        id: 'inc-open-1',
        status: 'open',
        startedAt: '2026-03-02T14:00:00-03:00',
        detectedAt: '2026-03-02T14:05:00-03:00',
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
        alertEvents: [{ timestamp: '2026-03-02T14:10:00-03:00', attempts: [{ target: 'slack', ok: true }] }],
      },
    ],
  });
  await writeJson(operationsReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    summary: { environment: 'drill' },
    postmortems: [],
  });
  await writeJson(alertReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
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
    generatedAt: '2026-03-03T10:05:00-03:00',
    lastDispatchAt: '2026-03-03T10:05:00-03:00',
    openIssueKeys: ['api_sla::latency_above_target'],
    lastIssueSentAt: { 'api_sla::latency_above_target': '2026-03-03T10:05:00-03:00' },
  });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    history: [
      { timestamp: '2026-03-03T09:50:00-03:00', environment: 'drill', status: 'pass', availabilityPct: 99.8, worstLatencyMs: 180, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: '2026-03-03T10:05:00-03:00', environment: 'drill', status: 'pass', availabilityPct: 99.6, worstLatencyMs: 250, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
    ],
  });
  await writeJson(streamStateFile, { generatedAt: '2026-03-03T10:05:00-03:00', status: 'pass', cursor: 12 });
  await writeJson(streamReportFile, { generatedAt: '2026-03-03T10:05:00-03:00', status: 'pass', summary: { cursor: 12 } });

  const passRun = await runNode(SCRIPT, commonEnv);
  assert((passRun.status ?? 1) === 0, `phase32 pass run should exit 0 (stderr=${passRun.stderr})`);

  const passStore = await readJson(backendStoreFile);
  const passReport = await readJson(backendReportFile);
  const passAnalytics = await readJson(backendAnalyticsFile);
  const passIncident = passStore.incidents.find((item) => item.id === 'inc-open-1');
  const passAlert = passStore.alerts.find((item) => item.key === 'api_sla::latency_above_target');

  assert(passStore?.version === 2, `expected backend store version 2, got ${passStore?.version}`);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert(passStore?.oncall?.rotationLoaded === true, 'expected rotation loaded in store');
  assert(passStore?.oncall?.calendarLoaded === true, 'expected calendar loaded in store');
  assert(passIncident?.owner === 'integrations-p1', `expected incident owner integrations-p1, got ${passIncident?.owner}`);
  assert(passIncident?.ownerSource === 'rotation', `expected incident ownerSource rotation, got ${passIncident?.ownerSource}`);
  assert(passIncident?.escalation?.breached === true, 'expected incident escalation breach');
  assert(passAlert?.owner === 'calendar-platform-api', `expected alert owner calendar-platform-api, got ${passAlert?.owner}`);
  assert(passAlert?.ownerSource === 'calendar_override', `expected alert ownerSource calendar_override, got ${passAlert?.ownerSource}`);
  assert(passAnalytics?.current?.ownerCoveragePct === 100, `expected owner coverage 100, got ${passAnalytics?.current?.ownerCoveragePct}`);
  assert(Array.isArray(passAnalytics?.entries) && passAnalytics.entries.length === 1, 'expected one analytics history point');
  assert(passReport?.ownership?.assignedOwners === 2, `expected two assigned owners, got ${passReport?.ownership?.assignedOwners}`);

  const failRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE: missingRotationFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE: missingCalendarFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_OWNER: '',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
  });
  assert((failRun.status ?? 0) !== 0, 'phase32 fail run should exit non-zero');

  const failStore = await readJson(backendStoreFile);
  const failReport = await readJson(backendReportFile);
  const failAnalytics = await readJson(backendAnalyticsFile);
  const failCodes = new Set((failReport?.violations || []).map((item) => item?.code));
  const failIncident = failStore.incidents.find((item) => item.id === 'inc-open-1');
  const failAlert = failStore.alerts.find((item) => item.key === 'api_sla::latency_above_target');

  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(failCodes.has('dynamic_owner_configuration_unavailable'), 'expected dynamic_owner_configuration_unavailable');
  assert(failCodes.has('dynamic_owner_unassigned'), 'expected dynamic_owner_unassigned');
  assert(failCodes.has('owner_coverage_below_target'), 'expected owner_coverage_below_target');
  assert(failStore?.summary?.ownerCoveragePct === 0, `expected owner coverage 0, got ${failStore?.summary?.ownerCoveragePct}`);
  assert(failIncident?.owner === null, `expected incident owner null, got ${failIncident?.owner}`);
  assert(failAlert?.owner === null, `expected alert owner null, got ${failAlert?.owner}`);
  assert(Array.isArray(failAnalytics?.entries) && failAnalytics.entries.length === 2, 'expected analytics history to retain second point');

  console.log('[OK] phase32 drill backend on-call analytics pass/fail validated');
  console.log(`[OK] phase32 drill report=${backendReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase32 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
