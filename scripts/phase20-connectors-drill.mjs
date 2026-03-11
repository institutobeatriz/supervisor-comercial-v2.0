import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const EXECUTOR_SCRIPT = path.resolve(ROOT, 'scripts/phase18-fullcycle-executor.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase20-drill');

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code, signal) => {
      resolve({
        status: code,
        signal,
        stdout,
        stderr,
      });
    });
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

      const endpoint = (req.url || '').includes('ticket')
        ? 'ticket'
        : ((req.url || '').includes('paging') ? 'paging' : 'unknown');

      events.push({
        endpoint,
        method: req.method || 'GET',
        action: body?.action || null,
        provider: body?.provider || null,
        incidentId: body?.incident?.id || null,
        body,
      });

      if (endpoint === 'ticket') {
        const validJira = Boolean(body?.provider === 'jira' && body?.jira?.projectKey && body?.jira?.issueType);
        if (!validJira) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid jira contract' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          issueKey: `SUP-${String(body?.action || 'NA').toUpperCase()}-1`,
        }));
        return;
      }

      if (endpoint === 'paging') {
        const validPd = Boolean(body?.provider === 'pagerduty' && body?.pagerduty?.routing_key && body?.pagerduty?.event_action);
        if (!validPd) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid pagerduty contract' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          incidentId: `PG-${String(body?.action || 'NA').toUpperCase()}-1`,
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unknown endpoint' }));
    });
  });

  return { server, events };
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('invalid server address'));
        return;
      }
      resolve(address.port);
    });
    server.on('error', reject);
  });
}

