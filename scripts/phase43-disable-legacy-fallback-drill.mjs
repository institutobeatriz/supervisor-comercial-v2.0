import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  OPERATIONAL_COLLECTOR_INTERFACE,
  OPERATIONAL_COLLECTOR_SCHEMA,
  OPERATIONAL_COLLECTOR_VERSION,
} from './observability-operational-provider.mjs';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase43-disable-legacy-fallback.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase43-drill');

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

  // ---- Drill 1: collector interface structure validation ----
  console.log('[DRILL] Validating collector interface structure...');

  assert(
    OPERATIONAL_COLLECTOR_INTERFACE?.schema === OPERATIONAL_COLLECTOR_SCHEMA,
    `collector interface schema mismatch: expected=${OPERATIONAL_COLLECTOR_SCHEMA} got=${OPERATIONAL_COLLECTOR_INTERFACE?.schema}`,
  );
  assert(
    Number(OPERATIONAL_COLLECTOR_INTERFACE?.version) === OPERATIONAL_COLLECTOR_VERSION,
    `collector interface version mismatch: expected=${OPERATIONAL_COLLECTOR_VERSION} got=${OPERATIONAL_COLLECTOR_INTERFACE?.version}`,
  );
  assert(
    typeof OPERATIONAL_COLLECTOR_INTERFACE?.outputs === 'object',
    'collector interface must have outputs object',
  );
  for (const key of ['incidentAutomation', 'itsmSnapshot', 'fullcycleReport']) {
    assert(
      OPERATIONAL_COLLECTOR_INTERFACE.outputs[key]?.required === true,
      `collector output ${key} must be required=true`,
    );
  }
  assert(
    Array.isArray(OPERATIONAL_COLLECTOR_INTERFACE?.integrationModes) && OPERATIONAL_COLLECTOR_INTERFACE.integrationModes.length > 0,
    'collector interface must define integrationModes',
  );
  assert(
    OPERATIONAL_COLLECTOR_INTERFACE?.enforcement?.legacyFilesBlocked === true,
    'collector enforcement must set legacyFilesBlocked=true',
  );
  assert(
    String(OPERATIONAL_COLLECTOR_INTERFACE?.enforcement?.phase || '').trim().length > 0,
    'collector enforcement must set phase',
  );

  console.log('[OK] collector interface structure valid');

  // ---- Setup shared fixtures ----
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
  const enforcementReportFile = path.resolve(DRILL_DIR, 'enforcement-report.json');
  const enforcementDashboardFile = path.resolve(DRILL_DIR, 'enforcement-dashboard.md');
  const enforcementAuditFile = path.resolve(DRILL_DIR, 'enforcement-audit.jsonl');
  const collectorInterfaceFile = path.resolve(DRILL_DIR, 'collector-interface.json');

  for (const filePath of [
    backendStoreFile, backendReportFile, backendDashboardFile, backendAuditFile,
    backendAnalyticsFile, backendProviderDashboardFile, producerReportFile,
    producerDashboardFile, producerAuditFile, missingRotationFile, missingCalendarFile,
    missingAutomationStateFile, missingSnapshotFile, contractFile,
    enforcementReportFile, enforcementDashboardFile, enforcementAuditFile, collectorInterfaceFile,
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
    activeIncidentId: 'inc-phase43-1',
    incidents: [
      {
        id: 'inc-phase43-1',
        status: 'open',
        startedAt: isoMinutesAgo(60),
        detectedAt: isoMinutesAgo(55),
        severity: 'warning',
        maxSeverity: 'warning',
        violations: [],
        alertEvents: [],
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
    violations: [],
    dispatch: { openedForDispatch: [], resolvedForDispatch: [], deliveries: [] },
  });
  await writeJson(alertStateFile, {
    version: 1,
    generatedAt: isoMinutesAgo(4),
    lastDispatchAt: isoMinutesAgo(4),
    openIssueKeys: [],
    lastIssueSentAt: {},
  });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: isoMinutesAgo(4),
    history: [
      { timestamp: isoMinutesAgo(4), environment: 'drill', status: 'pass', availabilityPct: 99.9, worstLatencyMs: 120, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
    ],
  });
  await writeJson(streamStateFile, { generatedAt: isoMinutesAgo(4), status: 'pass', cursor: 5 });
  await writeJson(streamReportFile, { generatedAt: isoMinutesAgo(4), status: 'pass', summary: { cursor: 5 } });
  await writeJson(automationStateFile, {
    version: 1,
    updatedAt: isoMinutesAgo(2),
    incidents: {
      'inc-phase43-1': {
        owner: 'ops-phase43-primary',
        ownerAssignedAt: isoMinutesAgo(5),
        updatedAt: isoMinutesAgo(2),
        paging: { externalId: 'PD-phase43-1' },
      },
    },
  });
  await writeJson(snapshotFile, {
    generatedAt: isoMinutesAgo(1),
    paging: [{ externalId: 'PD-phase43-1', incidentId: 'inc-phase43-1', status: 'triggered', owner: 'ops-phase43-primary' }],
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
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET: 'phase43-disable-legacy-fallback',
    FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_REPORT_FILE: enforcementReportFile,
    FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_DASHBOARD_FILE: enforcementDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_AUDIT_FILE: enforcementAuditFile,
    FULLCYCLE_CONNECTOR_OBS_PHASE43_COLLECTOR_INTERFACE_FILE: collectorInterfaceFile,
  };

  // ---- Drill 2: enforce_pass - enforcement enabled, no legacy, full chain passes ----
  console.log('[DRILL] enforce_pass: enforcement active, materialized contract, no legacy...');

  const passRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: automationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
  });

  assert((passRun.status ?? 1) === 0, `phase43 enforce_pass should exit 0 (stderr=${passRun.stderr})`);

  const passEnforcementReport = await readJson(enforcementReportFile);
  assert(passEnforcementReport?.status === 'pass', `expected enforcement status=pass, got=${passEnforcementReport?.status}`);
  assert(passEnforcementReport?.summary?.enforceNoLegacy === true, `expected enforceNoLegacy=true`);
  assert(passEnforcementReport?.summary?.legacyFallbackState === 'disabled', `expected legacyFallbackState=disabled, got=${passEnforcementReport?.summary?.legacyFallbackState}`);
  assert(passEnforcementReport?.summary?.allowLegacyFallback === false, `expected allowLegacyFallback=false`);
  assert(passEnforcementReport?.summary?.collectorInterfaceValid === true, `expected collectorInterfaceValid=true`);
  const chainStatus = passEnforcementReport?.summary?.phase42ChainStatus;
  assert(
    chainStatus === 'pass' || chainStatus === 'skipped_unavailable',
    `expected phase42ChainStatus=pass or skipped_unavailable, got=${chainStatus}`,
  );

  const passCollectorInterface = await readJson(collectorInterfaceFile);
  assert(passCollectorInterface?.valid === true, `expected collector interface valid=true`);
  assert(passCollectorInterface?.interface?.schema === OPERATIONAL_COLLECTOR_SCHEMA, `expected collector interface schema=${OPERATIONAL_COLLECTOR_SCHEMA}`);

  console.log('[OK] enforce_pass: phase43 enforcement passed with full chain');

  // ---- Drill 3: legacy_blocked - attempt to enable legacy fallback with enforcement active ----
  console.log('[DRILL] legacy_blocked: attempting allowLegacyFallback=true with enforceNoLegacy=true...');

  for (const filePath of [enforcementReportFile, enforcementDashboardFile, enforcementAuditFile]) {
    await fs.rm(filePath, { force: true });
  }

  const blockedRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: automationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'true',
  });

  assert((blockedRun.status ?? 0) !== 0, 'phase43 legacy_blocked should exit non-zero when allowLegacyFallback=true with enforcement');

  const blockedReport = await readJson(enforcementReportFile);
  assert(blockedReport?.status === 'fail', `expected enforcement status=fail when legacy allowed with enforcement, got=${blockedReport?.status}`);
  const blockedHasViolation = safeArray(blockedReport?.violations).some((v) => v.code === 'legacy_fallback_still_allowed');
  assert(blockedHasViolation, 'expected violation legacy_fallback_still_allowed in blocked report');

  console.log('[OK] legacy_blocked: enforcement correctly rejected allowLegacyFallback=true');

  // ---- Drill 4: mode_blocked - attempt legacy_files providerMode with enforcement active ----
  console.log('[DRILL] mode_blocked: attempting providerMode=legacy_files with enforceNoLegacy=true...');

  for (const filePath of [enforcementReportFile, enforcementDashboardFile, enforcementAuditFile]) {
    await fs.rm(filePath, { force: true });
  }

  const modeBlockedRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: automationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    FULLCYCLE_REPORT_FILE: fullcycleReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: 'legacy_files',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',
  });

  assert((modeBlockedRun.status ?? 0) !== 0, 'phase43 mode_blocked should exit non-zero when providerMode=legacy_files with enforcement');

  const modeBlockedReport = await readJson(enforcementReportFile);
  assert(modeBlockedReport?.status === 'fail', `expected enforcement status=fail when providerMode=legacy_files with enforcement, got=${modeBlockedReport?.status}`);
  const modeBlockedHasViolation = safeArray(modeBlockedReport?.violations).some((v) => v.code === 'provider_mode_not_materialized_contract');
  assert(modeBlockedHasViolation, 'expected violation provider_mode_not_materialized_contract in mode_blocked report');

  console.log('[OK] mode_blocked: enforcement correctly rejected providerMode=legacy_files');

  console.log('[OK] phase43 collector interface structure valid');
  console.log('[OK] phase43 enforce_pass validated');
  console.log('[OK] phase43 legacy_blocked validated');
  console.log('[OK] phase43 mode_blocked validated');
  console.log(`[OK] phase43 drill report=${enforcementReportFile}`);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

main().catch((error) => {
  console.error(`Unexpected phase43 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
