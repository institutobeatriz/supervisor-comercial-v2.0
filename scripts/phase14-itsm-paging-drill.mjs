import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const AUTOMATION_SCRIPT = path.resolve(ROOT, 'scripts/phase14-itsm-paging-sync.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase14-drill');

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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
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
        method: req.method || 'GET',
        url: req.url || '/',
        body,
      });

      const action = body?.action || 'unknown';
      if ((req.url || '').includes('ticket')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ticketKey: `TCK-${action.toUpperCase()}` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, incidentId: `PG-${action.toUpperCase()}` }));
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

  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const reportFile = path.resolve(DRILL_DIR, 'incident-automation-report.json');

  await fs.rm(stateFile, { force: true });
  await fs.rm(reportFile, { force: true });

  const openIncident = {
    version: 1,
    activeIncidentId: 'inc-phase14-drill',
    incidents: [
      {
        id: 'inc-phase14-drill',
        status: 'open',
        startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        detectedAt: new Date(Date.now() - 60 * 1000).toISOString(),
        resolvedAt: null,
        severity: 'critical',
        maxSeverity: 'critical',
        mttdMs: 60_000,
        criticalFailures: [{ name: 'api_health', status: null, message: 'connect ECONNREFUSED' }],
        sloBreaches: [],
      },
    ],
  };
  await writeJson(incidentsFile, openIncident);

  const { server, events } = createMockServer();
  const port = await listen(server);
  const pagingUrl = `http://127.0.0.1:${port}/paging`;
  const ticketUrl = `http://127.0.0.1:${port}/ticket`;

  try {
    const openRun = await runNode(AUTOMATION_SCRIPT, {
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      INCIDENT_AUTOMATION_REPORT_FILE: reportFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      INCIDENT_AUTOMATION_DRY_RUN: 'false',
      INCIDENT_AUTOMATION_FAIL_ON_ERROR: 'true',
      INCIDENT_AUTOMATION_REQUIRE_ENDPOINTS: 'true',
    });

    assert((openRun.status ?? 1) === 0, `open run should exit 0 (got ${openRun.status})${runErrorDetails(openRun)}`);

    const stateAfterOpen = await readJson(stateFile);
    const openRecord = stateAfterOpen?.incidents?.['inc-phase14-drill'];
    assert(Boolean(openRecord), 'incident record should be persisted after open');
    assert(Boolean(openRecord?.paging?.openedAt), 'paging openedAt should be set');
    assert(Boolean(openRecord?.ticket?.createdAt), 'ticket createdAt should be set');

    const openPagingCalls = events.filter((event) => event.url === '/paging' && event.body?.action === 'open');
    const openTicketCalls = events.filter((event) => event.url === '/ticket' && event.body?.action === 'open');
    assert(openPagingCalls.length === 1, `expected 1 paging open call, got ${openPagingCalls.length}`);
    assert(openTicketCalls.length === 1, `expected 1 ticket open call, got ${openTicketCalls.length}`);

    const resolvedIncident = {
      ...openIncident,
      activeIncidentId: null,
      incidents: [
        {
          ...openIncident.incidents[0],
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          durationMs: 120_000,
        },
      ],
    };
    await writeJson(incidentsFile, resolvedIncident);

    const resolveRun = await runNode(AUTOMATION_SCRIPT, {
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      INCIDENT_AUTOMATION_REPORT_FILE: reportFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      INCIDENT_AUTOMATION_DRY_RUN: 'false',
      INCIDENT_AUTOMATION_FAIL_ON_ERROR: 'true',
      INCIDENT_AUTOMATION_REQUIRE_ENDPOINTS: 'true',
    });

    assert((resolveRun.status ?? 1) === 0, `resolve run should exit 0 (got ${resolveRun.status})${runErrorDetails(resolveRun)}`);

    const stateAfterResolve = await readJson(stateFile);
    const resolvedRecord = stateAfterResolve?.incidents?.['inc-phase14-drill'];
    assert(Boolean(resolvedRecord?.paging?.resolvedAt), 'paging resolvedAt should be set');
    assert(Boolean(resolvedRecord?.ticket?.resolvedAt), 'ticket resolvedAt should be set');

    const resolvePagingCalls = events.filter((event) => event.url === '/paging' && event.body?.action === 'resolve');
    const resolveTicketCalls = events.filter((event) => event.url === '/ticket' && event.body?.action === 'resolve');
    assert(resolvePagingCalls.length === 1, `expected 1 paging resolve call, got ${resolvePagingCalls.length}`);
    assert(resolveTicketCalls.length === 1, `expected 1 ticket resolve call, got ${resolveTicketCalls.length}`);

    const idempotentRun = await runNode(AUTOMATION_SCRIPT, {
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      INCIDENT_AUTOMATION_REPORT_FILE: reportFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      INCIDENT_AUTOMATION_DRY_RUN: 'false',
      INCIDENT_AUTOMATION_FAIL_ON_ERROR: 'true',
      INCIDENT_AUTOMATION_REQUIRE_ENDPOINTS: 'true',
    });

    assert((idempotentRun.status ?? 1) === 0, `idempotent run should exit 0 (got ${idempotentRun.status})${runErrorDetails(idempotentRun)}`);
    const resolvePagingCallsAfter = events.filter((event) => event.url === '/paging' && event.body?.action === 'resolve');
    const resolveTicketCallsAfter = events.filter((event) => event.url === '/ticket' && event.body?.action === 'resolve');
    assert(resolvePagingCallsAfter.length === 1, 'idempotent run should not duplicate paging resolve');
    assert(resolveTicketCallsAfter.length === 1, 'idempotent run should not duplicate ticket resolve');

    console.log('[OK] phase14 drill paging/ticket open+resolve flow validated');
    console.log(`[OK] phase14 drill requests=${events.length} report=${reportFile}`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase14 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
