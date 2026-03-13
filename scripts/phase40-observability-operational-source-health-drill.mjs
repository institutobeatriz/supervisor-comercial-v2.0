import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase40-observability-operational-source-health.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase40-drill');

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - (minutes * 60_000)).toISOString();
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

async function resetFiles(filePaths) {
  for (const filePath of filePaths) {
    await fs.rm(filePath, { force: true });
  }
}

async function writeBackendFixtures({
  incidentsFile,
  operationsReportFile,
  alertReportFile,
  alertStateFile,
  apiSlaHistoryFile,
  streamStateFile,
  streamReportFile,
  routeMatrixFile,
  automationStateFile,
  snapshotFile,
  fullcycleReportFile,
  activeRecords,
  freshnessProfile,
}) {
  const recent = freshnessProfile === 'healthy';
  const stateTimestamp = recent ? isoMinutesAgo(3) : isoMinutesAgo(180);
  const snapshotTimestamp = recent ? isoMinutesAgo(2) : isoMinutesAgo(200);
  const fullcycleTimestamp = recent ? isoMinutesAgo(5) : isoMinutesAgo(220);

  await writeJson(routeMatrixFile, {
    version: 1,
    defaultTeam: 'comercial-ops',
    severity: {
      critical: { team: 'platform-oncall', channels: ['paging', 'itsm'], escalateAfterMinutes: 10 },
      warning: { team: 'comercial-ops', channels: ['slack'], escalateAfterMinutes: 30 },
      info: { team: 'comercial-ops', channels: ['dashboard'], escalateAfterMinutes: 120 },
    },
    sources: {
      connectors_runtime: { team: 'integrations', channels: ['slack', 'webhook'], escalateAfterMinutes: 20 },
    },
  });

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: activeRecords ? 'inc-open-1' : null,
    incidents: activeRecords
      ? [
          {
            id: 'inc-open-1',
            status: 'open',
            startedAt: isoMinutesAgo(90),
            detectedAt: isoMinutesAgo(85),
            severity: 'critical',
            maxSeverity: 'critical',
            violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
            alertEvents: [{ timestamp: isoMinutesAgo(60), attempts: [{ target: 'slack', ok: true }] }],
          },
        ]
      : [],
  });
  await writeJson(operationsReportFile, {
    generatedAt: isoMinutesAgo(4),
    summary: { environment: 'drill' },
    postmortems: [],
  });
  await writeJson(alertReportFile, {
    generatedAt: isoMinutesAgo(4),
    status: 'pass',
    violations: activeRecords
      ? [{ source: 'connectors_runtime', code: 'latency_above_target', severity: 'warning', blocking: true, message: 'latency above target' }]
      : [],
    dispatch: {
      openedForDispatch: activeRecords ? [{ source: 'connectors_runtime', code: 'latency_above_target', message: 'latency above target' }] : [],
      resolvedForDispatch: [],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: isoMinutesAgo(4),
    lastDispatchAt: isoMinutesAgo(4),
    openIssueKeys: activeRecords ? ['connectors_runtime::latency_above_target'] : [],
    lastIssueSentAt: activeRecords ? { 'connectors_runtime::latency_above_target': isoMinutesAgo(4) } : {},
  });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: isoMinutesAgo(4),
    history: [
      { timestamp: isoMinutesAgo(20), environment: 'drill', status: 'pass', availabilityPct: 99.8, worstLatencyMs: 180, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: isoMinutesAgo(4), environment: 'drill', status: 'pass', availabilityPct: 99.6, worstLatencyMs: 250, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
    ],
  });
  await writeJson(streamStateFile, { generatedAt: isoMinutesAgo(4), status: 'pass', cursor: 12 });
  await writeJson(streamReportFile, { generatedAt: isoMinutesAgo(4), status: 'pass', summary: { cursor: 12 } });

  if (freshnessProfile !== 'missing') {
    await writeJson(automationStateFile, {
      version: 1,
      updatedAt: stateTimestamp,
      incidents: activeRecords
        ? {
            'inc-open-1': {
              owner: 'ops-integrations-primary',
              ownerAssignedAt: isoMinutesAgo(10),
              updatedAt: stateTimestamp,
              paging: {
                externalId: 'PD-inc-open-1',
              },
            },
          }
        : {},
    });

    await writeJson(snapshotFile, {
      generatedAt: snapshotTimestamp,
      paging: activeRecords
        ? [
            {
              externalId: 'PD-inc-open-1',
              incidentId: 'inc-open-1',
              status: 'triggered',
              owner: 'snapshot-integrations-primary',
            },
          ]
        : [],
      tickets: [],
    });

    await writeJson(fullcycleReportFile, {
      generatedAt: fullcycleTimestamp,
      status: 'pass',
      summary: { ownerCoveragePct: 100 },
    });
    return;
  }

  await resetFiles([automationStateFile, snapshotFile, fullcycleReportFile]);
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
  const contractFile = path.resolve(DRILL_DIR, 'operational-provider.json');
  const routeMatrixFile = path.resolve(DRILL_DIR, 'route-matrix.json');
  const missingRotationFile = path.resolve(DRILL_DIR, 'rotation-missing.json');
  const missingCalendarFile = path.resolve(DRILL_DIR, 'calendar-missing.json');
  const automationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const fullcycleReportFile = path.resolve(DRILL_DIR, 'fullcycle-report.json');

  await resetFiles([
    backendStoreFile,
    backendReportFile,
    backendDashboardFile,
    backendAuditFile,
    backendAnalyticsFile,
    contractFile,
    missingRotationFile,
    missingCalendarFile,
    automationStateFile,
    snapshotFile,
    fullcycleReportFile,
  ]);

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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE: contractFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE: routeMatrixFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE: missingRotationFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE: missingCalendarFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_MAX_AGE_MIN: '30',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_MAX_AGE_MIN: '30',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_MAX_AGE_MIN: '60',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: 'materialized_contract',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES: '10',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: automationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  };

  await writeBackendFixtures({
    incidentsFile,
    operationsReportFile,
    alertReportFile,
    alertStateFile,
    apiSlaHistoryFile,
    streamStateFile,
    streamReportFile,
    routeMatrixFile,
    automationStateFile,
    snapshotFile,
    fullcycleReportFile,
    activeRecords: true,
    freshnessProfile: 'healthy',
  });

  const healthyRun = await runNode(SCRIPT, commonEnv);
  assert((healthyRun.status ?? 1) === 0, `phase40 healthy run should exit 0 (stderr=${healthyRun.stderr})`);
  const healthyStore = await readJson(backendStoreFile);
  const healthyReport = await readJson(backendReportFile);
  const healthyAnalytics = await readJson(backendAnalyticsFile);
  assert(healthyStore?.version === 4, `expected backend store version 4, got ${healthyStore?.version}`);
  assert(healthyReport?.status === 'pass', `expected healthy status=pass, got ${healthyReport?.status}`);
  assert(healthyReport?.operationalSources?.overall?.workloadState === 'active', 'expected active workload');
  assert(healthyReport?.operationalSources?.overall?.freshnessState === 'healthy', 'expected healthy freshness state');
  assert(healthyReport?.operationalSources?.overall?.actionabilityState === 'ready', 'expected actionability ready');
  assert(healthyAnalytics?.current?.operationalSources?.overall?.freshnessState === 'healthy', 'expected analytics current freshness healthy');
  assert(Array.isArray(healthyAnalytics?.entries) && healthyAnalytics.entries.length === 1, 'expected one analytics point after healthy run');

  await writeBackendFixtures({
    incidentsFile,
    operationsReportFile,
    alertReportFile,
    alertStateFile,
    apiSlaHistoryFile,
    streamStateFile,
    streamReportFile,
    routeMatrixFile,
    automationStateFile,
    snapshotFile,
    fullcycleReportFile,
    activeRecords: true,
    freshnessProfile: 'stale',
  });

  const staleRun = await runNode(SCRIPT, commonEnv);
  assert((staleRun.status ?? 0) !== 0, 'phase40 stale run should exit non-zero');
  const staleReport = await readJson(backendReportFile);
  const staleAnalytics = await readJson(backendAnalyticsFile);
  const staleCodes = new Set((staleReport?.violations || []).map((item) => item?.code));
  assert(staleReport?.status === 'fail', `expected stale status=fail, got ${staleReport?.status}`);
  assert(staleReport?.operationalSources?.overall?.freshnessState === 'stale', 'expected stale freshness state');
  assert(staleReport?.operationalSources?.overall?.actionabilityState === 'degraded', 'expected degraded actionability');
  assert(staleCodes.has('operational_state_stale'), 'expected operational_state_stale');
  assert(staleCodes.has('operational_snapshot_stale'), 'expected operational_snapshot_stale');
  assert(staleCodes.has('operational_fullcycle_report_stale'), 'expected operational_fullcycle_report_stale');
  assert(Array.isArray(staleAnalytics?.entries) && staleAnalytics.entries.length === 2, 'expected analytics history to retain stale point');

  await writeBackendFixtures({
    incidentsFile,
    operationsReportFile,
    alertReportFile,
    alertStateFile,
    apiSlaHistoryFile,
    streamStateFile,
    streamReportFile,
    routeMatrixFile,
    automationStateFile,
    snapshotFile,
    fullcycleReportFile,
    activeRecords: false,
    freshnessProfile: 'missing',
  });
  await resetFiles([backendStoreFile, backendReportFile, backendDashboardFile, backendAuditFile]);

  const idleMissingRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT: 'false',
  });
  assert((idleMissingRun.status ?? 1) === 0, `phase40 idle missing run should exit 0 (stderr=${idleMissingRun.stderr})`);
  const idleReport = await readJson(backendReportFile);
  const idleAnalytics = await readJson(backendAnalyticsFile);
  const idleCodes = new Set((idleReport?.violations || []).map((item) => item?.code));
  assert(idleReport?.status === 'pass', `expected idle missing status=pass, got ${idleReport?.status}`);
  assert(idleReport?.operationalSources?.overall?.workloadState === 'idle', 'expected idle workload');
  assert(idleReport?.operationalSources?.overall?.freshnessState === 'missing', 'expected missing freshness state');
  assert(idleReport?.operationalSources?.overall?.actionabilityState === 'idle_gap', 'expected idle_gap actionability');
  assert(idleCodes.has('operational_state_missing'), 'expected operational_state_missing');
  assert(idleCodes.has('operational_snapshot_missing'), 'expected operational_snapshot_missing');
  assert(idleCodes.has('operational_fullcycle_report_missing'), 'expected operational_fullcycle_report_missing');
  assert(idleCodes.has('operational_sources_idle_gap'), 'expected operational_sources_idle_gap');
  assert(Array.isArray(idleAnalytics?.entries) && idleAnalytics.entries.length === 3, 'expected analytics history to retain idle missing point');

  console.log('[OK] phase40 operational source health healthy/stale/missing validated');
  console.log(`[OK] phase40 drill report=${backendReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase40 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
