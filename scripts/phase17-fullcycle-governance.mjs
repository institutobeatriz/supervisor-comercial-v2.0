import fs from 'node:fs/promises';
import path from 'node:path';

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

function envCsvSet(name, fallback) {
  const raw = process.env[name] || fallback;
  return new Set(
    String(raw)
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0),
  );
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

function safeMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function tierBySeverity(severity) {
  if (severity === 'critical') return 'P1';
  if (severity === 'warning') return 'P2';
  return 'P3';
}

function parseDay(value) {
  if (typeof value === 'number') return value;
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[String(value || '').trim().toLowerCase().slice(0, 3)];
}

function parseMin(value, fallback) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return hh * 60 + mm;
}

function zonedParts(isoOrNow, timezone) {
  const date = new Date(Number.isFinite(safeMs(isoOrNow)) ? isoOrNow : Date.now());
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date).toLowerCase();
  const day = parseDay(weekday);
  const hm = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(hm.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(hm.find((p) => p.type === 'minute')?.value || 0);
  const ymdParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const yy = ymdParts.find((p) => p.type === 'year')?.value || '0000';
  const mo = ymdParts.find((p) => p.type === 'month')?.value || '00';
  const dd = ymdParts.find((p) => p.type === 'day')?.value || '00';
  return { day, minuteOfDay: hour * 60 + minute, dateKey: `${yy}-${mo}-${dd}` };
}

function resolveOwner({ tier, referenceTime, rotation, calendar, defaultOwner }) {
  const tz = calendar?.timezone || rotation?.timezone || 'America/Sao_Paulo';
  const parts = zonedParts(referenceTime, tz);
  const refMs = safeMs(referenceTime);

  if (calendar) {
    for (const o of calendar.overrides || []) {
      const owner = String(o.owner || '').trim();
      if (!owner) continue;
      const oTier = String(o.tier || '').trim().toUpperCase();
      if (oTier && oTier !== tier) continue;
      if (o.date && String(o.date).trim() === parts.dateKey) {
        return { owner, source: 'calendar_override', ruleId: String(o.id || `date-${o.date}`) };
      }
      const fromMs = safeMs(o.from);
      const toMs = safeMs(o.to);
      if (Number.isFinite(fromMs) && Number.isFinite(toMs) && Number.isFinite(refMs) && refMs >= fromMs && refMs <= toMs) {
        return { owner, source: 'calendar_override', ruleId: String(o.id || 'range') };
      }
    }
    for (const h of calendar.holidays || []) {
      const owner = String(h.owner || '').trim();
      if (!owner) continue;
      const hTier = String(h.tier || '').trim().toUpperCase();
      if (hTier && hTier !== tier) continue;
      if (String(h.date || '').trim() === parts.dateKey) {
        return { owner, source: 'calendar_holiday', ruleId: String(h.id || `holiday-${h.date}`) };
      }
    }
  }

  if (rotation) {
    for (const r of rotation.rules || []) {
      const days = (Array.isArray(r.days) ? r.days : []).map((d) => parseDay(d)).filter((d) => typeof d === 'number');
      if (days.length > 0 && !days.includes(parts.day)) continue;
      const start = parseMin(r.start, 0);
      const end = parseMin(r.end, 23 * 60 + 59);
      const inWindow = start <= end
        ? (parts.minuteOfDay >= start && parts.minuteOfDay <= end)
        : (parts.minuteOfDay >= start || parts.minuteOfDay <= end);
      if (!inWindow) continue;
      const owner = String((r.ownerByTier && r.ownerByTier[tier]) || r.owner || '').trim();
      if (owner) return { owner, source: 'rotation', ruleId: String(r.id || r.name || 'rotation-rule') };
    }
  }

  if (defaultOwner) return { owner: defaultOwner, source: 'default', ruleId: null };
  return { owner: null, source: 'unassigned', ruleId: null };
}

function normalizeExternal(snapshot, key) {
  const direct = Array.isArray(snapshot?.[key]) ? snapshot[key] : [];
  const nested = Array.isArray(snapshot?.items?.[key]) ? snapshot.items[key] : [];
  const source = direct.length > 0 ? direct : nested;
  return source
    .map((x) => ({
      externalId: String(x.externalId || x.external_id || x.id || x.key || '').trim(),
      incidentId: String(x.incidentId || x.incident_id || x.localIncidentId || x.local_incident_id || '').trim(),
      status: normalizeStatus(x.status || x.state || x.phase),
      owner: String(x.owner || x.assignee || '').trim(),
    }))
    .filter((x) => x.externalId || x.incidentId);
}

function mapBy(items, key) {
  const m = new Map();
  for (const i of items) {
    if (i[key] && !m.has(i[key])) m.set(i[key], i);
  }
  return m;
}

