import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const FULLCYCLE_SCRIPT = path.resolve(ROOT, 'scripts/phase17-fullcycle-governance.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase17-drill');

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

function localDateKey(timezone) {
  const date = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const yy = parts.find((p) => p.type === 'year')?.value || '0000';
  const mm = parts.find((p) => p.type === 'month')?.value || '00';
  const dd = parts.find((p) => p.type === 'day')?.value || '00';
  return `${yy}-${mm}-${dd}`;
}

function hasAction(actions, type, channel) {
  return actions.some((item) => item?.type === type && item?.channel === channel);
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const stateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const governanceFile = path.resolve(DRILL_DIR, 'governance-report.json');
  const snapshotFile = path.resolve(DRILL_DIR, 'itsm-snapshot.json');
  const rotationFile = path.resolve(DRILL_DIR, 'oncall-rotation.json');
  const calendarFile = path.resolve(DRILL_DIR, 'oncall-calendar.json');
  const historyFile = path.resolve(DRILL_DIR, 'governance-history.json');
  const actionsFile = path.resolve(DRILL_DIR, 'fullcycle-actions.json');
  const reportFile = path.resolve(DRILL_DIR, 'fullcycle-report.json');
  const dashboardFile = path.resolve(DRILL_DIR, 'fullcycle-dashboard.md');

  await fs.rm(actionsFile, { force: true });
  await fs.rm(reportFile, { force: true });
  await fs.rm(dashboardFile, { force: true });
  await fs.rm(historyFile, { force: true });

  const now = Date.now();
  const p1Detected = new Date(now - 45 * 60_000).toISOString();
  const p2Detected = new Date(now - 7 * 60 * 60_000).toISOString();
  const p2Resolved = new Date(now - 2 * 60 * 60_000).toISOString();
  const p3Detected = new Date(now - 90 * 60_000).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-p1-open',
    incidents: [
      {
        id: 'inc-p1-open',
        status: 'open',
        startedAt: p1Detected,
        detectedAt: p1Detected,
        resolvedAt: null,
        severity: 'critical',
        maxSeverity: 'critical',
      },
      {
        id: 'inc-p2-resolved',
        status: 'resolved',
        startedAt: p2Detected,
        detectedAt: p2Detected,
        resolvedAt: p2Resolved,
        severity: 'warning',
        maxSeverity: 'warning',
      },
      {
        id: 'inc-p3-open',
        status: 'open',
        startedAt: p3Detected,
        detectedAt: p3Detected,
        resolvedAt: null,
        severity: 'info',
        maxSeverity: 'info',
      },
    ],
  });

  await writeJson(stateFile, {
    version: 1,
    incidents: {
      'inc-p1-open': {
        owner: null,
        ownerSource: null,
        incident: {
          startedAt: p1Detected,
          detectedAt: p1Detected,
          resolvedAt: null,
          lastSeenAt: new Date(now - 60_000).toISOString(),
        },
        paging: {
          externalId: 'PG-1001',
        },
        ticket: {
          externalId: null,
        },
      },
      'inc-p2-resolved': {
        owner: 'manual-owner',
        ownerSource: 'manual_override',
        incident: {
          startedAt: p2Detected,
          detectedAt: p2Detected,
          resolvedAt: p2Resolved,
          lastSeenAt: p2Resolved,
        },
        paging: {
          externalId: null,
        },
        ticket: {
          externalId: 'TCK-2001',
        },
      },
      'inc-p3-open': {
        owner: null,
        ownerSource: null,
        incident: {
          startedAt: p3Detected,
          detectedAt: p3Detected,
          resolvedAt: null,
          lastSeenAt: new Date(now - 2 * 60_000).toISOString(),
        },
        paging: {
          externalId: null,
        },
        ticket: {
          externalId: 'TCK-3001',
        },
      },
    },
  });

  await writeJson(governanceFile, {
    generatedAt: new Date(now).toISOString(),
    status: 'pass',
    reconciliation: {
      drifts: [
        { type: 'status_mismatch', channel: 'ticket' },
      ],
    },
    violations: [],
  });

  await writeJson(snapshotFile, {
    generatedAt: new Date(now).toISOString(),
    tickets: [
      { externalId: 'TCK-2001', incidentId: 'inc-p2-resolved', status: 'open', owner: 'triage-team' },
      { externalId: 'TCK-ORPHAN', incidentId: 'inc-orphan', status: 'open', owner: 'someone' },
    ],
    paging: [
      { externalId: 'PG-1001', incidentId: 'inc-p1-open', status: 'resolved', owner: 'legacy-owner' },
      { externalId: 'PG-2001', incidentId: 'inc-p2-resolved', status: 'resolved', owner: 'manual-owner' },
    ],
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
          P1: 'rotation-p1',
          P2: 'rotation-p2',
          P3: 'rotation-p3',
        },
      },
    ],
  });

  await writeJson(calendarFile, {
    timezone: 'America/Sao_Paulo',
    overrides: [
      {
        id: 'today-p1-override',
        date: localDateKey('America/Sao_Paulo'),
        tier: 'P1',
        owner: 'calendar-p1',
      },
    ],
    holidays: [],
  });

  const relaxedRun = runNode(FULLCYCLE_SCRIPT, {
    MONITOR_INCIDENTS_FILE: incidentsFile,
    INCIDENT_AUTOMATION_STATE_FILE: stateFile,
    GOVERNANCE_REPORT_FILE: governanceFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    ONCALL_ROTATION_FILE: rotationFile,
    ONCALL_CALENDAR_FILE: calendarFile,
    FULLCYCLE_ACTIONS_FILE: actionsFile,
    FULLCYCLE_REPORT_FILE: reportFile,
    FULLCYCLE_DASHBOARD_FILE: dashboardFile,
    GOVERNANCE_HISTORY_FILE: historyFile,
    ONCALL_OWNER_DYNAMIC_ENABLED: 'true',
    ONCALL_OWNER_PRESERVE_MANUAL: 'true',
    FULLCYCLE_APPLY_LOCAL_BACKFILL: 'true',
    FULLCYCLE_ENFORCE_TARGETS: 'false',
    FULLCYCLE_REQUIRE_GOVERNANCE_PASS: 'true',
  });
  assert((relaxedRun.status ?? 1) === 0, `phase17 relaxed run should exit 0 (got ${relaxedRun.status})`);

  const stateAfterRelaxed = await readJson(stateFile);
  const actionsAfterRelaxed = await readJson(actionsFile);
  const reportAfterRelaxed = await readJson(reportFile);
  const historyAfterRelaxed = await readJson(historyFile);
  const dashboardAfterRelaxed = await readText(dashboardFile);
  const actions = Array.isArray(actionsAfterRelaxed?.actions) ? actionsAfterRelaxed.actions : [];

  assert(stateAfterRelaxed?.incidents?.['inc-p1-open']?.owner === 'calendar-p1', 'expected calendar override owner for P1');
  assert(stateAfterRelaxed?.incidents?.['inc-p2-resolved']?.owner === 'manual-owner', 'expected manual owner to be preserved');
  assert(stateAfterRelaxed?.incidents?.['inc-p2-resolved']?.paging?.externalId === 'PG-2001', 'expected local backfill of paging external id');

  assert(hasAction(actions, 'remote_reopen_paging', 'paging'), 'expected remote reopen action for paging');
  assert(hasAction(actions, 'remote_resolve_ticket', 'ticket'), 'expected remote resolve action for ticket');
  assert(hasAction(actions, 'link_local_external_id', 'paging'), 'expected link local external id action for paging');
  assert(hasAction(actions, 'orphan_remote_ticket', 'ticket'), 'expected orphan remote ticket action');
  assert(hasAction(actions, 'create_remote_ticket', 'ticket'), 'expected create remote ticket action');
  assert(hasAction(actions, 'investigate_missing_remote_record', 'ticket'), 'expected investigate missing remote ticket action');

  assert(reportAfterRelaxed?.status === 'pass', `expected pass status, got ${reportAfterRelaxed?.status}`);
  assert(reportAfterRelaxed?.owner?.coveragePct >= 66, `unexpected owner coverage ${reportAfterRelaxed?.owner?.coveragePct}`);
  assert(Number(reportAfterRelaxed?.actions?.pending || 0) >= 1, 'expected pending actions in relaxed run');
  assert(historyAfterRelaxed?.entries?.length >= 1, 'expected governance history entries');
  assert(dashboardAfterRelaxed.includes('# Fullcycle Governance'), 'dashboard header missing');

  await writeJson(governanceFile, {
    generatedAt: new Date(now).toISOString(),
    status: 'fail',
    reconciliation: {
      drifts: [{ type: 'status_mismatch' }, { type: 'owner_mismatch' }],
    },
    violations: [
      { code: 'reconciliation_drift', blocking: true },
    ],
  });

  const strictRun = runNode(FULLCYCLE_SCRIPT, {
    MONITOR_INCIDENTS_FILE: incidentsFile,
    INCIDENT_AUTOMATION_STATE_FILE: stateFile,
    GOVERNANCE_REPORT_FILE: governanceFile,
    ITSM_SNAPSHOT_FILE: snapshotFile,
    ONCALL_ROTATION_FILE: rotationFile,
    ONCALL_CALENDAR_FILE: calendarFile,
    FULLCYCLE_ACTIONS_FILE: actionsFile,
    FULLCYCLE_REPORT_FILE: reportFile,
    FULLCYCLE_DASHBOARD_FILE: dashboardFile,
    GOVERNANCE_HISTORY_FILE: historyFile,
    ONCALL_OWNER_DYNAMIC_ENABLED: 'true',
    ONCALL_OWNER_PRESERVE_MANUAL: 'true',
    FULLCYCLE_APPLY_LOCAL_BACKFILL: 'false',
    FULLCYCLE_ENFORCE_TARGETS: 'true',
    FULLCYCLE_REQUIRE_GOVERNANCE_PASS: 'true',
    FULLCYCLE_MAX_PENDING_ACTIONS: '0',
    FULLCYCLE_MAX_ORPHAN_EXTERNALS: '0',
    FULLCYCLE_MIN_OWNER_COVERAGE_PCT: '100',
  });

  assert((strictRun.status ?? 0) !== 0, 'phase17 strict run should fail on blocking violations');
  const strictReport = await readJson(reportFile);
  const violationCodes = new Set((strictReport?.violations || []).map((item) => item?.code));
  assert(violationCodes.has('pending_actions_exceeded'), 'expected pending actions violation');
  assert(violationCodes.has('orphan_externals_exceeded'), 'expected orphan externals violation');
  assert(violationCodes.has('governance_not_pass'), 'expected governance_not_pass violation');

  console.log(`[OK] phase17 drill fullcycle behavior validated (strict status=${strictRun.status})`);
}

main().catch((error) => {
  console.error(`Unexpected phase17 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
