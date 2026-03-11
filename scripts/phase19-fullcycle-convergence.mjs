import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const FULLCYCLE_SCRIPT = path.resolve(ROOT, 'scripts/phase17-fullcycle-governance.mjs');
const EXECUTOR_SCRIPT = path.resolve(ROOT, 'scripts/phase18-fullcycle-executor.mjs');

function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf-8');
}

function runNode(scriptPath, env) {
  const run = spawnSync('node', [scriptPath], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return {
    status: run.status ?? 1,
    stdout: run.stdout || '',
    stderr: run.stderr || '',
  };
}

function trimText(value, max = 4000) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSnapshot(raw) {
  const snapshot = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (!Array.isArray(snapshot.tickets)) snapshot.tickets = [];
  if (!Array.isArray(snapshot.paging)) snapshot.paging = [];
  return snapshot;
}

function getMetrics(report) {
  return {
    status: normalizeStatus(report?.status || '') || 'unknown',
    pending: Number(report?.actions?.pending || 0),
    blocking: Number(report?.actions?.blocking || 0),
    orphan: Number(report?.actions?.orphanExternals || 0),
    totalActions: Number(report?.actions?.total || 0),
    coveragePct: Number(report?.owner?.coveragePct || 0),
  };
}

function findSnapshotItem(list, incidentId, externalId) {
  const iid = String(incidentId || '').trim();
  const ext = String(externalId || '').trim();
  return list.find((item) => (
    (ext && String(item.externalId || '').trim() === ext)
    || (iid && String(item.incidentId || '').trim() === iid)
  )) || null;
}

function ensureSnapshotItem(list, incidentId, externalId) {
  const iid = String(incidentId || '').trim();
  const ext = String(externalId || '').trim();
  let item = findSnapshotItem(list, iid, ext);
  if (!item) {
    item = {
      externalId: ext || null,
      incidentId: iid || null,
      status: 'open',
      owner: null,
    };
    list.push(item);
  }
  if (ext && !item.externalId) item.externalId = ext;
  if (iid && !item.incidentId) item.incidentId = iid;
  return item;
}

function applyExecutionToSnapshot({ actions, snapshot, state }) {
  let changes = 0;

  for (const action of actions) {
    const execution = action?.execution || {};
    if (execution.outcome !== 'success') continue;

    const incidentId = String(action.incidentId || '').trim();
    const channel = String(action.channel || '').trim();
    if (!incidentId || (channel !== 'ticket' && channel !== 'paging')) continue;

    const isTicket = channel === 'ticket';
    const collection = isTicket ? snapshot.tickets : snapshot.paging;
    const record = state?.incidents?.[incidentId] || {};
    const channelRecord = isTicket ? (record.ticket || {}) : (record.paging || {});
    const externalId = String(channelRecord.externalId || action.remoteExternalId || '').trim() || null;
    const item = ensureSnapshotItem(collection, incidentId, externalId);

    const type = String(action.type || '').trim();
    if (type.startsWith('create_remote_') || type.startsWith('remote_reopen_')) {
      if (item.status !== 'open') {
        item.status = 'open';
        changes += 1;
      }
      if (externalId && item.externalId !== externalId) {
        item.externalId = externalId;
        changes += 1;
      }
    } else if (type.startsWith('remote_resolve_')) {
      if (item.status !== 'resolved') {
        item.status = 'resolved';
        changes += 1;
      }
    } else if (type.startsWith('owner_sync_')) {
      const localOwner = String(action.localOwner || record.owner || '').trim();
      if (localOwner && String(item.owner || '').trim() !== localOwner) {
        item.owner = localOwner;
        changes += 1;
      }
    }
  }

  return changes;
}

async function main() {
  const startedAt = new Date();
  const nowIso = startedAt.toISOString();
  const runId = `fullcycle-loop-${startedAt.getTime()}`;

  const cfg = {
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(ROOT, 'logs/monitoring/incidents.json'),
    stateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(ROOT, 'logs/monitoring/incident-automation-state.json'),
    snapshotFile: process.env.ITSM_SNAPSHOT_FILE || path.resolve(ROOT, 'logs/monitoring/itsm-snapshot.json'),
    actionsFile: process.env.FULLCYCLE_ACTIONS_FILE || path.resolve(ROOT, 'logs/monitoring/fullcycle-actions.json'),
    governanceReportFile: process.env.FULLCYCLE_REPORT_FILE || path.resolve(ROOT, 'logs/monitoring/fullcycle-governance-report.json'),
    loopReportFile: process.env.FULLCYCLE_CONVERGENCE_REPORT_FILE || path.resolve(ROOT, 'logs/monitoring/fullcycle-convergence-report.json'),
    loopDashboardFile: process.env.FULLCYCLE_CONVERGENCE_DASHBOARD_FILE || path.resolve(ROOT, 'docs/fullcycle-convergence.md'),
    maxCycles: Math.max(1, envInt('FULLCYCLE_LOOP_MAX_CYCLES', 3)),
    stopWhenStable: envBool('FULLCYCLE_LOOP_STOP_WHEN_STABLE', true),
    patchSnapshot: envBool('FULLCYCLE_LOOP_PATCH_SNAPSHOT', true),
    innerEnforce: envBool('FULLCYCLE_LOOP_INNER_ENFORCE', false),
    enforceTargets: envBool('FULLCYCLE_LOOP_ENFORCE_TARGETS', false),
    requireImprovement: envBool('FULLCYCLE_LOOP_REQUIRE_IMPROVEMENT', false),
    requireZeroBlocking: envBool('FULLCYCLE_LOOP_REQUIRE_ZERO_BLOCKING', true),
    minPendingReductionAbs: envInt('FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_ABS', 0),
    minPendingReductionPct: envFloat('FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_PCT', 0),
  };

  const violations = [];
  const cycles = [];
  let initialMetrics = null;
  let finalMetrics = null;
  let totalSnapshotPatches = 0;
  let breakReason = 'max_cycles_reached';

  for (let cycle = 1; cycle <= cfg.maxCycles; cycle += 1) {
    const cycleInfo = {
      cycle,
      startedAt: new Date().toISOString(),
      before: null,
      execution: null,
      snapshotPatched: 0,
      after: null,
      improvement: null,
      notes: [],
    };

    const planBefore = runNode(FULLCYCLE_SCRIPT, {
      FULLCYCLE_ENFORCE_TARGETS: cfg.innerEnforce ? (process.env.FULLCYCLE_ENFORCE_TARGETS || 'false') : 'false',
    });
    cycleInfo.beforeRun = {
      status: planBefore.status,
      stdout: trimText(planBefore.stdout),
      stderr: trimText(planBefore.stderr),
    };
    if (planBefore.status !== 0) {
      violations.push({
        code: 'phase17_before_failed',
        blocking: true,
        message: `cycle ${cycle} planning-before failed with status ${planBefore.status}`,
      });
      cycles.push(cycleInfo);
      breakReason = 'phase17_before_failed';
      break;
    }

    const beforeReport = await readJson(cfg.governanceReportFile, null);
    const beforeMetrics = getMetrics(beforeReport);
    cycleInfo.before = beforeMetrics;
    if (!initialMetrics) initialMetrics = beforeMetrics;

    if (beforeMetrics.pending === 0) {
      cycleInfo.notes.push('no_pending_actions_before_execution');
      cycleInfo.execution = {
        status: 0,
        reportStatus: 'skipped',
      };
      cycleInfo.after = beforeMetrics;
      cycleInfo.improvement = {
        pendingReductionAbs: 0,
        pendingReductionPct: 0,
        blockingReductionAbs: 0,
      };
      cycles.push(cycleInfo);
      finalMetrics = beforeMetrics;
      breakReason = 'already_converged';
      break;
    }

    const executeRun = runNode(EXECUTOR_SCRIPT, {});
    cycleInfo.executeRun = {
      status: executeRun.status,
      stdout: trimText(executeRun.stdout),
      stderr: trimText(executeRun.stderr),
    };
    const executeReport = await readJson(process.env.FULLCYCLE_EXECUTION_REPORT_FILE || path.resolve(ROOT, 'logs/monitoring/fullcycle-execution-report.json'), null);
    cycleInfo.execution = {
      status: executeRun.status,
      reportStatus: normalizeStatus(executeReport?.status || '') || 'unknown',
      totals: executeReport?.totals || null,
    };
    if (executeRun.status !== 0) {
      violations.push({
        code: 'phase18_execute_failed',
        blocking: true,
        message: `cycle ${cycle} execution failed with status ${executeRun.status}`,
      });
      cycles.push(cycleInfo);
      breakReason = 'phase18_execute_failed';
      break;
    }

    if (cfg.patchSnapshot) {
      const snapshotRaw = await readJson(cfg.snapshotFile, {});
      const snapshot = normalizeSnapshot(snapshotRaw);
      const state = await readJson(cfg.stateFile, { incidents: {} });
      const actionsAfterExecution = await readJson(cfg.actionsFile, { actions: [] });
      const executionActions = Array.isArray(actionsAfterExecution?.actions) ? actionsAfterExecution.actions : [];
      const patched = applyExecutionToSnapshot({
        actions: executionActions,
        snapshot,
        state,
      });
      if (patched > 0) {
        await writeJson(cfg.snapshotFile, snapshot);
      }
      cycleInfo.snapshotPatched = patched;
      totalSnapshotPatches += patched;
    }

    const planAfter = runNode(FULLCYCLE_SCRIPT, {
      FULLCYCLE_ENFORCE_TARGETS: cfg.innerEnforce ? (process.env.FULLCYCLE_ENFORCE_TARGETS || 'false') : 'false',
    });
    cycleInfo.afterRun = {
      status: planAfter.status,
      stdout: trimText(planAfter.stdout),
      stderr: trimText(planAfter.stderr),
    };
    if (planAfter.status !== 0) {
      violations.push({
        code: 'phase17_after_failed',
        blocking: true,
        message: `cycle ${cycle} planning-after failed with status ${planAfter.status}`,
      });
      cycles.push(cycleInfo);
      breakReason = 'phase17_after_failed';
      break;
    }

    const afterReport = await readJson(cfg.governanceReportFile, null);
    const afterMetrics = getMetrics(afterReport);
    cycleInfo.after = afterMetrics;

    const pendingReductionAbs = beforeMetrics.pending - afterMetrics.pending;
    const pendingReductionPct = beforeMetrics.pending > 0
      ? Number(((pendingReductionAbs / beforeMetrics.pending) * 100).toFixed(2))
      : 0;
    const blockingReductionAbs = beforeMetrics.blocking - afterMetrics.blocking;
    cycleInfo.improvement = {
      pendingReductionAbs,
      pendingReductionPct,
      blockingReductionAbs,
    };

    cycles.push(cycleInfo);
    finalMetrics = afterMetrics;

    if (afterMetrics.pending === 0) {
      breakReason = 'converged_zero_pending';
      break;
    }

    if (cfg.stopWhenStable && pendingReductionAbs <= 0) {
      breakReason = 'no_progress';
      break;
    }
  }

  if (!initialMetrics) initialMetrics = { status: 'unknown', pending: 0, blocking: 0, orphan: 0, totalActions: 0, coveragePct: 100 };
  if (!finalMetrics) finalMetrics = initialMetrics;

  const totalPendingReductionAbs = initialMetrics.pending - finalMetrics.pending;
  const totalPendingReductionPct = initialMetrics.pending > 0
    ? Number(((totalPendingReductionAbs / initialMetrics.pending) * 100).toFixed(2))
    : 100;
  const totalBlockingReductionAbs = initialMetrics.blocking - finalMetrics.blocking;

  if (cfg.enforceTargets) {
    if (cfg.requireImprovement && initialMetrics.pending > 0 && totalPendingReductionAbs <= 0) {
      violations.push({
        code: 'pending_not_reduced',
        blocking: true,
        message: `pending remained ${initialMetrics.pending} -> ${finalMetrics.pending}`,
      });
    }
    if (initialMetrics.pending > 0 && totalPendingReductionAbs < cfg.minPendingReductionAbs) {
      violations.push({
        code: 'pending_reduction_abs_below_target',
        blocking: true,
        message: `pending reduction ${totalPendingReductionAbs} < ${cfg.minPendingReductionAbs}`,
      });
    }
    if (initialMetrics.pending > 0 && totalPendingReductionPct < cfg.minPendingReductionPct) {
      violations.push({
        code: 'pending_reduction_pct_below_target',
        blocking: true,
        message: `pending reduction ${totalPendingReductionPct}% < ${cfg.minPendingReductionPct}%`,
      });
    }
    if (cfg.requireZeroBlocking && finalMetrics.blocking > 0) {
      violations.push({
        code: 'blocking_actions_remaining',
        blocking: true,
        message: `blocking pending after loop: ${finalMetrics.blocking}`,
      });
    }
  }

  const status = violations.some((item) => item.blocking) ? 'fail' : 'pass';
  const report = {
    generatedAt: nowIso,
    runId,
    status,
    breakReason,
    config: {
      maxCycles: cfg.maxCycles,
      stopWhenStable: cfg.stopWhenStable,
      patchSnapshot: cfg.patchSnapshot,
      innerEnforce: cfg.innerEnforce,
      enforceTargets: cfg.enforceTargets,
      requireImprovement: cfg.requireImprovement,
      requireZeroBlocking: cfg.requireZeroBlocking,
      minPendingReductionAbs: cfg.minPendingReductionAbs,
      minPendingReductionPct: cfg.minPendingReductionPct,
    },
    sources: {
      incidentsFile: cfg.incidentsFile,
      stateFile: cfg.stateFile,
      snapshotFile: cfg.snapshotFile,
      actionsFile: cfg.actionsFile,
      governanceReportFile: cfg.governanceReportFile,
    },
    metrics: {
      initial: initialMetrics,
      final: finalMetrics,
      pendingReductionAbs: totalPendingReductionAbs,
      pendingReductionPct: totalPendingReductionPct,
      blockingReductionAbs: totalBlockingReductionAbs,
      snapshotPatches: totalSnapshotPatches,
      cyclesExecuted: cycles.length,
    },
    cycles,
    violations,
  };

  await writeJson(cfg.loopReportFile, report);

  const md = [];
  md.push('# Fullcycle Convergence');
  md.push('');
  md.push(`- Generated at: ${nowIso}`);
  md.push(`- Run ID: ${runId}`);
  md.push(`- Status: ${status.toUpperCase()}`);
  md.push(`- Break reason: ${breakReason}`);
  md.push('');
  md.push('## Reduction');
  md.push('');
  md.push(`- Pending: ${initialMetrics.pending} -> ${finalMetrics.pending} (delta ${totalPendingReductionAbs}, ${totalPendingReductionPct}%)`);
  md.push(`- Blocking: ${initialMetrics.blocking} -> ${finalMetrics.blocking} (delta ${totalBlockingReductionAbs})`);
  md.push(`- Snapshot patches applied: ${totalSnapshotPatches}`);
  md.push(`- Cycles executed: ${cycles.length}/${cfg.maxCycles}`);
  md.push('');
  md.push('## Cycles');
  md.push('');
  md.push('| Cycle | Pending before | Pending after | Blocking before | Blocking after | Snapshot patch |');
  md.push('|---|---|---|---|---|---|');
  if (cycles.length === 0) {
    md.push('| - | - | - | - | - | - |');
  } else {
    for (const cycle of cycles) {
      md.push(`| ${cycle.cycle} | ${cycle.before?.pending ?? 'n/a'} | ${cycle.after?.pending ?? 'n/a'} | ${cycle.before?.blocking ?? 'n/a'} | ${cycle.after?.blocking ?? 'n/a'} | ${cycle.snapshotPatched ?? 0} |`);
    }
  }
  md.push('');
  md.push('## Violations');
  md.push('');
  if (violations.length === 0) {
    md.push('- none');
  } else {
    for (const violation of violations) {
      md.push(`- [${violation.blocking ? 'BLOCKING' : 'INFO'}] ${violation.code}: ${violation.message}`);
    }
  }
  md.push('');

  await writeText(cfg.loopDashboardFile, md.join('\n'));

  console.log(`Fullcycle convergence report: ${cfg.loopReportFile}`);
  console.log(`Fullcycle convergence dashboard: ${cfg.loopDashboardFile}`);
  console.log(`[FULLCYCLE-LOOP] status=${status} pending=${initialMetrics.pending}->${finalMetrics.pending} cycles=${cycles.length}`);

  if (status === 'fail') {
    for (const violation of violations) {
      if (!violation.blocking) continue;
      console.error(`[FULLCYCLE-LOOP] ${violation.code}: ${violation.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase19 fullcycle convergence failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
