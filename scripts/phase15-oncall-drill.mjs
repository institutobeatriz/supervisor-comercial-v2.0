import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DASHBOARD_SCRIPT = path.resolve(ROOT, 'scripts/phase15-oncall-executive-dashboard.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase15-drill');

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
  const automationStateFile = path.resolve(DRILL_DIR, 'incident-automation-state.json');
  const reliabilityFile = path.resolve(DRILL_DIR, 'reliability-summary.json');
  const dashboardFile = path.resolve(DRILL_DIR, 'oncall-dashboard.md');
  const executiveReportFile = path.resolve(DRILL_DIR, 'executive-sla-report.json');
  const auditFile = path.resolve(DRILL_DIR, 'executive-audit-trail.jsonl');
  const postmortemDir = path.resolve(DRILL_DIR, 'postmortems');

  await fs.rm(dashboardFile, { force: true });
  await fs.rm(executiveReportFile, { force: true });
  await fs.rm(auditFile, { force: true });
  await fs.mkdir(postmortemDir, { recursive: true });

  const baseNow = Date.now();
  const tStartP1 = new Date(baseNow - 70 * 60_000).toISOString();
  const tDetectP1 = new Date(baseNow - 65 * 60_000).toISOString();
  const tResolveP1 = new Date(baseNow - 25 * 60_000).toISOString();

  const tStartP2 = new Date(baseNow - 8 * 60 * 60_000).toISOString();
  const tDetectP2 = new Date(baseNow - 7 * 60 * 60_000).toISOString();
  const tResolveP2 = new Date(baseNow - 2 * 60 * 60_000).toISOString();

  const tStartP3 = new Date(baseNow - 45 * 60_000).toISOString();
  const tDetectP3 = new Date(baseNow - 40 * 60_000).toISOString();

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-p3-open',
    incidents: [
      {
        id: 'inc-p1-resolved',
        status: 'resolved',
        startedAt: tStartP1,
        detectedAt: tDetectP1,
        resolvedAt: tResolveP1,
        severity: 'critical',
        maxSeverity: 'critical',
      },
      {
        id: 'inc-p2-breach',
        status: 'resolved',
        startedAt: tStartP2,
        detectedAt: tDetectP2,
        resolvedAt: tResolveP2,
        severity: 'warning',
        maxSeverity: 'warning',
      },
      {
        id: 'inc-p3-open',
        status: 'open',
        startedAt: tStartP3,
        detectedAt: tDetectP3,
        resolvedAt: null,
        severity: 'info',
        maxSeverity: 'info',
      },
    ],
  });

  await writeJson(automationStateFile, {
    version: 1,
    incidents: {
      'inc-p1-resolved': {
        owner: 'alice',
        sla: { tier: 'P1', ackTargetMinutes: 5, resolveTargetMinutes: 60 },
        incident: {
          startedAt: tStartP1,
          detectedAt: tDetectP1,
          resolvedAt: tResolveP1,
          lastSeenAt: tResolveP1,
        },
        paging: {
          openedAt: new Date(baseNow - 64 * 60_000).toISOString(),
          resolvedAt: tResolveP1,
          externalId: 'PG-1001',
        },
        ticket: {
          createdAt: new Date(baseNow - 64 * 60_000).toISOString(),
          resolvedAt: tResolveP1,
          externalId: 'TCK-1001',
        },
        events: [
          { timestamp: new Date(baseNow - 64 * 60_000).toISOString(), channel: 'paging', action: 'open', ok: true, status: 200 },
          { timestamp: new Date(baseNow - 64 * 60_000).toISOString(), channel: 'itsm', action: 'open', ok: true, status: 200 },
          { timestamp: tResolveP1, channel: 'paging', action: 'resolve', ok: true, status: 200 },
          { timestamp: tResolveP1, channel: 'itsm', action: 'resolve', ok: true, status: 200 },
        ],
      },
      'inc-p2-breach': {
        owner: 'bob',
        sla: { tier: 'P2', ackTargetMinutes: 15, resolveTargetMinutes: 240 },
        incident: {
          startedAt: tStartP2,
          detectedAt: tDetectP2,
          resolvedAt: tResolveP2,
          lastSeenAt: tResolveP2,
        },
        paging: {
          openedAt: new Date(baseNow - 6 * 60 * 60_000).toISOString(),
          resolvedAt: tResolveP2,
          externalId: 'PG-2001',
        },
        ticket: {
          createdAt: new Date(baseNow - 6 * 60 * 60_000).toISOString(),
          resolvedAt: tResolveP2,
          externalId: 'TCK-2001',
        },
        events: [
          { timestamp: new Date(baseNow - 6 * 60 * 60_000).toISOString(), channel: 'paging', action: 'open', ok: true, status: 200 },
          { timestamp: new Date(baseNow - 6 * 60 * 60_000).toISOString(), channel: 'itsm', action: 'open', ok: true, status: 200 },
          { timestamp: tResolveP2, channel: 'paging', action: 'resolve', ok: true, status: 200 },
          { timestamp: tResolveP2, channel: 'itsm', action: 'resolve', ok: true, status: 200 },
        ],
      },
      'inc-p3-open': {
        owner: null,
        sla: { tier: 'P3', ackTargetMinutes: 60, resolveTargetMinutes: 1440 },
        incident: {
          startedAt: tStartP3,
          detectedAt: tDetectP3,
          resolvedAt: null,
          lastSeenAt: new Date(baseNow - 5 * 60_000).toISOString(),
        },
        paging: {
          openedAt: new Date(baseNow - 39 * 60_000).toISOString(),
          resolvedAt: null,
          externalId: 'PG-3001',
        },
        ticket: {
          createdAt: new Date(baseNow - 39 * 60_000).toISOString(),
          resolvedAt: null,
          externalId: 'TCK-3001',
        },
        events: [
          { timestamp: new Date(baseNow - 39 * 60_000).toISOString(), channel: 'paging', action: 'open', ok: true, status: 200 },
          { timestamp: new Date(baseNow - 39 * 60_000).toISOString(), channel: 'itsm', action: 'open', ok: true, status: 200 },
        ],
      },
    },
  });

  await writeJson(reliabilityFile, {
    generatedAt: new Date().toISOString(),
    totals: {
      totalIncidents: 3,
      openIncidents: 1,
      resolvedIncidents: 2,
    },
    mttd: {
      avgSec: 120,
      p95Sec: 180,
    },
    mttr: {
      avgMin: 125,
      p95Min: 240,
    },
  });

  await fs.writeFile(path.resolve(postmortemDir, 'inc-p1-resolved.md'), '# postmortem p1\n', 'utf-8');

  const run = runNode(DASHBOARD_SCRIPT, {
    ONCALL_WINDOW_DAYS: '30',
    MONITOR_INCIDENTS_FILE: incidentsFile,
    INCIDENT_AUTOMATION_STATE_FILE: automationStateFile,
    RELIABILITY_REPORT_FILE: reliabilityFile,
    ONCALL_DASHBOARD_FILE: dashboardFile,
    ONCALL_EXECUTIVE_REPORT_FILE: executiveReportFile,
    ONCALL_AUDIT_FILE: auditFile,
    POSTMORTEM_OUTPUT_DIR: postmortemDir,
  });

  assert((run.status ?? 1) === 0, `phase15 dashboard run should exit 0 (got ${run.status})`);

  const dashboard = await readText(dashboardFile);
  const report = await readJson(executiveReportFile);
  const auditRaw = await readText(auditFile);
  const auditLines = auditRaw.split('\n').filter((line) => line.trim().length > 0);

  assert(dashboard.includes('## SLA by Tier'), 'dashboard should include SLA by Tier section');
  assert(dashboard.includes('## Open Incidents'), 'dashboard should include Open Incidents section');
  assert((report?.totals?.incidents ?? 0) === 3, `expected 3 incidents in executive report, got ${report?.totals?.incidents}`);
  assert((report?.totals?.open ?? 0) === 1, `expected 1 open incident in executive report, got ${report?.totals?.open}`);
  assert((report?.sla?.byTier?.P1?.ack?.met ?? 0) >= 1, 'expected at least one P1 ack met');
  assert((report?.sla?.byTier?.P2?.ack?.breached ?? 0) >= 1, 'expected at least one P2 ack breach');
  assert((report?.sla?.byTier?.P2?.resolve?.breached ?? 0) >= 1, 'expected at least one P2 resolve breach');
  assert(auditLines.length === 3, `expected 3 audit lines, got ${auditLines.length}`);

  console.log(`[OK] phase15 drill incidents=${report.totals.incidents} open=${report.totals.open} audit=${auditLines.length}`);
  console.log(`[OK] phase15 drill dashboard=${dashboardFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase15 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
