import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase21-connectors-runtime.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase21-drill');

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

function runErrorDetails(run) {
  const stdout = run.stdout?.trim() || '';
  const stderr = run.stderr?.trim() || '';
  const details = [];
  if (stdout) details.push(`stdout: ${stdout}`);
  if (stderr) details.push(`stderr: ${stderr}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

function createMockServer() {
  const events = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      events.push({
        path: req.url || '/',
        method: req.method || 'POST',
        body,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return { server, events };
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') return reject(new Error('invalid server addr'));
      resolve(addr.port);
    });
    server.on('error', reject);
  });
}

async function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function degradedTelemetry() {
  const now = Date.now();
  const t1 = new Date(now - 60_000).toISOString();
  const t2 = new Date(now - 30_000).toISOString();
  return {
    version: 1,
    history: [
      {
        timestamp: t1,
        runId: 'r1',
        status: 'fail',
        connectors: {
          'itsm:jira': {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            endpointConfigured: true,
            total: 10,
            success: 7,
            failed: 3,
            skipped: 0,
            attempted: 10,
            httpAttempts: 10,
            retried: 2,
            timeouts: 2,
            httpErrors: 2,
            contractRequestErrors: 0,
            contractResponseErrors: 0,
            latencyMs: { p95: 1300 },
          },
        },
      },
      {
        timestamp: t2,
        runId: 'r2',
        status: 'fail',
        connectors: {
          'itsm:jira': {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            endpointConfigured: true,
            total: 10,
            success: 8,
            failed: 2,
            skipped: 0,
            attempted: 10,
            httpAttempts: 10,
            retried: 1,
            timeouts: 1,
            httpErrors: 1,
            contractRequestErrors: 0,
            contractResponseErrors: 0,
            latencyMs: { p95: 1200 },
          },
        },
      },
    ],
  };
}

function healthyTelemetry() {
  const now = Date.now();
  const t1 = new Date(now - 20_000).toISOString();
  const t2 = new Date(now - 10_000).toISOString();
  return {
    version: 1,
    history: [
      {
        timestamp: t1,
        runId: 'r3',
        status: 'pass',
        connectors: {
          'itsm:jira': {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            endpointConfigured: true,
            total: 20,
            success: 20,
            failed: 0,
            skipped: 0,
            attempted: 20,
            httpAttempts: 20,
            retried: 0,
            timeouts: 0,
            httpErrors: 0,
            contractRequestErrors: 0,
            contractResponseErrors: 0,
            latencyMs: { p95: 300 },
          },
        },
      },
      {
        timestamp: t2,
        runId: 'r4',
        status: 'pass',
        connectors: {
          'itsm:jira': {
            key: 'itsm:jira',
            provider: 'jira',
            channel: 'ticket',
            endpointConfigured: true,
            total: 20,
            success: 20,
            failed: 0,
            skipped: 0,
            attempted: 20,
            httpAttempts: 20,
            retried: 0,
            timeouts: 0,
            httpErrors: 0,
            contractRequestErrors: 0,
            contractResponseErrors: 0,
            latencyMs: { p95: 320 },
          },
        },
      },
    ],
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const telemetryFile = path.resolve(DRILL_DIR, 'fullcycle-connector-telemetry.json');
  const reportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-runtime-report.json');
  const dashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-runtime.md');
  const incidentsFile = path.resolve(DRILL_DIR, 'fullcycle-connector-incidents.json');

  await fs.rm(reportFile, { force: true });
  await fs.rm(dashboardFile, { force: true });
  await fs.rm(incidentsFile, { force: true });

  const { server, events } = createMockServer();
  const port = await listen(server);
  const alertWebhook = `http://127.0.0.1:${port}/alerts`;

  try {
    await writeJson(telemetryFile, degradedTelemetry());

    const failRun = await runNode(SCRIPT, {
      FULLCYCLE_CONNECTOR_TELEMETRY_FILE: telemetryFile,
      FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE: dashboardFile,
      FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
      FULLCYCLE_CONNECTOR_WINDOW_RUNS: '10',
      FULLCYCLE_CONNECTOR_MIN_SAMPLES: '1',
      FULLCYCLE_CONNECTOR_ENFORCE_TARGETS: 'true',
      FULLCYCLE_CONNECTOR_EXIT_ON_INCIDENT: 'true',
      FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT: '95',
      FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS: '1000',
      FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX: '0',
      FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL: alertWebhook,
      FULLCYCLE_CONNECTOR_ALERT_COOLDOWN_MINUTES: '60',
    });
    assert((failRun.status ?? 0) !== 0, `phase21 degraded run should fail${runErrorDetails(failRun)}`);

    const failReport = await readJson(reportFile);
    const incidentsAfterFail = await readJson(incidentsFile);
    assert(failReport?.status === 'fail', `expected fail report status, got ${failReport?.status}`);
    assert(failReport?.incident === true, 'expected incident=true in degraded report');
    assert((failReport?.violations || []).length >= 1, 'expected violations in degraded report');
    assert(events.length >= 1, 'expected at least one alert webhook call');
    assert(Boolean(incidentsAfterFail?.activeIncidentId), 'expected active incident after degraded run');

    const warnRun = await runNode(SCRIPT, {
      FULLCYCLE_CONNECTOR_TELEMETRY_FILE: telemetryFile,
      FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE: dashboardFile,
      FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
      FULLCYCLE_CONNECTOR_WINDOW_RUNS: '10',
      FULLCYCLE_CONNECTOR_MIN_SAMPLES: '1',
      FULLCYCLE_CONNECTOR_ENFORCE_TARGETS: 'false',
      FULLCYCLE_CONNECTOR_EXIT_ON_INCIDENT: 'false',
      FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT: '95',
      FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS: '1000',
      FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX: '0',
      FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL: alertWebhook,
      FULLCYCLE_CONNECTOR_ALERT_COOLDOWN_MINUTES: '60',
    });
    assert((warnRun.status ?? 1) === 0, `phase21 warn run should exit 0${runErrorDetails(warnRun)}`);

    const warnReport = await readJson(reportFile);
    assert(warnReport?.status === 'warn', `expected warn report status in non-enforced run, got ${warnReport?.status}`);
    assert(events.length === 1, 'alert webhook should be suppressed by cooldown on second degraded run');

    await writeJson(telemetryFile, healthyTelemetry());

    const passRun = await runNode(SCRIPT, {
      FULLCYCLE_CONNECTOR_TELEMETRY_FILE: telemetryFile,
      FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE: dashboardFile,
      FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
      FULLCYCLE_CONNECTOR_WINDOW_RUNS: '10',
      FULLCYCLE_CONNECTOR_MIN_SAMPLES: '1',
      FULLCYCLE_CONNECTOR_ENFORCE_TARGETS: 'true',
      FULLCYCLE_CONNECTOR_EXIT_ON_INCIDENT: 'true',
      FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT: '95',
      FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX: '5',
      FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS: '1000',
      FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX: '0',
      FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL: alertWebhook,
      FULLCYCLE_CONNECTOR_ALERT_COOLDOWN_MINUTES: '60',
    });
    assert((passRun.status ?? 1) === 0, `phase21 healthy run should pass${runErrorDetails(passRun)}`);

    const passReport = await readJson(reportFile);
    const incidentsAfterPass = await readJson(incidentsFile);
    assert(passReport?.status === 'pass', `expected pass report status, got ${passReport?.status}`);
    assert(passReport?.incident === false, 'expected incident=false in healthy report');
    assert(!incidentsAfterPass?.activeIncidentId, 'expected active incident resolved after healthy run');

    console.log('[OK] phase21 drill connector runtime pass/fail/cooldown behavior validated');
    console.log(`[OK] phase21 drill alerts=${events.length} report=${reportFile}`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase21 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
