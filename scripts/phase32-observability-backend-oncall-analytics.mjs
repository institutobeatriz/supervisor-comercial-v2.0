import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function parseMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(safeArray(values).map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  if (['open', 'resolved', 'pass', 'warn', 'fail', 'unknown', 'ok'].includes(raw)) return raw;
  return fallback;
}

function normalizeSeverity(value) {
  const raw = String(value || 'info').trim().toLowerCase();
  if (['critical', 'error', 'fatal', 'fail'].includes(raw)) return 'critical';
  if (['warning', 'warn', 'degraded'].includes(raw)) return 'warning';
  return 'info';
}

function tierBySeverity(value) {
  if (normalizeSeverity(value) === 'critical') return 'P1';
  if (normalizeSeverity(value) === 'warning') return 'P2';
  return 'P3';
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

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function appendLine(filePath, line) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf-8');
}

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: process.cwd(),
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

function parseDay(value) {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value;
  const key = String(value || '').trim().toLowerCase();
  const map = {
    sun: 0, sunday: 0, dom: 0, domingo: 0,
    mon: 1, monday: 1, seg: 1, segunda: 1,
    tue: 2, tuesday: 2, ter: 2, terca: 2,
    wed: 3, wednesday: 3, qua: 3, quarta: 3,
    thu: 4, thursday: 4, qui: 4, quinta: 4,
    fri: 5, friday: 5, sex: 5, sexta: 5,
    sat: 6, saturday: 6, sab: 6, sabado: 6,
  };
  return map[key];
}

function parseMinute(value, fallback) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function zonedParts(referenceTime, timezone) {
  const date = new Date(Number.isFinite(parseMs(referenceTime)) ? referenceTime : Date.now());
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date).toLowerCase();
  const day = parseDay(weekday);
  const hm = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(hm.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(hm.find((part) => part.type === 'minute')?.value || 0);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const year = ymd.find((part) => part.type === 'year')?.value || '0000';
  const month = ymd.find((part) => part.type === 'month')?.value || '00';
  const dayText = ymd.find((part) => part.type === 'day')?.value || '00';
  return {
    day,
    minuteOfDay: (hour * 60) + minute,
    dateKey: `${year}-${month}-${dayText}`,
  };
}

function normalizeTeamMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [String(key || '').trim().toLowerCase(), String(value || '').trim()])
      .filter(([key, value]) => key && value),
  );
}

function normalizeTeamTierMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [teamKey, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const normalizedTeam = String(teamKey || '').trim().toLowerCase();
    if (!normalizedTeam) continue;
    out[normalizedTeam] = {
      P1: String(value.P1 || '').trim(),
      P2: String(value.P2 || '').trim(),
      P3: String(value.P3 || '').trim(),
    };
  }
  return out;
}

function normalizeRule(rawRule, index) {
  const teams = uniqueStrings(rawRule?.teams).map((item) => item.toLowerCase());
  return {
    id: String(rawRule?.id || rawRule?.name || `rule-${index + 1}`),
    days: safeArray(rawRule?.days).map((item) => parseDay(item)).filter((item) => typeof item === 'number'),
    startMinute: parseMinute(rawRule?.start, 0),
    endMinute: parseMinute(rawRule?.end, 23 * 60 + 59),
    teams,
    tier: String(rawRule?.tier || '').trim().toUpperCase(),
    owner: String(rawRule?.owner || '').trim(),
    ownerByTier: rawRule?.ownerByTier && typeof rawRule.ownerByTier === 'object' ? {
      P1: String(rawRule.ownerByTier.P1 || '').trim(),
      P2: String(rawRule.ownerByTier.P2 || '').trim(),
      P3: String(rawRule.ownerByTier.P3 || '').trim(),
    } : null,
    ownerByTeam: normalizeTeamMap(rawRule?.ownerByTeam),
    ownerByTeamTier: normalizeTeamTierMap(rawRule?.ownerByTeamTier),
  };
}

