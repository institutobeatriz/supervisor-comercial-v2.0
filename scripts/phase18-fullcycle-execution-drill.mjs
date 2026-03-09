import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const EXECUTOR_SCRIPT = path.resolve(ROOT, 'scripts/phase18-fullcycle-executor.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase18-drill');

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

function createMockServer() {
  const events = [];
  const failOnce = new Set(['paging:reopen']);

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

      const endpoint = (req.url || '').includes('ticket') ? 'ticket' : ((req.url || '').includes('paging') ? 'paging' : 'unknown');
      const action = String(body?.action || 'unknown');
      events.push({
        endpoint,
        action,
        method: req.method || 'GET',
        incidentId: body?.incident?.id || null,
        actionKey: body?.actionRef?.key || null,
      });

      const failKey = `${endpoint}:${action}`;
      if (failOnce.has(failKey)) {
        failOnce.delete(failKey);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'transient failure' }));
        return;
      }

      if (endpoint === 'ticket') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          ticketKey: `TCK-${action.toUpperCase()}-${String(body?.incident?.id || 'na').toUpperCase()}`,
        }));
        return;
      }

      if (endpoint === 'paging') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          incidentId: `PG-${action.toUpperCase()}-${String(body?.incident?.id || 'na').toUpperCase()}`,
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

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const actionsFile = path.resolve(DRILL_DIR, 'fullcycle-actions.json');
  const actionsFailFile = path.resolve(DRILL_DIR, 'fullcycle-actions-fail.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const execStateFile = path.resolve(DRILL_DIR, 'fullcycle-execution-state.json');
  const execReportFile = path.resolve(DRILL_DIR, 'fullcycle-execution-report.json');
  const execDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-execution-dashboard.md');

  await fs.rm(execStateFile, { force: true });
  await fs.rm(execReportFile, { force: true });
  await fs.rm(execDashboardFile, { force: true });

  const now = Date.now();
  const openDetected = new Date(now - 30 * 60_000).toISOString();
  const resolvedDetected = new Date(now - 6 * 60 * 60_000).toISOString();
  const resolvedAt = new Date(now - 3 * 60 * 60_000).toISOString();
  const openDetected2 = new Date(now - 90 * 60_000).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    incidents: [
      {
        id: 'inc-a',
        status: 'open',
        startedAt: openDetected,
        detectedAt: openDetected,
        resolvedAt: null,
        severity: 'critical',
        maxSeverity: 'critical',
      },
      {
        id: 'inc-b',
        status: 'resolved',
        startedAt: resolvedDetected,
        detectedAt: resolvedDetected,
        resolvedAt,
        severity: 'warning',
        maxSeverity: 'warning',
      },
      {
        id: 'inc-c',
        status: 'open',
        startedAt: openDetected2,
        detectedAt: openDetected2,
        resolvedAt: null,
        severity: 'info',
        maxSeverity: 'info',
      },
    ],
  });

  await writeJson(stateFile, {
    version: 1,
    incidents: {
      'inc-a': {
        owner: 'owner-a',
        lastStatus: 'open',
        lastSeverity: 'critical',
        incident: { startedAt: openDetected, detectedAt: openDetected, resolvedAt: null },
        paging: { externalId: 'PG-A', openedAt: openDetected, resolvedAt: openDetected },
        ticket: { externalId: null, createdAt: null, resolvedAt: null },
        events: [],
      },
      'inc-b': {
        owner: 'owner-b',
        lastStatus: 'resolved',
        lastSeverity: 'warning',
        incident: { startedAt: resolvedDetected, detectedAt: resolvedDetected, resolvedAt },
        paging: { externalId: 'PG-B', openedAt: resolvedDetected, resolvedAt },
        ticket: { externalId: 'TCK-B', createdAt: resolvedDetected, resolvedAt: null },
        events: [],
      },
      'inc-c': {
        owner: 'owner-c',
        lastStatus: 'open',
        lastSeverity: 'info',
        incident: { startedAt: openDetected2, detectedAt: openDetected2, resolvedAt: null },
        paging: { externalId: null, openedAt: null, resolvedAt: null },
        ticket: { externalId: null, createdAt: null, resolvedAt: null },
        events: [],
      },
    },
  });

  const actions = [
    { type: 'create_remote_ticket', channel: 'ticket', incidentId: 'inc-a', blocking: true, applied: false },
    { type: 'remote_reopen_paging', channel: 'paging', incidentId: 'inc-a', remoteExternalId: 'PG-A', blocking: true, applied: false },
    { type: 'remote_resolve_ticket', channel: 'ticket', incidentId: 'inc-b', remoteExternalId: 'TCK-B', blocking: false, applied: false },
    { type: 'owner_sync_paging', channel: 'paging', incidentId: 'inc-a', localOwner: 'owner-a', remoteOwner: 'legacy-owner', blocking: false, applied: false },
    { type: 'link_local_external_id', channel: 'ticket', incidentId: 'inc-c', remoteExternalId: 'TCK-C-LINK', blocking: false, applied: false },
    { type: 'investigate_missing_remote_record', channel: 'paging', incidentId: 'inc-c', localExternalId: 'PG-MISS', blocking: false, applied: false },
    { type: 'orphan_remote_ticket', channel: 'ticket', incidentId: 'inc-orphan', remoteExternalId: 'TCK-ORPHAN', blocking: false, applied: false },
  ];
  await writeJson(actionsFile, {
    generatedAt: new Date(now).toISOString(),
    actions,
  });

  await writeJson(actionsFailFile, {
    generatedAt: new Date(now).toISOString(),
    actions: [
      { type: 'create_remote_paging', channel: 'paging', incidentId: 'inc-a', blocking: true, applied: false },
    ],
  });

  const { server, events } = createMockServer();
  const port = await listen(server);
  const pagingUrl = `http://127.0.0.1:${port}/paging`;
  const ticketUrl = `http://127.0.0.1:${port}/ticket`;

  try {
    const firstRun = await runNode(EXECUTOR_SCRIPT, {
      FULLCYCLE_ACTIONS_FILE: actionsFile,
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_MAX_RETRIES: '2',
      FULLCYCLE_EXEC_RETRY_BACKOFF_MS: '10',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'false',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'false',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'true',
    });
    assert((firstRun.status ?? 1) === 0, `first phase18 run should exit 0 (got ${firstRun.status})${runErrorDetails(firstRun)}`);

    const reportAfterFirst = await readJson(execReportFile);
    const stateAfterFirst = await readJson(stateFile);
    const execStateAfterFirst = await readJson(execStateFile);
    const actionsAfterFirst = await readJson(actionsFile);

    assert(reportAfterFirst?.status === 'pass', 'first run status should be pass');
    assert(reportAfterFirst?.totals?.success === 7, `expected 7 successful actions, got ${reportAfterFirst?.totals?.success}`);
    assert(Number(reportAfterFirst?.totals?.retried || 0) >= 1, 'expected at least one retry');
    assert(stateAfterFirst?.incidents?.['inc-c']?.ticket?.externalId === 'TCK-C-LINK', 'link_local_external_id should update ticket external id');
    assert(Boolean(stateAfterFirst?.incidents?.['inc-b']?.ticket?.resolvedAt), 'remote_resolve_ticket should set ticket resolvedAt');
    assert(stateAfterFirst?.incidents?.['inc-a']?.paging?.resolvedAt === null, 'remote_reopen_paging should clear paging resolvedAt');
    assert(Array.isArray(execStateAfterFirst?.runs) && execStateAfterFirst.runs.length >= 1, 'execution state should record at least one run');
    assert((actionsAfterFirst?.actions || []).every((item) => item?.applied === true), 'all actions should be marked as applied after first run');

    const reopenPagingCalls = events.filter((event) => event.endpoint === 'paging' && event.action === 'reopen');
    assert(reopenPagingCalls.length === 2, `expected 2 paging reopen calls (retry), got ${reopenPagingCalls.length}`);
    const remoteCallsAfterFirst = events.length;
    assert(remoteCallsAfterFirst === 7, `expected 7 remote calls in first run, got ${remoteCallsAfterFirst}`);

    const secondRun = await runNode(EXECUTOR_SCRIPT, {
      FULLCYCLE_ACTIONS_FILE: actionsFile,
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_MAX_RETRIES: '2',
      FULLCYCLE_EXEC_RETRY_BACKOFF_MS: '10',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'false',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'false',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'true',
    });
    assert((secondRun.status ?? 1) === 0, `second phase18 run should exit 0 (got ${secondRun.status})${runErrorDetails(secondRun)}`);

    const reportAfterSecond = await readJson(execReportFile);
    assert(reportAfterSecond?.totals?.skipped === 7, `expected 7 skipped actions on second run, got ${reportAfterSecond?.totals?.skipped}`);
    assert(events.length === remoteCallsAfterFirst, 'second run should not create new remote calls');

    const failRun = await runNode(EXECUTOR_SCRIPT, {
      FULLCYCLE_ACTIONS_FILE: actionsFailFile,
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      ONCALL_PAGING_WEBHOOK_URL: '',
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_MAX_RETRIES: '0',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'false',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'false',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'false',
    });
    assert((failRun.status ?? 0) !== 0, 'failure run should exit non-zero when blocking endpoint is missing');

    const reportAfterFail = await readJson(execReportFile);
    assert(reportAfterFail?.status === 'fail', `expected fail status in strict run, got ${reportAfterFail?.status}`);
    assert(Number(reportAfterFail?.totals?.blockingFailed || 0) >= 1, 'strict run should register blocking failure');

    console.log('[OK] phase18 drill execution, retry, idempotency and strict failure validated');
    console.log(`[OK] phase18 drill remote-calls=${events.length} report=${execReportFile}`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase18 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
