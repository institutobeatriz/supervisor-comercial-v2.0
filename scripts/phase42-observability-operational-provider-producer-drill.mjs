import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase42-observability-operational-provider-producer.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase42-drill');

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
  const backendProviderDashboardFile = path.resolve(DRILL_DIR, 'backend-provider.md');
  const producerReportFile = path.resolve(DRILL_DIR, 'producer-report.json');
  const producerDashboardFile = path.resolve(DRILL_DIR, 'producer-dashboard.md');
  const producerAuditFile = path.resolve(DRILL_DIR, 'producer-audit.jsonl');
  const routeMatrixFile = path.resolve(DRILL_DIR, 'route-matrix.json');
  const missingRotationFile = path.resolve(DRILL_DIR, 'rotation-missing.json');
  const missingCalendarFile = path.resolve(DRILL_DIR, 'calendar-missing.json');
  const automationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const fullcycleReportFile = path.resolve(DRILL_DIR, 'fullcycle-report.json');
  const missingAutomationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state-missing.json');
  const missingSnapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot-missing.json');
  const contractFile = path.resolve(DRILL_DIR, 'operational-provider.json');

  for (const filePath of [
    backendStoreFile,
    backendReportFile,
    backendDashboardFile,
    backendAuditFile,
    backendAnalyticsFile,
    backendProviderDashboardFile,
    producerReportFile,
    producerDashboardFile,
    producerAuditFile,
    missingRotationFile,
    missingCalendarFile,
    missingAutomationStateFile,
    missingSnapshotFile,
    contractFile,
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
        startedAt: isoMinutesAgo(90),
        detectedAt: isoMinutesAgo(85),
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
        alertEvents: [{ timestamp: isoMinutesAgo(60), attempts: [{ target: 'slack', ok: true }] }],
      },
    ],
  });
  await writeJson(operationsReportFile, {
    generatedAt: isoMinutesAgo(4),
    summary: { environment: 'drill' },
    postmortems: [],
  });
  await writeJson(alertReportFile, {
    generatedAt: isoMinutesAgo(4),
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
    generatedAt: isoMinutesAgo(4),
    lastDispatchAt: isoMinutesAgo(4),
    openIssueKeys: ['connectors_runtime::latency_above_target'],
    lastIssueSentAt: { 'connectors_runtime::latency_above_target': isoMinutesAgo(4) },
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
  await writeJson(automationStateFile, {
    version: 1,
    updatedAt: isoMinutesAgo(2),
    incidents: {
      'inc-open-1': {
        owner: 'ops-integrations-primary',
        ownerAssignedAt: isoMinutesAgo(6),
        updatedAt: isoMinutesAgo(2),
        paging: {
          externalId: 'PD-inc-open-1',
        },
      },
    },
  });
  await writeJson(snapshotFile, {
    generatedAt: isoMinutesAgo(1),
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
    generatedAt: isoMinutesAgo(3),
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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_DASHBOARD_FILE: backendProviderDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: producerReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: producerDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: producerAuditFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE: contractFile,
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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PRODUCER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES: '10',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: 'materialized_contract',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_MODE: 'dedicated_script',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET: 'phase43-disable-legacy-fallback',
  };

  const passRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: automationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });
  assert((passRun.status ?? 1) === 0, `phase42 materialized run should exit 0 (stderr=${passRun.stderr})`);

  const passStore = await readJson(backendStoreFile);
  const passReport = await readJson(backendReportFile);
  const passProducerReport = await readJson(producerReportFile);
  const passContract = await readJson(contractFile);

  assert(passStore?.oncall?.sourceMode === 'operational_contract', `expected operational_contract source mode, got ${passStore?.oncall?.sourceMode}`);
  assert(passReport?.operationalProvider?.producerMode === 'dedicated_script', `expected producerMode dedicated_script, got ${passReport?.operationalProvider?.producerMode}`);
  assert(passReport?.operationalProvider?.legacyFallbackState === 'disabled', `expected legacyFallbackState=disabled, got ${passReport?.operationalProvider?.legacyFallbackState}`);
  assert(passProducerReport?.status === 'pass', `expected producer report pass, got ${passProducerReport?.status}`);
  assert(passProducerReport?.summary?.backendStatus === 'pass', `expected producer backendStatus pass, got ${passProducerReport?.summary?.backendStatus}`);
  assert(passContract?.producer?.mode === 'dedicated_script', `expected contract producer mode dedicated_script, got ${passContract?.producer?.mode}`);
  assert(passContract?.producer?.legacyFallbackState === 'disabled', `expected contract legacy fallback disabled, got ${passContract?.producer?.legacyFallbackState}`);

  await fs.rm(automationStateFile, { force: true });
  await fs.rm(snapshotFile, { force: true });
  await fs.rm(fullcycleReportFile, { force: true });

  const replayRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: missingAutomationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: missingSnapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: 'false',
    INCIDENT_AUTOMATION_STATE_FILE: missingAutomationStateFile,
    ITSM_SNAPSHOT_FILE: missingSnapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });
  assert((replayRun.status ?? 1) === 0, `phase42 contract replay should exit 0 (stderr=${replayRun.stderr})`);

  const replayReport = await readJson(backendReportFile);
  const replayProducerReport = await readJson(producerReportFile);
  assert(replayReport?.operationalProvider?.contractLoaded === true, 'expected replay backend to use existing contract');
  assert(replayReport?.operationalProvider?.producerMode === 'dedicated_script', 'expected replay producerMode dedicated_script');
  assert(replayProducerReport?.summary?.contractLoaded === true, 'expected replay producer report to keep contractLoaded=true');

  await fs.rm(contractFile, { force: true });
  const failRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: missingAutomationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: missingSnapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: 'false',
    INCIDENT_AUTOMATION_STATE_FILE: missingAutomationStateFile,
    ITSM_SNAPSHOT_FILE: missingSnapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });
  assert((failRun.status ?? 0) !== 0, 'phase42 missing contract run should exit non-zero');

  console.log('[OK] phase42 operational producer materialize/replay/fail validated');
  console.log(`[OK] phase42 drill report=${producerReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase42 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