async function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const actionsFile = path.resolve(DRILL_DIR, 'fullcycle-actions.json');
  const actionsInvalidFile = path.resolve(DRILL_DIR, 'fullcycle-actions-invalid.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const execStateFile = path.resolve(DRILL_DIR, 'fullcycle-execution-state.json');
  const execReportFile = path.resolve(DRILL_DIR, 'fullcycle-execution-report.json');
  const execDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-execution-dashboard.md');
  const connectorTelemetryFile = path.resolve(DRILL_DIR, 'fullcycle-connector-telemetry.json');
  const connectorDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors.md');

  await fs.rm(execStateFile, { force: true });
  await fs.rm(execReportFile, { force: true });
  await fs.rm(execDashboardFile, { force: true });
  await fs.rm(connectorTelemetryFile, { force: true });
  await fs.rm(connectorDashboardFile, { force: true });

  const now = Date.now();
  const detectedAt = new Date(now - (45 * 60_000)).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    incidents: [
      {
        id: 'inc-20',
        status: 'open',
        startedAt: detectedAt,
        detectedAt,
        resolvedAt: null,
        severity: 'critical',
        maxSeverity: 'critical',
      },
    ],
  });

  await writeJson(stateFile, {
    version: 1,
    incidents: {
      'inc-20': {
        owner: 'oncall-a',
        lastStatus: 'open',
        lastSeverity: 'critical',
        incident: { startedAt: detectedAt, detectedAt, resolvedAt: null },
        paging: { externalId: null, openedAt: null, resolvedAt: null },
        ticket: { externalId: null, createdAt: null, resolvedAt: null },
        events: [],
      },
    },
  });

  await writeJson(actionsFile, {
    generatedAt: new Date(now).toISOString(),
    actions: [
      { type: 'create_remote_ticket', channel: 'ticket', incidentId: 'inc-20', blocking: true, applied: false },
      { type: 'create_remote_paging', channel: 'paging', incidentId: 'inc-20', blocking: true, applied: false },
      { type: 'owner_sync_ticket', channel: 'ticket', incidentId: 'inc-20', localOwner: 'oncall-a', remoteOwner: 'legacy-owner', blocking: false, applied: false },
    ],
  });

  await writeJson(actionsInvalidFile, {
    generatedAt: new Date(now).toISOString(),
    actions: [
      { type: 'create_remote_ticket', channel: 'ticket', incidentId: '', blocking: true, applied: false },
    ],
  });

  const { server, events } = createMockServer();
  const port = await listen(server);
  const pagingUrl = `http://127.0.0.1:${port}/paging`;
  const ticketUrl = `http://127.0.0.1:${port}/ticket`;

  try {
    const successRun = await runNode(EXECUTOR_SCRIPT, {
      FULLCYCLE_ACTIONS_FILE: actionsFile,
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      FULLCYCLE_CONNECTOR_TELEMETRY_FILE: connectorTelemetryFile,
      FULLCYCLE_CONNECTOR_DASHBOARD_FILE: connectorDashboardFile,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_CONNECTOR_PROVIDER: 'jira',
      ONCALL_CONNECTOR_PROVIDER: 'pagerduty',
      ITSM_JIRA_PROJECT_KEY: 'SUP',
      ITSM_JIRA_ISSUE_TYPE: 'Incident',
      ONCALL_PAGERDUTY_ROUTING_KEY: 'pd-key',
      FULLCYCLE_CONNECTOR_VALIDATE_CONTRACT: 'true',
      FULLCYCLE_CONNECTOR_ENFORCE_REQUEST_CONTRACT: 'true',
      FULLCYCLE_CONNECTOR_ENFORCE_RESPONSE_CONTRACT: 'true',
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_MAX_RETRIES: '1',
      FULLCYCLE_EXEC_RETRY_BACKOFF_MS: '10',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'false',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'false',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'true',
    });
    assert((successRun.status ?? 1) === 0, `phase20 success run should exit 0 (got ${successRun.status})${runErrorDetails(successRun)}`);

    const successReport = await readJson(execReportFile);
    const telemetry = await readJson(connectorTelemetryFile);
    const dashboard = await fs.readFile(connectorDashboardFile, 'utf-8');

    assert(successReport?.status === 'pass', `expected pass status, got ${successReport?.status}`);
    assert(Number(successReport?.contract?.requestErrors || 0) === 0, `expected 0 request contract errors, got ${successReport?.contract?.requestErrors}`);
    assert(Number(successReport?.contract?.responseErrors || 0) === 0, `expected 0 response contract errors, got ${successReport?.contract?.responseErrors}`);
    assert(Number(successReport?.connectors?.['itsm:jira']?.success || 0) >= 2, 'expected ticket connector to succeed at least 2 actions');
    assert(Number(successReport?.connectors?.['oncall:pagerduty']?.success || 0) >= 1, 'expected paging connector to succeed at least 1 action');
    assert(Array.isArray(telemetry?.history) && telemetry.history.length >= 1, 'expected telemetry history entry after success run');
    assert(dashboard.includes('itsm:jira') && dashboard.includes('oncall:pagerduty'), 'connector dashboard should include provider keys');

    const jiraCalls = events.filter((event) => event.endpoint === 'ticket');
    const pagerDutyCalls = events.filter((event) => event.endpoint === 'paging');
    assert(jiraCalls.length >= 1, 'expected at least one ticket call');
    assert(pagerDutyCalls.length >= 1, 'expected at least one paging call');
    assert(jiraCalls.every((event) => event.body?.jira?.projectKey === 'SUP'), 'all ticket calls should carry jira projectKey');
    assert(pagerDutyCalls.every((event) => event.body?.pagerduty?.routing_key === 'pd-key'), 'all paging calls should carry pagerduty routing key');

    const failRun = await runNode(EXECUTOR_SCRIPT, {
      FULLCYCLE_ACTIONS_FILE: actionsInvalidFile,
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      FULLCYCLE_CONNECTOR_TELEMETRY_FILE: connectorTelemetryFile,
      FULLCYCLE_CONNECTOR_DASHBOARD_FILE: connectorDashboardFile,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_CONNECTOR_PROVIDER: 'jira',
      ONCALL_CONNECTOR_PROVIDER: 'pagerduty',
      ITSM_JIRA_PROJECT_KEY: 'SUP',
      ITSM_JIRA_ISSUE_TYPE: 'Incident',
      ONCALL_PAGERDUTY_ROUTING_KEY: 'pd-key',
      FULLCYCLE_CONNECTOR_VALIDATE_CONTRACT: 'true',
      FULLCYCLE_CONNECTOR_ENFORCE_REQUEST_CONTRACT: 'true',
      FULLCYCLE_CONNECTOR_ENFORCE_RESPONSE_CONTRACT: 'true',
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_MAX_RETRIES: '0',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'true',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'true',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'false',
    });
    assert((failRun.status ?? 0) !== 0, 'phase20 contract fail run should exit non-zero');

    const failReport = await readJson(execReportFile);
    const telemetryAfterFail = await readJson(connectorTelemetryFile);
    const reasons = new Set((failReport?.failures || []).map((item) => item?.reason));
    assert(failReport?.status === 'fail', `expected fail status after invalid contract run, got ${failReport?.status}`);
    assert(Number(failReport?.contract?.requestErrors || 0) >= 1, 'expected at least one request contract error');
    assert(reasons.has('contract_request_invalid'), 'expected contract_request_invalid failure reason');
    assert(Array.isArray(telemetryAfterFail?.history) && telemetryAfterFail.history.length >= 2, 'telemetry history should register success and fail runs');

    console.log('[OK] phase20 drill provider adapters, contract validation and telemetry validated');
    console.log(`[OK] phase20 drill events=${events.length} report=${execReportFile}`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase20 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