async function main() {
  const nowIso = new Date().toISOString();
  const cfg = {
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    stateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    governanceFile: process.env.GOVERNANCE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/executive-governance-report.json'),
    rotationFile: process.env.ONCALL_ROTATION_FILE || path.resolve(process.cwd(), 'config/oncall-rotation.json'),
    calendarFile: process.env.ONCALL_CALENDAR_FILE || path.resolve(process.cwd(), 'config/oncall-calendar.json'),
    snapshotFile: process.env.ITSM_SNAPSHOT_FILE || path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'),
    actionsFile: process.env.FULLCYCLE_ACTIONS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-actions.json'),
    reportFile: process.env.FULLCYCLE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'),
    dashboardFile: process.env.FULLCYCLE_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-governance.md'),
    historyFile: process.env.GOVERNANCE_HISTORY_FILE || path.resolve(process.cwd(), 'logs/monitoring/governance-history.json'),
    defaultOwner: process.env.ITSM_DEFAULT_OWNER || '',
    applyBackfill: envBool('FULLCYCLE_APPLY_LOCAL_BACKFILL', false),
    enforceTargets: envBool('FULLCYCLE_ENFORCE_TARGETS', false),
    requireGovernancePass: envBool('FULLCYCLE_REQUIRE_GOVERNANCE_PASS', true),
    maxPending: envInt('FULLCYCLE_MAX_PENDING_ACTIONS', 20),
    maxOrphan: envInt('FULLCYCLE_MAX_ORPHAN_EXTERNALS', 0),
    minCoverage: envFloat('FULLCYCLE_MIN_OWNER_COVERAGE_PCT', 95),
    maxHistory: envInt('FULLCYCLE_MAX_HISTORY_ENTRIES', 180),
    ownerDynamic: envBool('ONCALL_OWNER_DYNAMIC_ENABLED', true),
    ownerPreserveManual: envBool('ONCALL_OWNER_PRESERVE_MANUAL', true),
    ticketResolved: envCsvSet('ITSM_TICKET_RESOLVED_STATUSES', 'resolved,closed,done'),
    ticketOpen: envCsvSet('ITSM_TICKET_OPEN_STATUSES', 'open,in_progress,triage,acknowledged'),
    pagingResolved: envCsvSet('ONCALL_PAGING_RESOLVED_STATUSES', 'resolved,closed'),
    pagingOpen: envCsvSet('ONCALL_PAGING_OPEN_STATUSES', 'open,triggered,acknowledged,firing'),
  };

  const incidentsState = await readJson(cfg.incidentsFile, { incidents: [] });
  const incidents = Array.isArray(incidentsState.incidents) ? incidentsState.incidents : [];
  let state = await readJson(cfg.stateFile, { version: 1, incidents: {} });
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = { version: 1, incidents: {} };
  if (!state.incidents || typeof state.incidents !== 'object' || Array.isArray(state.incidents)) state.incidents = {};
  const rotation = await readJson(cfg.rotationFile, null);
  const calendar = await readJson(cfg.calendarFile, null);
  const snapshot = await readJson(cfg.snapshotFile, null);
  const governance = await readJson(cfg.governanceFile, null);

  const tickets = normalizeExternal(snapshot, 'tickets');
  const paging = normalizeExternal(snapshot, 'paging');
  const ticketByExternal = mapBy(tickets, 'externalId');
  const ticketByIncident = mapBy(tickets, 'incidentId');
  const pagingByExternal = mapBy(paging, 'externalId');
  const pagingByIncident = mapBy(paging, 'incidentId');
  const usedTicket = new Set();
  const usedPaging = new Set();

  const actions = [];
  const ownerStats = { assigned: 0, updated: 0, preservedManual: 0, unresolved: 0 };

  for (const incident of incidents) {
    const id = String(incident.id || '').trim();
    if (!id) continue;
    const rec = state.incidents[id] || { paging: {}, ticket: {}, events: [], createdAt: nowIso };
    rec.updatedAt = nowIso;
    rec.lastStatus = incident.status || rec.lastStatus || 'unknown';
    rec.lastSeverity = incident.maxSeverity || incident.severity || rec.lastSeverity || 'info';
    rec.incident = { startedAt: incident.startedAt || null, detectedAt: incident.detectedAt || null, resolvedAt: incident.resolvedAt || null, lastSeenAt: incident.lastSeenAt || null };
    if (!rec.paging || typeof rec.paging !== 'object') rec.paging = {};
    if (!rec.ticket || typeof rec.ticket !== 'object') rec.ticket = {};

    const tier = (rec.sla && rec.sla.tier) || tierBySeverity(rec.lastSeverity);
    const keepManual = cfg.ownerPreserveManual && rec.owner && !['calendar_override', 'calendar_holiday', 'rotation', 'default', 'unassigned', null, ''].includes(rec.ownerSource || null);
    if (cfg.ownerDynamic) {
      if (keepManual) {
        ownerStats.preservedManual += 1;
      } else {
        const decision = resolveOwner({ tier, referenceTime: rec.incident.detectedAt || rec.incident.startedAt || nowIso, rotation, calendar, defaultOwner: cfg.defaultOwner });
        if (decision.owner) {
          if (!rec.owner) ownerStats.assigned += 1;
          if (rec.owner && rec.owner !== decision.owner) ownerStats.updated += 1;
          rec.owner = decision.owner;
          rec.ownerSource = decision.source;
          rec.ownerRuleId = decision.ruleId || null;
          rec.ownerAssignedAt = nowIso;
        }
      }
    }
    if (!rec.owner) ownerStats.unresolved += 1;
    state.incidents[id] = rec;

    const localStatus = normalizeStatus(incident.status || rec.lastStatus || '');
    const localOwner = String(rec.owner || '').trim();
    const check = (channel, localExternalId, byExternal, byIncident, openSet, resolvedSet, usedSet) => {
      const localExt = String(localExternalId || '').trim();
      const remote = localExt ? (byExternal.get(localExt) || byIncident.get(id)) : byIncident.get(id);
      if (remote?.externalId) usedSet.add(remote.externalId);

      if (!localExt && remote?.externalId) {
        actions.push({ type: 'link_local_external_id', channel, incidentId: id, remoteExternalId: remote.externalId, blocking: false, applied: cfg.applyBackfill });
        if (cfg.applyBackfill) {
          if (channel === 'ticket') rec.ticket.externalId = remote.externalId;
          if (channel === 'paging') rec.paging.externalId = remote.externalId;
        }
      } else if (localExt && !remote) {
        actions.push({ type: 'investigate_missing_remote_record', channel, incidentId: id, localExternalId: localExt, blocking: false, applied: false });
      } else if (!localExt && !remote && localStatus === 'open') {
        actions.push({ type: `create_remote_${channel}`, channel, incidentId: id, blocking: tier === 'P1', applied: false });
      } else if (remote) {
        const rStatus = normalizeStatus(remote.status);
        if (localStatus === 'open' && resolvedSet.has(rStatus)) actions.push({ type: `remote_reopen_${channel}`, channel, incidentId: id, remoteExternalId: remote.externalId || null, blocking: tier === 'P1', applied: false });
        if (localStatus === 'resolved' && openSet.has(rStatus)) actions.push({ type: `remote_resolve_${channel}`, channel, incidentId: id, remoteExternalId: remote.externalId || null, blocking: false, applied: false });
        if (localOwner && remote.owner && localOwner.toLowerCase() !== remote.owner.toLowerCase()) actions.push({ type: `owner_sync_${channel}`, channel, incidentId: id, localOwner, remoteOwner: remote.owner, blocking: false, applied: false });
      }
    };

    check('ticket', rec.ticket.externalId, ticketByExternal, ticketByIncident, cfg.ticketOpen, cfg.ticketResolved, usedTicket);
    check('paging', rec.paging.externalId, pagingByExternal, pagingByIncident, cfg.pagingOpen, cfg.pagingResolved, usedPaging);
  }

  for (const t of tickets) {
    if (t.externalId && usedTicket.has(t.externalId)) continue;
    actions.push({ type: 'orphan_remote_ticket', channel: 'ticket', incidentId: t.incidentId || null, remoteExternalId: t.externalId || null, blocking: false, applied: false });
  }
  for (const p of paging) {
    if (p.externalId && usedPaging.has(p.externalId)) continue;
    actions.push({ type: 'orphan_remote_paging', channel: 'paging', incidentId: p.incidentId || null, remoteExternalId: p.externalId || null, blocking: false, applied: false });
  }

  state.version = 1;
  state.updatedAt = nowIso;
  await writeJson(cfg.stateFile, state);

  const totalIncidents = incidents.length;
  const assignedOwners = Math.max(0, totalIncidents - ownerStats.unresolved);
  const ownerCoveragePct = totalIncidents > 0 ? Number(((assignedOwners / totalIncidents) * 100).toFixed(2)) : 100;
  const pending = actions.filter((a) => !a.applied).length;
  const blocking = actions.filter((a) => a.blocking).length;
  const orphan = actions.filter((a) => a.type === 'orphan_remote_ticket' || a.type === 'orphan_remote_paging').length;
  const governanceStatus = normalizeStatus(governance?.status || '') || 'unknown';
  const governanceDrifts = Array.isArray(governance?.reconciliation?.drifts) ? governance.reconciliation.drifts.length : null;
  const governanceBlockingViolations = Array.isArray(governance?.violations)
    ? governance.violations.filter((item) => item?.blocking).length
    : null;

  const history = await readJson(cfg.historyFile, { entries: [] });
  const entries = Array.isArray(history.entries) ? history.entries : [];
  entries.push({
    timestamp: nowIso,
    incidents: totalIncidents,
    ownerCoveragePct,
    pendingActions: pending,
    orphanExternals: orphan,
    governanceStatus,
    governanceDrifts,
    governanceBlockingViolations,
  });
  const trimmed = entries.slice(-cfg.maxHistory);
  await writeJson(cfg.historyFile, { version: 1, entries: trimmed });

  const avg = (n, field) => {
    const slice = trimmed.slice(-n);
    if (slice.length === 0) return null;
    const values = slice.map((x) => Number(x[field])).filter((x) => Number.isFinite(x));
    if (values.length === 0) return null;
    return Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2));
  };

  const violations = [];
  if (cfg.enforceTargets) {
    if (pending > cfg.maxPending) violations.push({ code: 'pending_actions_exceeded', blocking: true, message: `pending ${pending} > ${cfg.maxPending}` });
    if (orphan > cfg.maxOrphan) violations.push({ code: 'orphan_externals_exceeded', blocking: true, message: `orphans ${orphan} > ${cfg.maxOrphan}` });
    if (ownerCoveragePct < cfg.minCoverage) violations.push({ code: 'owner_coverage_below_target', blocking: true, message: `coverage ${ownerCoveragePct}% < ${cfg.minCoverage}%` });
    if (cfg.requireGovernancePass && governanceStatus !== 'pass') violations.push({ code: 'governance_not_pass', blocking: true, message: `governance status=${governanceStatus}` });
  }

  const byType = {};
  for (const action of actions) byType[action.type] = (byType[action.type] || 0) + 1;
  const report = {
    generatedAt: nowIso,
    sources: {
      incidentsFile: cfg.incidentsFile,
      stateFile: cfg.stateFile,
      governanceFile: cfg.governanceFile,
      rotationFile: cfg.rotationFile,
      calendarFile: cfg.calendarFile,
      snapshotFile: cfg.snapshotFile,
      historyFile: cfg.historyFile,
    },
    owner: { ...ownerStats, totalIncidents, assignedOwners, coveragePct: ownerCoveragePct },
    actions: { total: actions.length, pending, blocking, orphanExternals: orphan, byType },
    trends: {
      ownerCoverageAvgLast7: avg(7, 'ownerCoveragePct'),
      pendingActionsAvgLast7: avg(7, 'pendingActions'),
      orphanExternalsAvgLast7: avg(7, 'orphanExternals'),
      governanceDriftsAvgLast7: avg(7, 'governanceDrifts'),
      governanceBlockingViolationsAvgLast7: avg(7, 'governanceBlockingViolations'),
      ownerCoverageAvgLast30: avg(30, 'ownerCoveragePct'),
      pendingActionsAvgLast30: avg(30, 'pendingActions'),
      orphanExternalsAvgLast30: avg(30, 'orphanExternals'),
      governanceDriftsAvgLast30: avg(30, 'governanceDrifts'),
      governanceBlockingViolationsAvgLast30: avg(30, 'governanceBlockingViolations'),
    },
    enforce: {
      enabled: cfg.enforceTargets,
      maxPending: cfg.maxPending,
      maxOrphan: cfg.maxOrphan,
      minCoverage: cfg.minCoverage,
      requireGovernancePass: cfg.requireGovernancePass,
    },
    governanceStatus,
    violations,
    status: violations.some((v) => v.blocking) ? 'fail' : 'pass',
  };

  await writeJson(cfg.actionsFile, { generatedAt: nowIso, actions });
  await writeJson(cfg.reportFile, report);
  await writeText(
    cfg.dashboardFile,
    `# Fullcycle Governance\n\n- Generated at: ${nowIso}\n- Status: ${report.status.toUpperCase()}\n- Incidents: ${totalIncidents}\n- Owner coverage: ${ownerCoveragePct}%\n- Pending actions: ${pending}\n- Orphan externals: ${orphan}\n\n## Violations\n${violations.length === 0 ? '- none' : violations.map((v) => `- [${v.blocking ? 'BLOCKING' : 'INFO'}] ${v.code}: ${v.message}`).join('\n')}\n`,
  );

  console.log(`Fullcycle dashboard: ${cfg.dashboardFile}`);
  console.log(`Fullcycle report: ${cfg.reportFile}`);
  console.log(`Fullcycle actions: ${cfg.actionsFile}`);
  console.log(`[FULLCYCLE] status=${report.status} incidents=${totalIncidents} pending=${pending} coverage=${ownerCoveragePct}%`);

  if (violations.some((v) => v.blocking)) {
    for (const violation of violations) {
      if (violation.blocking) console.error(`[FULLCYCLE] ${violation.code}: ${violation.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase17 fullcycle failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
