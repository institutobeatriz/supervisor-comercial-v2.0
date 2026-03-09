import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase39-observability-backend-operational-oncall.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase39-drill');

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
  const missingRotationFile = path.resolve(DRILL_DIR, 'rotation-missing.json');
  const missingCalendarFile = path.resolve(DRILL_DIR, 'calendar-missing.json');
  const automationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const fullcycleReportFile = path.resolve(DRILL_DIR, 'fullcycle-report.json');
  const missingAutomationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state-missing.json');
  const missingSnapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot-missing.json');

  for (const filePath of [
    backendStoreFile,
    backendReportFile,
    backendDashboardFile,
    backendAuditFile,
    backendAnalyticsFile,
    missingRotationFile,
    missingCalendarFile,
    missingAutomationStateFile,
    missingSnapshotFile,
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
      { source: 'connectors_runtime', code: 'latency_above_target', severity: 'warning', blocking: true, message: 'latency above target' },
    ],
    dispatch: {
      openedForDispatch: [{ source: 'connectors_runtime', code: 'latency_above_target', message: 'latency above target' }],
      resolvedForDispatch: [],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: '2026-03-03T10:05:00-03:00',
    lastDispatchAt: '2026-03-03T10:05:00-03:00',
    openIssueKeys: ['connectors_runtime::latency_above_target'],
    lastIssueSentAt: { 'connectors_runtime::latency_above_target': '2026-03-03T10:05:00-03:00' },
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
  await writeJson(automationStateFile, {
    version: 1,
    updatedAt: '2026-03-03T10:05:00-03:00',
    incidents: {
      'inc-open-1': {
        owner: 'ops-integrations-primary',
        ownerAssignedAt: '2026-03-03T10:01:00-03:00',
        updatedAt: '2026-03-03T10:05:00-03:00',
        paging: {
          externalId: 'PD-inc-open-1',
        },
      },
    },
  });
  await writeJson(snapshotFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    paging: [
      {
        externalId: 'PD-inc-open-1',
        incidentId: 'inc-open-1',
        status: 'triggered',
        owner: 'snapshot-integrations-primary',
      },
    ],
    tickets: [],
  });
  await writeJson(fullcycleReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    status: 'pass',
    summary: { ownerCoveragePct: 100 },
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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE: missingRotationFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE: missingCalendarFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES: '10',
  };

  const passRun = await runNode(SCRIPT, {
    ...commonEnv,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });
  assert((passRun.status ?? 1) === 0, `phase39 pass run should exit 0 (stderr=${passRun.stderr})`);

  const passStore = await readJson(backendStoreFile);
  const passReport = await readJson(backendReportFile);
  const passAnalytics = await readJson(backendAnalyticsFile);
  const passIncident = passStore.incidents.find((item) => item.id === 'inc-open-1');
  const passAlert = passStore.alerts.find((item) => item.key === 'connectors_runtime::latency_above_target');

  assert(passStore?.version === 3, `expected backend store version 3, got ${passStore?.version}`);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert(passStore?.oncall?.sourceMode === 'operational_state', `expected operational source mode, got ${passStore?.oncall?.sourceMode}`);
  assert(passStore?.oncall?.rotationLoaded === false, 'expected rotation disabled in official phase39 path');
  assert(passStore?.oncall?.calendarLoaded === false, 'expected calendar disabled in official phase39 path');
  assert(passStore?.oncall?.operationalStateLoaded === true, 'expected operational state loaded');
  assert(passStore?.oncall?.snapshotLoaded === true, 'expected snapshot loaded');
  assert(passIncident?.owner === 'snapshot-integrations-primary', `expected incident owner from snapshot, got ${passIncident?.owner}`);
  assert(passIncident?.ownerSource === 'operational_snapshot_paging', `expected incident ownerSource operational_snapshot_paging, got ${passIncident?.ownerSource}`);
  assert(passAlert?.owner === 'snapshot-integrations-primary', `expected alert owner from operational roster, got ${passAlert?.owner}`);
  assert(passAlert?.ownerSource === 'operational_roster', `expected alert ownerSource operational_roster, got ${passAlert?.ownerSource}`);
  assert(passAnalytics?.current?.ownerCoveragePct === 100, `expected owner coverage 100, got ${passAnalytics?.current?.ownerCoveragePct}`);
  assert(Array.isArray(passAnalytics?.entries) && passAnalytics.entries.length === 1, 'expected one analytics history point after pass run');
  assert(passReport?.ownership?.bySource?.operational_snapshot_paging === 1, 'expected one direct snapshot assignment in ownership');
  assert(passReport?.ownership?.bySource?.operational_roster === 1, 'expected one roster assignment in ownership');

  const failRun = await runNode(SCRIPT, {
    ...commonEnv,
    INCIDENT_AUTOMATION_STATE_FILE: missingAutomationStateFile,
    ITSM_SNAPSHOT_FILE: missingSnapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });
  assert((failRun.status ?? 0) !== 0, 'phase39 fail run should exit non-zero');

  const failReport = await readJson(backendReportFile);
  const failAnalytics = await readJson(backendAnalyticsFile);
  const failCodes = new Set((failReport?.violations || []).map((item) => item?.code));

  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(failCodes.has('operational_oncall_source_unavailable'), 'expected operational_oncall_source_unavailable');
  assert(failCodes.has('operational_snapshot_unavailable'), 'expected operational_snapshot_unavailable');
  assert(failCodes.has('operational_roster_unavailable'), 'expected operational_roster_unavailable');
  assert(failCodes.has('operational_owner_unassigned'), 'expected operational_owner_unassigned');
  assert(Array.isArray(failAnalytics?.entries) && failAnalytics.entries.length === 2, 'expected analytics history to retain second point');

  console.log('[OK] phase39 drill operational on-call pass/fail validated');
  console.log(`[OK] phase39 drill report=${backendReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase39 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
