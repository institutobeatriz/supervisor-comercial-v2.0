import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase23-connectors-production-consolidation.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase23-drill');

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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function runErrorDetails(run) {
  const stdout = run.stdout?.trim() || '';
  const stderr = run.stderr?.trim() || '';
  const details = [];
  if (stdout) details.push(`stdout: ${stdout}`);
  if (stderr) details.push(`stderr: ${stderr}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

function runtimeReportPass() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    incident: false,
    connectors: [
      {
        key: 'itsm:jira',
        provider: 'jira',
        channel: 'ticket',
        runsSeen: 16,
        successRatePct: 99.2,
        timeoutRatePct: 0.3,
        httpErrorRatePct: 0.2,
        latencyWorstP95Ms: 1450,
        contractErrors: 0,
      },
    ],
  };
}

function readinessPass() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: {
      connectors: 1,
      blockingViolations: 0,
      violations: 0,
    },
    connectors: [
      {
        key: 'itsm:jira',
      },
    ],
    violations: [],
  };
}

function readinessWarn() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'warn',
    summary: {
      connectors: 1,
      blockingViolations: 1,
      violations: 1,
    },
    violations: [
      {
        code: 'profile_missing',
        connector: 'itsm:jira',
        blocking: true,
      },
    ],
  };
}

function incidentsResolved(id) {
  return {
    version: 1,
    activeIncidentId: null,
    incidents: [
      {
        id,
        status: 'resolved',
        severity: 'critical',
        maxSeverity: 'critical',
        startedAt: '2026-03-09T10:00:00.000Z',
        detectedAt: '2026-03-09T10:02:00.000Z',
        resolvedAt: '2026-03-09T10:10:00.000Z',
        violations: [
          {
            connector: 'itsm:jira',
            code: 'timeout_rate_above_target',
            message: 'timeout rate exceeded',
          },
        ],
      },
    ],
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const runtimeReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-runtime-report.json');
  const readinessReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-readiness-report.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'fullcycle-connector-incidents.json');
  const timeseriesFile = path.resolve(DRILL_DIR, 'fullcycle-connector-timeseries.json');
  const reportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-operations-report.json');
  const dashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-operations.md');
  const auditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-executive-audit-trail.jsonl');
  const postmortemDir = path.resolve(DRILL_DIR, 'postmortems-connectors');
  const failPostmortemDir = path.resolve(DRILL_DIR, 'postmortems-connectors-fail');

  await fs.rm(timeseriesFile, { force: true });
  await fs.rm(reportFile, { force: true });
  await fs.rm(dashboardFile, { force: true });
  await fs.rm(auditFile, { force: true });
  await fs.rm(postmortemDir, { recursive: true, force: true });
  await fs.rm(failPostmortemDir, { recursive: true, force: true });

  await writeJson(runtimeReportFile, runtimeReportPass());
  await writeJson(readinessReportFile, readinessPass());
  await writeJson(incidentsFile, incidentsResolved('conn-pass-001'));

  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_ENVIRONMENT: 'prod',
    FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: runtimeReportFile,
    FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE: readinessReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_TIMESERIES_FILE: timeseriesFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_POSTMORTEM_DIR: postmortemDir,
    FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE: auditFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_INCLUDE_OPEN: 'false',
    FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS: '100',
    FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS: '30',
  });
  assert((passRun.status ?? 1) === 0, `phase23 pass run should exit 0${runErrorDetails(passRun)}`);

  const passReport = await readJson(reportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert(passReport?.summary?.environment === 'prod', `expected environment prod, got ${passReport?.summary?.environment}`);
  assert(passReport?.summary?.postmortemCoveragePct === 100, `expected postmortem coverage 100, got ${passReport?.summary?.postmortemCoveragePct}`);
  assert((passReport?.violations || []).length === 0, 'expected no violations in pass run');
  assert(await exists(path.resolve(postmortemDir, 'conn-pass-001.md')), 'expected generated connector postmortem for conn-pass-001');

  const segmentationRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_ENVIRONMENT: 'dev',
    FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: runtimeReportFile,
    FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE: readinessReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_TIMESERIES_FILE: timeseriesFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_POSTMORTEM_DIR: postmortemDir,
    FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE: auditFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_INCLUDE_OPEN: 'false',
    FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS: '100',
    FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS: '30',
  });
  assert((segmentationRun.status ?? 1) === 0, `phase23 segmentation run should exit 0${runErrorDetails(segmentationRun)}`);

  const timeseries = await readJson(timeseriesFile);
  const envs = new Set((timeseries?.history || []).map((item) => item?.environment));
  assert(envs.has('prod') && envs.has('dev'), 'expected timeseries segmentation for prod and dev');

  await writeJson(readinessReportFile, readinessWarn());
  await writeJson(incidentsFile, incidentsResolved('conn-fail-002'));

  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_ENVIRONMENT: 'hml',
    FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: runtimeReportFile,
    FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE: readinessReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_TIMESERIES_FILE: timeseriesFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_POSTMORTEM_DIR: failPostmortemDir,
    FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE: auditFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS: 'true',
    FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED: 'true',
    FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE: 'false',
    FULLCYCLE_CONNECTOR_POSTMORTEM_INCLUDE_OPEN: 'false',
    FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS: '100',
    FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS: '30',
  });
  assert((failRun.status ?? 0) !== 0, `phase23 fail run should exit non-zero${runErrorDetails(failRun)}`);

  const failReport = await readJson(reportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(codes.has('readiness_not_pass'), 'expected readiness_not_pass violation');
  assert(codes.has('postmortem_coverage_below_target'), 'expected postmortem_coverage_below_target violation');

  console.log('[OK] phase23 drill environment segmentation, executive postmortem coupling and strict gate validated');
  console.log(`[OK] phase23 drill report=${reportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase23 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
