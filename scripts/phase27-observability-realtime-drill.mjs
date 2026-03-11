import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase27-observability-realtime-stream.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase27-drill');

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
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const observabilityReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-report.json');
  const productizationReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-productization-report.json');
  const apiGovernanceReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-governance-report.json');
  const streamStateFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-stream-state.json');
  const streamEventsFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-stream-events.jsonl');
  const streamReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-realtime-report.json');
  const streamDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability-realtime.md');
  const streamAuditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-realtime-audit.jsonl');

  await fs.rm(streamStateFile, { force: true });
  await fs.rm(streamEventsFile, { force: true });
  await fs.rm(streamReportFile, { force: true });
  await fs.rm(streamDashboardFile, { force: true });
  await fs.rm(streamAuditFile, { force: true });

  await writeJson(observabilityReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: { openCriticalIncidents: 0 },
  });
  await writeJson(productizationReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: { blockingViolations: 0 },
  });
  await writeJson(apiGovernanceReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: { blockingViolations: 0 },
    violations: [],
  });

  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE: productizationReportFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE: apiGovernanceReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE: streamEventsFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_DASHBOARD_FILE: streamDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_AUDIT_FILE: streamAuditFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_OBSERVABILITY_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_PRODUCTIZATION_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_GOVERNANCE_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_NO_BLOCKING_VIOLATIONS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_OPEN_CRITICAL_INCIDENTS: '0',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_REPORT_AGE_MIN: '120',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_EVENT_HISTORY: '100',
  });

  assert((passRun.status ?? 1) === 0, 'phase27 pass run should exit 0');
  const passReport = await readJson(streamReportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert((passReport?.summary?.eventsGenerated || 0) >= 1, `expected eventsGenerated >= 1, got ${passReport?.summary?.eventsGenerated}`);

  await writeJson(observabilityReportFile, {
    generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    status: 'warn',
    summary: { openCriticalIncidents: 2 },
  });
  await writeJson(productizationReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: { blockingViolations: 0 },
  });
  await writeJson(apiGovernanceReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    summary: { blockingViolations: 2 },
    violations: [
      { code: 'endpoint_contract_invalid_summary', blocking: true, message: 'broken summary contract' },
      { code: 'rbac_invalid_role_not_forbidden', blocking: true, message: 'invalid role accepted' },
    ],
  });

  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE: productizationReportFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE: apiGovernanceReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE: streamEventsFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_DASHBOARD_FILE: streamDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_AUDIT_FILE: streamAuditFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_OBSERVABILITY_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_PRODUCTIZATION_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_GOVERNANCE_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_NO_BLOCKING_VIOLATIONS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_OPEN_CRITICAL_INCIDENTS: '0',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_REPORT_AGE_MIN: '120',
    FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_EVENT_HISTORY: '100',
  });

  assert((failRun.status ?? 0) !== 0, 'phase27 fail run should exit non-zero');
  const failReport = await readJson(streamReportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(codes.has('observability_not_pass'), 'expected observability_not_pass violation');
  assert(codes.has('api_governance_not_pass'), 'expected api_governance_not_pass violation');
  assert(codes.has('api_governance_blocking_violations_present'), 'expected api_governance_blocking_violations_present violation');
  assert(codes.has('open_critical_incidents_exceeded'), 'expected open_critical_incidents_exceeded violation');
  assert(codes.has('report_stale_observabilityMinutes'), 'expected stale observability report violation');

  console.log('[OK] phase27 drill realtime stream pass/fail behavior validated');
  console.log(`[OK] phase27 drill report=${streamReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase27 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
