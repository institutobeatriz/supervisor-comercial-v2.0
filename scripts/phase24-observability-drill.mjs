import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase24-observability-layer.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase24-drill');

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

async function fileExists(filePath) {
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

function assertStrictHtmlShell(html, { cssRef, jsRef, templateId, label }) {
  assert(html.includes(cssRef), `${label} should reference external css asset`);
  assert(html.includes(jsRef), `${label} should reference external js asset`);
  assert(html.includes(`id="${templateId}"`), `${label} should expose bootstrap template`);
  assert(!/<style[\s>]/i.test(html), `${label} should not contain inline style tags`);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${label} should not contain inline script tags`);
}

function runErrorDetails(run) {
  const stdout = run.stdout?.trim() || '';
  const stderr = run.stderr?.trim() || '';
  const details = [];
  if (stdout) details.push(`stdout: ${stdout}`);
  if (stderr) details.push(`stderr: ${stderr}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

function buildTimeseriesMultiEnv() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    history: [
      {
        timestamp: '2026-03-09T09:50:00.000Z',
        environment: 'dev',
        runtimeStatus: 'pass',
        readinessStatus: 'pass',
        activeIncidentId: null,
        connectors: [
          {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            successRatePct: 98.9,
            timeoutRatePct: 0.9,
            httpErrorRatePct: 0.4,
            latencyWorstP95Ms: 2100,
            contractErrors: 0,
          },
        ],
      },
      {
        timestamp: '2026-03-09T09:55:00.000Z',
        environment: 'hml',
        runtimeStatus: 'pass',
        readinessStatus: 'pass',
        activeIncidentId: null,
        connectors: [
          {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            successRatePct: 99.1,
            timeoutRatePct: 0.4,
            httpErrorRatePct: 0.2,
            latencyWorstP95Ms: 1700,
            contractErrors: 0,
          },
        ],
      },
      {
        timestamp: '2026-03-09T10:00:00.000Z',
        environment: 'prod',
        runtimeStatus: 'pass',
        readinessStatus: 'pass',
        activeIncidentId: null,
        connectors: [
          {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            successRatePct: 99.5,
            timeoutRatePct: 0.2,
            httpErrorRatePct: 0.1,
            latencyWorstP95Ms: 1400,
            contractErrors: 0,
          },
          {
            key: 'oncall:pagerduty',
            provider: 'pagerduty',
            channel: 'paging',
            successRatePct: 99.4,
            timeoutRatePct: 0.3,
            httpErrorRatePct: 0.1,
            latencyWorstP95Ms: 1200,
            contractErrors: 0,
          },
        ],
      },
    ],
  };
}

function buildTimeseriesSingleEnv() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    history: [
      {
        timestamp: '2026-03-09T10:20:00.000Z',
        environment: 'dev',
        runtimeStatus: 'warn',
        readinessStatus: 'warn',
        activeIncidentId: null,
        connectors: [
          {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            successRatePct: 92.1,
            timeoutRatePct: 3.1,
            httpErrorRatePct: 2.8,
            latencyWorstP95Ms: 6200,
            contractErrors: 3,
          },
        ],
      },
    ],
  };
}

function operationsReportPass() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: {
      environment: 'prod',
      violations: 0,
      blockingViolations: 0,
    },
  };
}

function operationsReportWarn() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'warn',
    summary: {
      environment: 'dev',
      violations: 2,
      blockingViolations: 1,
    },
  };
}

function incidentsPass() {
  return {
    version: 1,
    activeIncidentId: null,
    incidents: [
      {
        id: 'conn-pass-100',
        status: 'resolved',
        maxSeverity: 'warning',
        startedAt: '2026-03-09T09:00:00.000Z',
        detectedAt: '2026-03-09T09:01:00.000Z',
        resolvedAt: '2026-03-09T09:20:00.000Z',
      },
    ],
  };
}

