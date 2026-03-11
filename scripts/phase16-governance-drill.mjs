import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GOVERNANCE_SCRIPT = path.resolve(ROOT, 'scripts/phase16-enterprise-governance.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase16-drill');

function runNode(scriptPath, env) {
  return spawnSync('node', [scriptPath], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
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

async function readText(filePath) {
  return fs.readFile(filePath, 'utf-8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const execReportFile = path.resolve(DRILL_DIR, 'executive-sla-report.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const rotationFile = path.resolve(DRILL_DIR, 'oncall-rotation.json');
  const governanceReportFile = path.resolve(DRILL_DIR, 'governance-report.json');
  const governanceDashboardFile = path.resolve(DRILL_DIR, 'governance-dashboard.md');

  await fs.rm(governanceReportFile, { force: true });
  await fs.rm(governanceDashboardFile, { force: true });

  const now = Date.now();
  const p1Detected = new Date(now - 30 * 60_000).toISOString();
  const p1Started = new Date(now - 35 * 60_000).toISOString();
  const p2Detected = new Date(now - 6 * 60 * 60_000).toISOString();
  const p2Started = new Date(now - 7 * 60 * 60_000).toISOString();
  const p2Resolved = new Date(now - 2 * 60 * 60_000).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-p1-open',
    incidents: [
      {
        id: 'inc-p1-open',
        status: 'open',
        startedAt: p1Started,
        detectedAt: p1Detected,
        resolvedAt: null,
        severity: 'critical',
        maxSeverity: 'critical',
      },
      {
        id: 'inc-p2-resolved',
        status: 'resolved',
        startedAt: p2Started,
        detectedAt: p2Detected,
        resolvedAt: p2Resolved,
        severity: 'warning',
        maxSeverity: 'warning',
      },
    ],
  });

  await writeJson(stateFile, {
    version: 1,
    incidents: {
      'inc-p1-open': {
        owner: null,
        ownerSource: null,
        sla: { tier: 'P1', ackTargetMinutes: 5, resolveTargetMinutes: 60 },
        incident: {
          startedAt: p1Started,
          detectedAt: p1Detected,
          resolvedAt: null,
          lastSeenAt: new Date(now - 2 * 60_000).toISOString(),
        },
        paging: {
          openedAt: new Date(now - 8 * 60_000).toISOString(),
          resolvedAt: null,
          externalId: 'PG-1001',
        },
        ticket: {
          createdAt: new Date(now - 8 * 60_000).toISOString(),
          resolvedAt: null,
          externalId: 'TCK-1001',
        },
        events: [
          { timestamp: new Date(now - 8 * 60_000).toISOString(), channel: 'paging', action: 'open', ok: true, status: 200 },
          { timestamp: new Date(now - 8 * 60_000).toISOString(), channel: 'itsm', action: 'open', ok: true, status: 200 },
        ],
      },
      'inc-p2-resolved': {
        owner: null,
        ownerSource: null,
        sla: { tier: 'P2', ackTargetMinutes: 15, resolveTargetMinutes: 240 },
        incident: {
          startedAt: p2Started,
          detectedAt: p2Detected,
          resolvedAt: p2Resolved,
          lastSeenAt: p2Resolved,
        },
        paging: {
          openedAt: new Date(now - 5 * 60 * 60_000).toISOString(),
          resolvedAt: p2Resolved,
          externalId: 'PG-2001',
        },
        ticket: {
          createdAt: new Date(now - 5 * 60 * 60_000).toISOString(),
          resolvedAt: p2Resolved,
          externalId: 'TCK-2001',
        },
        events: [
          { timestamp: new Date(now - 5 * 60 * 60_000).toISOString(), channel: 'paging', action: 'open', ok: true, status: 200 },
          { timestamp: new Date(now - 5 * 60 * 60_000).toISOString(), channel: 'itsm', action: 'open', ok: true, status: 200 },
          { timestamp: p2Resolved, channel: 'paging', action: 'resolve', ok: true, status: 200 },
          { timestamp: p2Resolved, channel: 'itsm', action: 'resolve', ok: true, status: 200 },
        ],
      },
    },
  });

  await writeJson(execReportFile, {
    generatedAt: new Date(now).toISOString(),
    totals: {
      incidents: 2,
      open: 1,
      resolved: 1,
    },
  });

  await writeJson(snapshotFile, {
    generatedAt: new Date(now).toISOString(),
    tickets: [
      { externalId: 'TCK-1001', incidentId: 'inc-p1-open', status: 'resolved', owner: 'team-p1' },
      { externalId: 'TCK-2001', incidentId: 'inc-p2-resolved', status: 'open', owner: 'team-p2' },
      { externalId: 'TCK-ORPHAN', incidentId: 'inc-orphan', status: 'open', owner: 'team-x' },
    ],
    paging: [
      { externalId: 'PG-1001', incidentId: 'inc-p1-open', status: 'open', owner: 'team-p1' },
      { externalId: 'PG-2001', incidentId: 'inc-p2-resolved', status: 'resolved', owner: 'team-p2' },
    ],
  });

  await writeJson(rotationFile, {
    timezone: 'America/Sao_Paulo',
    rules: [
      {
        id: 'all-day',
        days: [0, 1, 2, 3, 4, 5, 6],
        start: '00:00',
        end: '23:59',
        ownerByTier: {
          P1: 'oncall-p1',
          P2: 'oncall-p2',
          P3: 'oncall-p3',
        },
      },
    ],
  });

  const relaxedRun = runNode(GOVERNANCE_SCRIPT, {
    MONITOR_INCIDENTS_FILE: incidentsFile,
    INCIDENT_AUTOMATION_STATE_FILE: stateFile,
    ONCALL_EXECUTIVE_REPORT_FILE: execReportFile,
    GOVERNANCE_REPORT_FILE: governanceReportFile,
    GOVERNANCE_DASHBOARD_FILE: governanceDashboardFile,
    ONCALL_ROTATION_FILE: rotationFile,
    ONCALL_OWNER_DYNAMIC_ENABLED: 'true',
    ONCALL_OWNER_PRESERVE_MANUAL: 'false',
    ITSM_RECONCILIATION_ENABLED: 'true',
    ITSM_SNAPSHOT_FILE: snapshotFile,
    ITSM_RECONCILIATION_ALLOW_MISSING_SNAPSHOT: 'false',
    ITSM_RECONCILIATION_FAIL_ON_DRIFT: 'false',
    SLO_EXECUTIVE_ENFORCE_TARGETS: 'false',
  });
  assert((relaxedRun.status ?? 1) === 0, `phase16 relaxed run should exit 0 (got ${relaxedRun.status})`);

  const stateAfterRelaxed = await readJson(stateFile);
  const reportAfterRelaxed = await readJson(governanceReportFile);
  const dashboard = await readText(governanceDashboardFile);

  const ownerP1 = stateAfterRelaxed?.incidents?.['inc-p1-open']?.owner;
  const ownerP2 = stateAfterRelaxed?.incidents?.['inc-p2-resolved']?.owner;
  assert(ownerP1 === 'oncall-p1', `expected owner oncall-p1, got ${ownerP1}`);
  assert(ownerP2 === 'oncall-p2', `expected owner oncall-p2, got ${ownerP2}`);
  assert((reportAfterRelaxed?.reconciliation?.drifts?.length ?? 0) >= 2, 'expected reconciliation drift count >= 2');
  assert(dashboard.includes('## Reconciliation'), 'governance dashboard should include reconciliation section');

  const strictRun = runNode(GOVERNANCE_SCRIPT, {
    MONITOR_INCIDENTS_FILE: incidentsFile,
    INCIDENT_AUTOMATION_STATE_FILE: stateFile,
    ONCALL_EXECUTIVE_REPORT_FILE: execReportFile,
    GOVERNANCE_REPORT_FILE: governanceReportFile,
    GOVERNANCE_DASHBOARD_FILE: governanceDashboardFile,
    ONCALL_ROTATION_FILE: rotationFile,
    ONCALL_OWNER_DYNAMIC_ENABLED: 'true',
    ONCALL_OWNER_PRESERVE_MANUAL: 'false',
    ITSM_RECONCILIATION_ENABLED: 'true',
    ITSM_SNAPSHOT_FILE: snapshotFile,
    ITSM_RECONCILIATION_ALLOW_MISSING_SNAPSHOT: 'false',
    ITSM_RECONCILIATION_FAIL_ON_DRIFT: 'true',
    SLO_EXECUTIVE_ENFORCE_TARGETS: 'true',
    SLO_EXEC_MAX_OPEN_INCIDENTS: '0',
    SLO_EXEC_MIN_SAMPLES_PER_TIER: '1',
  });

  assert((strictRun.status ?? 0) !== 0, 'phase16 strict run should fail on blocking violations');
  console.log(`[OK] phase16 drill owners assigned and strict enforcement blocked (status=${strictRun.status})`);
}

main().catch((error) => {
  console.error(`Unexpected phase16 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
