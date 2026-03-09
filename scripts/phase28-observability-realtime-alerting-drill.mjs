import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase28-observability-realtime-alerting.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase28-drill');

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

async function createMockServer() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      requests.push({
        path: req.url || '/',
        method: req.method || 'GET',
        body,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    requests,
    reset() {
      requests.splice(0, requests.length);
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const streamReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-realtime-report.json');
  const apiGovernanceReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-governance-report.json');
  const alertStateFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-alerting-state.json');
  const alertReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-alerting-report.json');
  const alertDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability-alerting.md');
  const alertAuditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-alerting-audit.jsonl');
  const apiSlaHistoryFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-sla-history.json');
  const apiSlaDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability-api-sla.md');

  await fs.rm(alertStateFile, { force: true });
  await fs.rm(alertReportFile, { force: true });
  await fs.rm(alertDashboardFile, { force: true });
  await fs.rm(alertAuditFile, { force: true });
  await fs.rm(apiSlaHistoryFile, { force: true });
  await fs.rm(apiSlaDashboardFile, { force: true });

  const mock = await createMockServer();
  const commonEnv = {
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE: apiGovernanceReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE: alertStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE: alertReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DASHBOARD_FILE: alertDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_AUDIT_FILE: alertAuditFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: apiSlaHistoryFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_DASHBOARD_FILE: apiSlaDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_WEBHOOK_URL: `${mock.baseUrl}/webhook`,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_SLACK_WEBHOOK_URL: `${mock.baseUrl}/slack`,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DISCORD_WEBHOOK_URL: `${mock.baseUrl}/discord`,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_BOT_TOKEN: 'drill-bot-token',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_CHAT_ID: '123456',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_THREAD_ID: '10',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_BASE_URL: mock.baseUrl,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TIMEOUT_MS: '3000',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_COOLDOWN_MINUTES: '0',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ONLY_ON_NEW: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_NOTIFY_RESOLVED: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_MAX_ACTIVE_ISSUES: '20',
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_MAX_POINTS: '50',
    FULLCYCLE_CONNECTOR_OBS_API_SLA_MIN_AVAILABILITY_PCT: '95',
    FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_LATENCY_MS: '2000',
    FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_PAYLOAD_AGE_MIN: '120',
    FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_BLOCKING_VIOLATIONS: '0',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_STREAM_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_API_GOVERNANCE_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DRY_RUN: 'false',
  };

  // PASS scenario
  await writeJson(streamReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: { activeIssues: 0, blockingViolations: 0 },
    violations: [],
  });
  await writeJson(apiGovernanceReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: {
      endpointsChecked: 5,
      endpointsPassed: 5,
      worstLatencyMs: 700,
      avgLatencyMs: 300,
      observedPayloadAgeMinutes: 30,
      blockingViolations: 0,
      violations: 0,
    },
    violations: [],
  });

  mock.reset();
  const passRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS: 'true',
  });
  assert((passRun.status ?? 1) === 0, 'phase28 pass run should exit 0');
  const passReport = await readJson(alertReportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert((passReport?.summary?.activeIssues || 0) === 0, `expected activeIssues=0, got ${passReport?.summary?.activeIssues}`);
  assert((passReport?.summary?.dispatchAttempted || false) === false, 'expected no dispatch in pass scenario');
  assert(mock.requests.length === 0, `expected no outbound request in pass scenario, got ${mock.requests.length}`);

  // FAIL scenario (with fanout)
  await writeJson(streamReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    summary: { activeIssues: 2, blockingViolations: 1 },
    violations: [
      {
        source: 'stream',
        code: 'stream_policy_failed',
        blocking: true,
        severity: 'critical',
        message: 'stream policy failed',
      },
    ],
  });
  await writeJson(apiGovernanceReportFile, {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    summary: {
      endpointsChecked: 5,
      endpointsPassed: 3,
      worstLatencyMs: 5000,
      avgLatencyMs: 1900,
      observedPayloadAgeMinutes: 300,
      blockingViolations: 2,
      violations: 4,
    },
    violations: [
      { code: 'endpoint_contract_invalid_summary', blocking: true, message: 'bad summary contract' },
    ],
  });

  mock.reset();
  const failRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS: 'true',
  });
  assert((failRun.status ?? 0) !== 0, 'phase28 fail run should exit non-zero');
  const failReport = await readJson(alertReportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(codes.has('stream_not_pass'), 'expected stream_not_pass violation');
  assert(codes.has('api_governance_not_pass'), 'expected api_governance_not_pass violation');
  assert(codes.has('api_sla_availability_below_target'), 'expected api_sla_availability_below_target violation');
  assert(codes.has('api_sla_latency_above_target'), 'expected api_sla_latency_above_target violation');
  assert(codes.has('api_sla_payload_age_above_target'), 'expected api_sla_payload_age_above_target violation');
  assert(codes.has('api_sla_blocking_violations_above_target'), 'expected api_sla_blocking_violations_above_target violation');
  assert(mock.requests.length >= 4, `expected fanout requests >=4, got ${mock.requests.length}`);

  // DEDUPE scenario (same issues should not dispatch again)
  mock.reset();
  const dedupeRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS: 'false',
  });
  assert((dedupeRun.status ?? 1) === 0, 'phase28 dedupe run should exit 0');
  const dedupeReport = await readJson(alertReportFile);
  assert(dedupeReport?.status === 'warn', `expected warn status in dedupe run, got ${dedupeReport?.status}`);
  assert((dedupeReport?.summary?.dispatchAttempted || false) === false, 'expected no dispatch in dedupe run');
  assert(mock.requests.length === 0, `expected no outbound request in dedupe run, got ${mock.requests.length}`);

  await mock.close();

  console.log('[OK] phase28 drill realtime alerting pass/fail fanout and dedupe validated');
  console.log(`[OK] phase28 drill report=${alertReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase28 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