function normalizeRotation(rawRotation, fallbackTimezone) {
  if (!rawRotation || typeof rawRotation !== 'object' || Array.isArray(rawRotation)) return null;
  const timezone = String(rawRotation.timezone || fallbackTimezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
  const rules = safeArray(rawRotation.rules).map((item, index) => normalizeRule(item, index));
  return { timezone, rules };
}

function normalizeCalendar(rawCalendar, fallbackTimezone) {
  if (!rawCalendar || typeof rawCalendar !== 'object' || Array.isArray(rawCalendar)) return null;
  const timezone = String(rawCalendar.timezone || fallbackTimezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
  const normalizeItems = (items) => safeArray(items).map((item, index) => ({
    ...normalizeRule(item, index),
    date: String(item?.date || '').trim(),
    from: item?.from || null,
    to: item?.to || null,
  }));
  return {
    timezone,
    overrides: normalizeItems(rawCalendar.overrides),
    holidays: normalizeItems(rawCalendar.holidays),
  };
}
function ruleMatches(rule, day, minuteOfDay, team, tier) {
  if (rule.days.length > 0 && !rule.days.includes(day)) return false;
  if (rule.teams.length > 0 && !rule.teams.includes(String(team || '').trim().toLowerCase())) return false;
  if (rule.tier && rule.tier !== String(tier || '').trim().toUpperCase()) return false;
  if (rule.startMinute <= rule.endMinute) {
    return minuteOfDay >= rule.startMinute && minuteOfDay <= rule.endMinute;
  }
  return minuteOfDay >= rule.startMinute || minuteOfDay <= rule.endMinute;
}

function resolveOwnerValue(rule, team, tier) {
  const normalizedTeam = String(team || '').trim().toLowerCase();
  const normalizedTier = String(tier || '').trim().toUpperCase();
  const fromTeamTier = rule.ownerByTeamTier?.[normalizedTeam]?.[normalizedTier] || '';
  if (fromTeamTier) return fromTeamTier;
  const fromTeam = rule.ownerByTeam?.[normalizedTeam] || '';
  if (fromTeam) return fromTeam;
  const fromTier = rule.ownerByTier?.[normalizedTier] || '';
  if (fromTier) return fromTier;
  return rule.owner || '';
}

function resolveDynamicOwner({ team, tier, referenceTime, rotation, calendar, defaultOwner }) {
  const timezone = calendar?.timezone || rotation?.timezone || 'America/Sao_Paulo';
  const parts = zonedParts(referenceTime, timezone);
  const referenceMs = parseMs(referenceTime);

  const tryCalendar = (items, source) => {
    for (const item of safeArray(items)) {
      const hasDate = Boolean(item.date);
      const hasRange = Number.isFinite(parseMs(item.from)) && Number.isFinite(parseMs(item.to));
      const dateMatch = hasDate && item.date === parts.dateKey;
      const rangeMatch = hasRange && Number.isFinite(referenceMs) && referenceMs >= parseMs(item.from) && referenceMs <= parseMs(item.to);
      if (!dateMatch && !rangeMatch) continue;
      if (item.teams.length > 0 && !item.teams.includes(String(team || '').trim().toLowerCase())) continue;
      if (item.tier && item.tier !== String(tier || '').trim().toUpperCase()) continue;
      const owner = resolveOwnerValue(item, team, tier);
      if (!owner) continue;
      return { owner, source, ruleId: item.id, timezone };
    }
    return null;
  };

  const fromOverride = tryCalendar(calendar?.overrides, 'calendar_override');
  if (fromOverride) return fromOverride;
  const fromHoliday = tryCalendar(calendar?.holidays, 'calendar_holiday');
  if (fromHoliday) return fromHoliday;

  if (rotation) {
    for (const rule of safeArray(rotation.rules)) {
      if (!ruleMatches(rule, parts.day, parts.minuteOfDay, team, tier)) continue;
      const owner = resolveOwnerValue(rule, team, tier);
      if (!owner) continue;
      return { owner, source: 'rotation', ruleId: rule.id, timezone };
    }
  }

  if (defaultOwner) {
    return { owner: defaultOwner, source: 'default', ruleId: null, timezone };
  }

  return { owner: null, source: 'unassigned', ruleId: null, timezone };
}

function isDynamicOwnerSource(value) {
  return ['calendar_override', 'calendar_holiday', 'rotation', 'default', 'unassigned'].includes(String(value || '').trim().toLowerCase());
}

function buildEscalation(item) {
  const targetMinutes = Number(item?.routing?.escalateAfterMinutes);
  const ageMinutes = Number(item?.ageMinutes);
  const isOpen = normalizeStatus(item?.status, 'unknown') !== 'resolved';
  const target = Number.isFinite(targetMinutes) ? targetMinutes : null;
  const age = Number.isFinite(ageMinutes) ? ageMinutes : null;
  const breached = Boolean(isOpen && target !== null && age !== null && age >= target);
  return {
    targetMinutes: target,
    ageMinutes: age,
    breached,
    status: breached ? 'breached' : (isOpen ? 'tracking' : 'resolved'),
  };
}

function enrichRecord(item, cfg, rotation, calendar, nowIso) {
  const team = String(item?.ownerTeam || item?.routing?.team || '').trim() || 'unassigned';
  const tier = tierBySeverity(item?.severity);
  const referenceTime = item?.detectedAt || item?.openedAt || item?.startedAt || item?.lastSeenAt || nowIso;
  const preserveManual = cfg.preserveManualOwner
    && String(item?.owner || '').trim()
    && !isDynamicOwnerSource(item?.ownerSource);
  const decision = preserveManual
    ? {
        owner: String(item.owner || '').trim(),
        source: String(item.ownerSource || 'manual').trim() || 'manual',
        ruleId: item.ownerRuleId || null,
        timezone: item.ownerTimezone || rotation?.timezone || calendar?.timezone || 'America/Sao_Paulo',
      }
    : (cfg.dynamicOwnerEnabled
      ? resolveDynamicOwner({ team, tier, referenceTime, rotation, calendar, defaultOwner: cfg.defaultOwner })
      : {
          owner: String(item?.owner || '').trim() || null,
          source: item?.ownerSource || null,
          ruleId: item?.ownerRuleId || null,
          timezone: item?.ownerTimezone || rotation?.timezone || calendar?.timezone || 'America/Sao_Paulo',
        });

  return {
    ...item,
    ownerTeam: team,
    escalationTeam: team,
    owner: decision.owner || null,
    ownerSource: decision.source || null,
    ownerRuleId: decision.ruleId || null,
    ownerAssignedAt: decision.owner ? nowIso : null,
    ownerTimezone: decision.timezone || null,
    ownerTier: tier,
    ownerReferenceTime: referenceTime,
    escalation: buildEscalation(item),
  };
}

function buildTeamSummary(incidents, alerts) {
  const map = new Map();
  function ensure(team) {
    const key = String(team || 'unassigned').trim() || 'unassigned';
    if (!map.has(key)) {
      map.set(key, {
        team: key,
        openIncidents: 0,
        resolvedIncidents: 0,
        criticalOpenIncidents: 0,
        activeAlerts: 0,
        resolvedAlerts: 0,
        criticalActiveAlerts: 0,
        pendingEscalations: 0,
        owners: new Set(),
        channels: new Set(),
        sources: new Set(),
      });
    }
    return map.get(key);
  }

  for (const incident of incidents) {
    const row = ensure(incident?.ownerTeam || incident?.routing?.team);
    if (incident?.status === 'resolved') row.resolvedIncidents += 1;
    else row.openIncidents += 1;
    if (incident?.status !== 'resolved' && incident?.severity === 'critical') row.criticalOpenIncidents += 1;
    if (incident?.status !== 'resolved' && incident?.escalation?.breached) row.pendingEscalations += 1;
    if (incident?.owner) row.owners.add(String(incident.owner));
    for (const item of safeArray(incident?.routing?.channels)) row.channels.add(String(item).toLowerCase());
    row.sources.add(String(incident?.source || 'connectors_runtime').toLowerCase());
  }

  for (const alert of alerts) {
    const row = ensure(alert?.ownerTeam || alert?.routing?.team);
    if (alert?.status === 'resolved') row.resolvedAlerts += 1;
    else row.activeAlerts += 1;
    if (alert?.status !== 'resolved' && alert?.severity === 'critical') row.criticalActiveAlerts += 1;
    if (alert?.status !== 'resolved' && alert?.escalation?.breached) row.pendingEscalations += 1;
    if (alert?.owner) row.owners.add(String(alert.owner));
    for (const item of safeArray(alert?.routing?.channels)) row.channels.add(String(item).toLowerCase());
    row.sources.add(String(alert?.source || 'unknown').toLowerCase());
  }

  return [...map.values()].map((item) => ({
    team: item.team,
    openIncidents: item.openIncidents,
    resolvedIncidents: item.resolvedIncidents,
    criticalOpenIncidents: item.criticalOpenIncidents,
    activeAlerts: item.activeAlerts,
    resolvedAlerts: item.resolvedAlerts,
    criticalActiveAlerts: item.criticalActiveAlerts,
    pendingEscalations: item.pendingEscalations,
    ownerCount: item.owners.size,
    owners: [...item.owners].sort(),
    channels: [...item.channels].sort(),
    sources: [...item.sources].sort(),
  })).sort((a, b) => a.team.localeCompare(b.team));
}

function summarizeOwnership(records) {
  const active = records.filter((item) => normalizeStatus(item?.status, 'unknown') !== 'resolved');
  const assigned = active.filter((item) => String(item?.owner || '').trim());
  const unassigned = active.filter((item) => !String(item?.owner || '').trim());
  const bySource = {};
  for (const item of assigned) {
    const key = String(item?.ownerSource || 'unknown').trim().toLowerCase() || 'unknown';
    bySource[key] = (bySource[key] || 0) + 1;
  }
  const coveragePct = active.length > 0 ? round((assigned.length / active.length) * 100, 2) : 100;
  return {
    activeRecords: active.length,
    assignedOwners: assigned.length,
    unassignedOwners: unassigned.length,
    coveragePct,
    bySource,
  };
}
function buildAnalytics({ ts, environment, incidents, alerts, teams, prevAnalytics }) {
  const openIncidents = incidents.filter((item) => item.status !== 'resolved');
  const activeAlerts = alerts.filter((item) => item.status !== 'resolved');
  const allActive = [...openIncidents, ...activeAlerts];
  const ownership = summarizeOwnership(allActive);
  const breachedEscalations = allActive.filter((item) => item?.escalation?.breached).length;
  const severity = {
    incidents: {
      criticalOpen: openIncidents.filter((item) => item.severity === 'critical').length,
      warningOpen: openIncidents.filter((item) => item.severity === 'warning').length,
      infoOpen: openIncidents.filter((item) => item.severity === 'info').length,
    },
    alerts: {
      criticalActive: activeAlerts.filter((item) => item.severity === 'critical').length,
      warningActive: activeAlerts.filter((item) => item.severity === 'warning').length,
      infoActive: activeAlerts.filter((item) => item.severity === 'info').length,
    },
  };

  const snapshot = {
    timestamp: ts,
    environment,
    openIncidents: openIncidents.length,
    activeAlerts: activeAlerts.length,
    ownerCoveragePct: ownership.coveragePct,
    unassignedOwners: ownership.unassignedOwners,
    breachedEscalations,
    teams: teams.map((item) => ({
      team: item.team,
      openIncidents: item.openIncidents,
      activeAlerts: item.activeAlerts,
      pendingEscalations: item.pendingEscalations,
      ownerCount: item.ownerCount,
    })),
    severity,
  };

  const previousEntries = safeArray(prevAnalytics?.entries);
  const current = {
    generatedAt: ts,
    environment,
    recordsTracked: incidents.length + alerts.length,
    activeRecords: allActive.length,
    ownerCoveragePct: ownership.coveragePct,
    assignedOwners: ownership.assignedOwners,
    unassignedOwners: ownership.unassignedOwners,
    breachedEscalations,
    bySource: ownership.bySource,
    byTeam: teams,
    severity,
  };

  return {
    version: 1,
    generatedAt: ts,
    current,
    entries: [...previousEntries, snapshot],
  };
}

function buildDashboard({ ts, status, summary, teams, incidents, alerts, analytics, violations, oncall }) {
  const lines = [];
  lines.push('# Fullcycle Connectors Observability Backend');
  lines.push('');
  lines.push(`- Generated at: ${ts}`);
  lines.push(`- Status: ${status.toUpperCase()}`);
  lines.push(`- Environment: ${summary.environment}`);
  lines.push(`- Stream status: ${summary.streamStatus}`);
  lines.push(`- Alerting status: ${summary.alertingStatus}`);
  lines.push(`- API SLA status: ${summary.latestApiSla?.status || 'unknown'}`);
  lines.push(`- Owner coverage: ${summary.ownerCoveragePct}%`);
  lines.push(`- Breached escalations: ${summary.breachedEscalations}`);
  lines.push('');
  lines.push('## On-call Integration');
  lines.push('');
  lines.push(`- Dynamic owner enabled: ${oncall.dynamicOwnerEnabled ? 'yes' : 'no'}`);
  lines.push(`- Rotation loaded: ${oncall.rotationLoaded ? 'yes' : 'no'}`);
  lines.push(`- Calendar loaded: ${oncall.calendarLoaded ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Ownership and Escalation');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Active records | ${analytics.current.activeRecords} |`);
  lines.push(`| Assigned owners | ${analytics.current.assignedOwners} |`);
  lines.push(`| Unassigned owners | ${analytics.current.unassignedOwners} |`);
  lines.push(`| Owner coverage % | ${analytics.current.ownerCoveragePct} |`);
  lines.push(`| Breached escalations | ${analytics.current.breachedEscalations} |`);
  lines.push(`| Analytics history points | ${analytics.entries.length} |`);
  lines.push('');
  lines.push('## Teams');
  lines.push('');
  lines.push('| Team | Open incidents | Active alerts | Pending escalations | Owners | Channels |');
  lines.push('|---|---:|---:|---:|---|---|');
  if (teams.length === 0) {
    lines.push('| - | 0 | 0 | 0 | n/a | n/a |');
  } else {
    for (const item of teams) {
      lines.push(`| ${item.team} | ${item.openIncidents} | ${item.activeAlerts} | ${item.pendingEscalations} | ${(item.owners || []).join(', ') || 'n/a'} | ${(item.channels || []).join(', ') || 'n/a'} |`);
    }
  }
  lines.push('');
  lines.push('## Incidents');
  lines.push('');
  lines.push('| ID | Status | Severity | Team | Owner | Escalation | Started |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const item of incidents.slice(0, 20)) {
    lines.push(`| ${item.id} | ${item.status} | ${item.severity} | ${item.ownerTeam || 'unassigned'} | ${item.owner || 'unassigned'} | ${item.escalation?.status || 'n/a'} | ${item.startedAt || item.openedAt || 'n/a'} |`);
  }
  if (incidents.length === 0) lines.push('| - | - | - | - | - | - | - |');
  lines.push('');
  lines.push('## Alerts');
  lines.push('');
  lines.push('| Key | Status | Severity | Team | Owner | Escalation | Last seen |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const item of alerts.slice(0, 20)) {
    lines.push(`| ${item.key} | ${item.status} | ${item.severity} | ${item.ownerTeam || 'unassigned'} | ${item.owner || 'unassigned'} | ${item.escalation?.status || 'n/a'} | ${item.lastSeenAt || item.openedAt || 'n/a'} |`);
  }
  if (alerts.length === 0) lines.push('| - | - | - | - | - | - | - |');
  lines.push('');
  lines.push('## Recent Analytics');
  lines.push('');
  lines.push('| Timestamp | Coverage % | Open incidents | Active alerts | Breached escalations |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const item of analytics.entries.slice(-10).reverse()) {
    lines.push(`| ${item.timestamp} | ${item.ownerCoveragePct} | ${item.openIncidents} | ${item.activeAlerts} | ${item.breachedEscalations} |`);
  }
  if (analytics.entries.length === 0) lines.push('| - | 0 | 0 | 0 | 0 |');
  lines.push('');
  lines.push('## Violations');
  lines.push('');
  if (violations.length === 0) {
    lines.push('- none');
  } else {
    for (const item of violations) {
      lines.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const ts = new Date().toISOString();
  const cfg = {
    phase30Script: path.resolve(process.cwd(), 'scripts/phase30-observability-backend-consolidation.mjs'),
    backendStoreFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json'),
    backendReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json'),
    backendDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-backend.md'),
    backendAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-audit.jsonl'),
    backendAnalyticsFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-analytics.json'),
    rotationFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE || process.env.ONCALL_ROTATION_FILE || path.resolve(process.cwd(), 'config/oncall-rotation.json'),
    calendarFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE || process.env.ONCALL_CALENDAR_FILE || path.resolve(process.cwd(), 'config/oncall-calendar.json'),
    defaultOwner: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_OWNER', process.env.ITSM_DEFAULT_OWNER || ''),
    dynamicOwnerEnabled: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED', true),
    preserveManualOwner: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER', envBool('ONCALL_OWNER_PRESERVE_MANUAL', true)),
    requireDynamicOwner: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER', true),
    minOwnerCoveragePct: Math.max(0, Math.min(100, envFloat('FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT', 100))),
    maxAnalyticsEntries: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES', 400)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS', false),
  };

  const phase30Run = await runNode(cfg.phase30Script, process.env);
  if ((phase30Run.status ?? 1) !== 0) {
    if (phase30Run.stdout.trim()) process.stdout.write(phase30Run.stdout);
    if (phase30Run.stderr.trim()) process.stderr.write(phase30Run.stderr);
    throw new Error(`phase30 backend baseline failed with status=${phase30Run.status}`);
  }

  const [baseStore, baseReport, rotationRaw, calendarRaw, prevAnalytics] = await Promise.all([
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.backendReportFile, null),
    readJson(cfg.rotationFile, null),
    readJson(cfg.calendarFile, null),
    readJson(cfg.backendAnalyticsFile, { entries: [] }),
  ]);

  if (!baseStore || !baseReport) {
    throw new Error('phase30 backend artifacts missing after baseline run');
  }

  const rotation = normalizeRotation(rotationRaw, 'America/Sao_Paulo');
  const calendar = normalizeCalendar(calendarRaw, rotation?.timezone || 'America/Sao_Paulo');
  const incidents = safeArray(baseStore.incidents).map((item) => enrichRecord(item, cfg, rotation, calendar, ts));
  const alerts = safeArray(baseStore.alerts).map((item) => enrichRecord(item, cfg, rotation, calendar, ts));
  const teams = buildTeamSummary(incidents, alerts);
  const analytics = buildAnalytics({ ts, environment: baseStore.summary?.environment || 'unknown', incidents, alerts, teams, prevAnalytics });
  analytics.entries = analytics.entries.slice(-cfg.maxAnalyticsEntries);

  const activeRecords = [...incidents.filter((item) => item.status !== 'resolved'), ...alerts.filter((item) => item.status !== 'resolved')];
  const ownership = summarizeOwnership(activeRecords);
  const unassignedRecords = activeRecords.filter((item) => !String(item.owner || '').trim()).map((item) => item.id ? `incident:${item.id}` : `alert:${item.key}`);
  const violations = safeArray(baseReport.violations).map((item) => ({ ...item }));

  if (cfg.dynamicOwnerEnabled && cfg.requireDynamicOwner && !rotation && !calendar && !cfg.defaultOwner) {
    violations.push({ code: 'dynamic_owner_configuration_unavailable', blocking: true, message: 'rotation/calendar/defaultOwner unavailable for dynamic owner resolution' });
  }
  if (cfg.dynamicOwnerEnabled && cfg.requireDynamicOwner && unassignedRecords.length > 0) {
    violations.push({ code: 'dynamic_owner_unassigned', blocking: true, message: `records without owner: ${unassignedRecords.join(', ')}` });
  }
  if (ownership.coveragePct < cfg.minOwnerCoveragePct) {
    violations.push({ code: 'owner_coverage_below_target', blocking: true, message: `owner coverage ${ownership.coveragePct}% < ${cfg.minOwnerCoveragePct}%` });
  }

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0 ? (cfg.enforceTargets ? 'fail' : 'warn') : 'pass';
  const summary = {
    ...baseStore.summary,
    teamsTracked: teams.length,
    ownerCoveragePct: ownership.coveragePct,
    unassignedOwners: ownership.unassignedOwners,
    breachedEscalations: analytics.current.breachedEscalations,
    analyticsPoints: analytics.entries.length,
  };

  const store = {
    ...baseStore,
    version: 2,
    generatedAt: ts,
    status,
    summary,
    teams,
    incidents,
    alerts,
    analytics: {
      current: analytics.current,
      historyPoints: analytics.entries.length,
    },
    oncall: {
      dynamicOwnerEnabled: cfg.dynamicOwnerEnabled,
      preserveManualOwner: cfg.preserveManualOwner,
      defaultOwnerConfigured: Boolean(cfg.defaultOwner),
      rotationLoaded: Boolean(rotation),
      calendarLoaded: Boolean(calendar),
      rotationFile: cfg.rotationFile,
      calendarFile: cfg.calendarFile,
      timezone: calendar?.timezone || rotation?.timezone || 'America/Sao_Paulo',
    },
  };

  const report = {
    generatedAt: ts,
    status,
    summary,
    baseReportStatus: baseReport.status,
    ownership,
    analytics: {
      current: analytics.current,
      totalEntries: analytics.entries.length,
      file: cfg.backendAnalyticsFile,
    },
    config: {
      ...(baseReport.config || {}),
      backendAnalyticsFile: cfg.backendAnalyticsFile,
      rotationFile: cfg.rotationFile,
      calendarFile: cfg.calendarFile,
      dynamicOwnerEnabled: cfg.dynamicOwnerEnabled,
      preserveManualOwner: cfg.preserveManualOwner,
      requireDynamicOwner: cfg.requireDynamicOwner,
      minOwnerCoveragePct: cfg.minOwnerCoveragePct,
      maxAnalyticsEntries: cfg.maxAnalyticsEntries,
    },
    inputs: {
      ...(baseReport.inputs || {}),
      rotationLoaded: Boolean(rotation),
      calendarLoaded: Boolean(calendar),
      analyticsHistoryPreviousPoints: safeArray(prevAnalytics?.entries).length,
    },
    violations,
  };

  await writeJson(cfg.backendStoreFile, store);
  await writeJson(cfg.backendReportFile, report);
  await writeJson(cfg.backendAnalyticsFile, analytics);
  await writeText(cfg.backendDashboardFile, buildDashboard({ ts, status, summary, teams, incidents, alerts, analytics, violations, oncall: store.oncall }));
  await appendLine(cfg.backendAuditFile, JSON.stringify({ timestamp: ts, source: 'phase32-observability-backend-oncall-analytics', status, summary, ownership, backendAnalyticsFile: cfg.backendAnalyticsFile, violations }));

  console.log(`Observability backend store: ${cfg.backendStoreFile}`);
  console.log(`Observability backend report: ${cfg.backendReportFile}`);
  console.log(`Observability backend analytics: ${cfg.backendAnalyticsFile}`);
  console.log(`Observability backend dashboard: ${cfg.backendDashboardFile}`);
  console.log(`[OBS-BACKEND-ONCALL] status=${status} coverage=${ownership.coveragePct}% active=${analytics.current.activeRecords} escalations=${analytics.current.breachedEscalations} history=${analytics.entries.length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[OBS-BACKEND-ONCALL] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase32 observability backend failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
