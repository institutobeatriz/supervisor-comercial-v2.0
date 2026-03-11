import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const LOOP_SCRIPT = path.resolve(ROOT, 'scripts/phase19-fullcycle-convergence.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase19-drill');

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

      const endpoint = (req.url || '').includes('ticket') ? 'ticket' : ((req.url || '').includes('paging') ? 'paging' : 'unknown');
      events.push({
        endpoint,
        action: body?.action || null,
        incidentId: body?.incident?.id || null,
      });

      if (endpoint === 'ticket') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ticketKey: `TCK-${String(body?.action || 'NA').toUpperCase()}-${String(body?.incident?.id || 'NA').toUpperCase()}` }));
        return;
      }

      if (endpoint === 'paging') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, incidentId: `PG-${String(body?.action || 'NA').toUpperCase()}-${String(body?.incident?.id || 'NA').toUpperCase()}` }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
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

async function seedScenario({ incidentsFile, stateFile, snapshotFile, governanceFile, rotationFile, calendarFile }) {
  const now = Date.now();
  const detectedAt = new Date(now - 30 * 60_000).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    incidents: [
      {
        id: 'inc-loop',
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
      'inc-loop': {
        owner: 'oncall-lead',
        ownerSource: 'rotation',
        lastStatus: 'open',
        lastSeverity: 'critical',
        sla: { tier: 'P1', ackTargetMinutes: 5, resolveTargetMinutes: 60 },
        incident: { startedAt: detectedAt, detectedAt, resolvedAt: null },
        paging: { externalId: 'PG-LOOP', openedAt: detectedAt, resolvedAt: detectedAt },
        ticket: { externalId: 'TCK-LOOP', createdAt: detectedAt, resolvedAt: detectedAt },
        events: [],
      },
    },
  });

  await writeJson(snapshotFile, {
    generatedAt: new Date(now).toISOString(),
    tickets: [
      { externalId: 'TCK-LOOP', incidentId: 'inc-loop', status: 'resolved', owner: 'legacy-owner' },
    ],
    paging: [
      { externalId: 'PG-LOOP', incidentId: 'inc-loop', status: 'resolved', owner: 'legacy-owner' },
    ],
  });

  await writeJson(governanceFile, {
    generatedAt: new Date(now).toISOString(),
    status: 'pass',
    reconciliation: { drifts: [] },
    violations: [],
  });

  await writeJson(rotationFile, {
    timezone: 'America/Sao_Paulo',
    rules: [
      {
        id: 'always',
        days: [0, 1, 2, 3, 4, 5, 6],
        start: '00:00',
        end: '23:59',
        ownerByTier: {
          P1: 'oncall-lead',
          P2: 'oncall-p2',
          P3: 'oncall-p3',
        },
      },
    ],
  });

  await writeJson(calendarFile, {
    timezone: 'America/Sao_Paulo',
    overrides: [],
    holidays: [],
  });
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const governanceFile = path.resolve(DRILL_DIR, 'governance-report.json');
  const rotationFile = path.resolve(DRILL_DIR, 'oncall-rotation.json');
  const calendarFile = path.resolve(DRILL_DIR, 'oncall-calendar.json');
  const actionsFile = path.resolve(DRILL_DIR, 'fullcycle-actions.json');
  const fullcycleReportFile = path.resolve(DRILL_DIR, 'fullcycle-report.json');
  const fullcycleDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-dashboard.md');
  const historyFile = path.resolve(DRILL_DIR, 'governance-history.json');
  const execStateFile = path.resolve(DRILL_DIR, 'fullcycle-execution-state.json');
  const execReportFile = path.resolve(DRILL_DIR, 'fullcycle-execution-report.json');
  const execDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-execution-dashboard.md');
  const loopReportFile = path.resolve(DRILL_DIR, 'fullcycle-convergence-report.json');
  const loopDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-convergence-dashboard.md');

  await fs.rm(actionsFile, { force: true });
  await fs.rm(fullcycleReportFile, { force: true });
  await fs.rm(loopReportFile, { force: true });
  await fs.rm(execStateFile, { force: true });
  await fs.rm(execReportFile, { force: true });

  const { server, events } = createMockServer();
  const port = await listen(server);
  const pagingUrl = `http://127.0.0.1:${port}/paging`;
  const ticketUrl = `http://127.0.0.1:${port}/ticket`;

  try {
    await seedScenario({
      incidentsFile,
      stateFile,
      snapshotFile,
      governanceFile,
      rotationFile,
      calendarFile,
    });

    const passRun = await runNode(LOOP_SCRIPT, {
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      ITSM_SNAPSHOT_FILE: snapshotFile,
      GOVERNANCE_REPORT_FILE: governanceFile,
      ONCALL_ROTATION_FILE: rotationFile,
      ONCALL_CALENDAR_FILE: calendarFile,
      FULLCYCLE_ACTIONS_FILE: actionsFile,
      FULLCYCLE_REPORT_FILE: fullcycleReportFile,
      FULLCYCLE_DASHBOARD_FILE: fullcycleDashboardFile,
      GOVERNANCE_HISTORY_FILE: historyFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      FULLCYCLE_CONVERGENCE_REPORT_FILE: loopReportFile,
      FULLCYCLE_CONVERGENCE_DASHBOARD_FILE: loopDashboardFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      FULLCYCLE_LOOP_MAX_CYCLES: '2',
      FULLCYCLE_LOOP_PATCH_SNAPSHOT: 'true',
      FULLCYCLE_LOOP_ENFORCE_TARGETS: 'true',
      FULLCYCLE_LOOP_REQUIRE_IMPROVEMENT: 'true',
      FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_ABS: '1',
      FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_PCT: '40',
      FULLCYCLE_LOOP_REQUIRE_ZERO_BLOCKING: 'true',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_MAX_RETRIES: '1',
      FULLCYCLE_EXEC_RETRY_BACKOFF_MS: '10',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'false',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'false',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'true',
    });
    assert((passRun.status ?? 1) === 0, `phase19 pass run should exit 0 (got ${passRun.status})${runErrorDetails(passRun)}`);

    const passReport = await readJson(loopReportFile);
    assert(passReport?.status === 'pass', `expected pass report status, got ${passReport?.status}`);
    assert(Number(passReport?.metrics?.initial?.pending ?? 0) >= 2, `expected initial pending >= 2, got ${passReport?.metrics?.initial?.pending}`);
    assert(Number(passReport?.metrics?.final?.pending ?? -1) === 0, `expected final pending = 0, got ${passReport?.metrics?.final?.pending}`);
    assert(Number(passReport?.metrics?.pendingReductionAbs ?? 0) >= 2, `expected pending reduction >= 2, got ${passReport?.metrics?.pendingReductionAbs}`);

    const reopenTicketCalls = events.filter((event) => event.endpoint === 'ticket' && event.action === 'reopen');
    const reopenPagingCalls = events.filter((event) => event.endpoint === 'paging' && event.action === 'reopen');
    assert(reopenTicketCalls.length >= 1, 'expected at least one ticket reopen call');
    assert(reopenPagingCalls.length >= 1, 'expected at least one paging reopen call');

    await fs.rm(execStateFile, { force: true });
    await seedScenario({
      incidentsFile,
      stateFile,
      snapshotFile,
      governanceFile,
      rotationFile,
      calendarFile,
    });

    const failRun = await runNode(LOOP_SCRIPT, {
      MONITOR_INCIDENTS_FILE: incidentsFile,
      INCIDENT_AUTOMATION_STATE_FILE: stateFile,
      ITSM_SNAPSHOT_FILE: snapshotFile,
      GOVERNANCE_REPORT_FILE: governanceFile,
      ONCALL_ROTATION_FILE: rotationFile,
      ONCALL_CALENDAR_FILE: calendarFile,
      FULLCYCLE_ACTIONS_FILE: actionsFile,
      FULLCYCLE_REPORT_FILE: fullcycleReportFile,
      FULLCYCLE_DASHBOARD_FILE: fullcycleDashboardFile,
      GOVERNANCE_HISTORY_FILE: historyFile,
      FULLCYCLE_EXECUTION_STATE_FILE: execStateFile,
      FULLCYCLE_EXECUTION_REPORT_FILE: execReportFile,
      FULLCYCLE_EXECUTION_DASHBOARD_FILE: execDashboardFile,
      FULLCYCLE_CONVERGENCE_REPORT_FILE: loopReportFile,
      FULLCYCLE_CONVERGENCE_DASHBOARD_FILE: loopDashboardFile,
      ONCALL_PAGING_WEBHOOK_URL: pagingUrl,
      ITSM_TICKET_WEBHOOK_URL: ticketUrl,
      FULLCYCLE_LOOP_MAX_CYCLES: '1',
      FULLCYCLE_LOOP_PATCH_SNAPSHOT: 'false',
      FULLCYCLE_LOOP_STOP_WHEN_STABLE: 'true',
      FULLCYCLE_LOOP_ENFORCE_TARGETS: 'true',
      FULLCYCLE_LOOP_REQUIRE_IMPROVEMENT: 'true',
      FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_ABS: '1',
      FULLCYCLE_LOOP_REQUIRE_ZERO_BLOCKING: 'true',
      FULLCYCLE_EXEC_REQUIRE_ENDPOINTS: 'true',
      FULLCYCLE_EXEC_FAIL_ON_ERROR: 'true',
      FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR: 'true',
      FULLCYCLE_EXEC_DRY_RUN: 'false',
      FULLCYCLE_EXEC_MAX_RETRIES: '0',
      FULLCYCLE_EXEC_REPLAY_SUCCESS: 'true',
      FULLCYCLE_EXEC_REPLAY_APPLIED: 'true',
      FULLCYCLE_EXEC_WRITE_ACTIONS_FILE: 'true',
    });
    assert((failRun.status ?? 0) !== 0, 'phase19 strict fail run should exit non-zero');

    const failReport = await readJson(loopReportFile);
    const violationCodes = new Set((failReport?.violations || []).map((item) => item?.code));
    assert(violationCodes.has('pending_not_reduced'), 'expected pending_not_reduced violation in strict fail run');

    console.log('[OK] phase19 drill convergence loop pass/fail behavior validated');
    console.log(`[OK] phase19 drill events=${events.length} report=${loopReportFile}`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase19 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