function incidentsFail() {
  return {
    version: 1,
    activeIncidentId: null,
    incidents: [
      {
        id: 'conn-fail-200',
        status: 'resolved',
        maxSeverity: 'critical',
        startedAt: '2026-03-08T06:00:00.000Z',
        detectedAt: '2026-03-08T06:05:00.000Z',
        resolvedAt: '2026-03-08T06:20:00.000Z',
      },
      {
        id: 'conn-fail-open-201',
        status: 'open',
        maxSeverity: 'critical',
        startedAt: '2026-03-09T10:00:00.000Z',
        detectedAt: '2026-03-09T10:03:00.000Z',
        resolvedAt: null,
      },
    ],
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const timeseriesFile = path.resolve(DRILL_DIR, 'fullcycle-connector-timeseries.json');
  const operationsReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-operations-report.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'fullcycle-connector-incidents.json');
  const postmortemDir = path.resolve(DRILL_DIR, 'postmortems-connectors');
  const observabilityStoreFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-store.json');
  const observabilityReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-report.json');
  const observabilityFeedFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability.json');
  const observabilityDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability.html');
  const observabilityAuditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-audit.jsonl');
  const observabilityAssetsDir = path.resolve(DRILL_DIR, 'assets');

  await fs.rm(observabilityStoreFile, { force: true });
  await fs.rm(observabilityReportFile, { force: true });
  await fs.rm(observabilityFeedFile, { force: true });
  await fs.rm(observabilityDashboardFile, { force: true });
  await fs.rm(observabilityAuditFile, { force: true });
  await fs.rm(observabilityAssetsDir, { recursive: true, force: true });
  await fs.rm(postmortemDir, { recursive: true, force: true });

  await writeJson(timeseriesFile, buildTimeseriesMultiEnv());
  await writeJson(operationsReportFile, operationsReportPass());
  await writeJson(incidentsFile, incidentsPass());

  await fs.mkdir(postmortemDir, { recursive: true });
  await fs.writeFile(path.resolve(postmortemDir, 'conn-pass-100.md'), '# Connector Postmortem\n', 'utf-8');

  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_TIMESERIES_FILE: timeseriesFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: operationsReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_POSTMORTEM_DIR: postmortemDir,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE: observabilityStoreFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE: observabilityFeedFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE: observabilityDashboardFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE: observabilityAuditFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_HISTORY_MAX_ENTRIES: '120',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_TREND_WINDOW_POINTS: '30',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_OPERATIONS_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_MULTI_ENV: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_MIN_ENVIRONMENTS: '3',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_POSTMORTEM_LINK: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_POSTMORTEM_SLA_HOURS: '24',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_MAX_OPEN_CRITICAL_INCIDENTS: '0',
  });
  assert((passRun.status ?? 1) === 0, `phase24 pass run should exit 0${runErrorDetails(passRun)}`);

  const passReport = await readJson(observabilityReportFile);
  assert(passReport?.status === 'pass', `expected pass observability status, got ${passReport?.status}`);
  assert((passReport?.summary?.environmentsTracked || 0) >= 3, `expected >=3 environments, got ${passReport?.summary?.environmentsTracked}`);
  assert(passReport?.summary?.postmortemLinkCoveragePct === 100, `expected postmortem coverage 100, got ${passReport?.summary?.postmortemLinkCoveragePct}`);
  assert(await fileExists(observabilityDashboardFile), 'expected generated HTML observability dashboard');
  assert(await fileExists(observabilityFeedFile), 'expected generated observability JSON feed');
  const passHtml = await fs.readFile(observabilityDashboardFile, 'utf-8');
  assertStrictHtmlShell(passHtml, {
    cssRef: './assets/fullcycle-connectors-observability.css',
    jsRef: './assets/fullcycle-connectors-observability.js',
    templateId: 'connector-observability-data',
    label: 'observability dashboard html',
  });
  assert(await fileExists(path.resolve(observabilityAssetsDir, 'fullcycle-connectors-observability.css')), 'expected generated observability css asset');
  assert(await fileExists(path.resolve(observabilityAssetsDir, 'fullcycle-connectors-observability.js')), 'expected generated observability js asset');

  await writeJson(timeseriesFile, buildTimeseriesSingleEnv());
  await writeJson(operationsReportFile, operationsReportWarn());
  await writeJson(incidentsFile, incidentsFail());
  await fs.rm(postmortemDir, { recursive: true, force: true });

  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_TIMESERIES_FILE: timeseriesFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: operationsReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_POSTMORTEM_DIR: postmortemDir,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE: observabilityStoreFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE: observabilityFeedFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE: observabilityDashboardFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE: observabilityAuditFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_HISTORY_MAX_ENTRIES: '120',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_TREND_WINDOW_POINTS: '30',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_OPERATIONS_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_MULTI_ENV: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_MIN_ENVIRONMENTS: '3',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_POSTMORTEM_LINK: 'true',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_POSTMORTEM_SLA_HOURS: '1',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_MAX_OPEN_CRITICAL_INCIDENTS: '0',
  });
  assert((failRun.status ?? 0) !== 0, `phase24 fail run should exit non-zero${runErrorDetails(failRun)}`);

  const failReport = await readJson(observabilityReportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail observability status, got ${failReport?.status}`);
  assert(codes.has('operations_report_not_pass'), 'expected operations_report_not_pass violation');
  assert(codes.has('multi_environment_insufficient'), 'expected multi_environment_insufficient violation');
  assert(codes.has('postmortem_link_sla_breach'), 'expected postmortem_link_sla_breach violation');
  assert(codes.has('open_critical_incidents_above_limit'), 'expected open_critical_incidents_above_limit violation');

  console.log('[OK] phase24 drill observability storage, UI feed and executive correlation gates validated');
  console.log(`[OK] phase24 drill report=${observabilityReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase24 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
