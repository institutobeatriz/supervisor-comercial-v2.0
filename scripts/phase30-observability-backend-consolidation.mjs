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

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function nowIso() {
  return new Date().toISOString();
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

function ageMinutes(from, toMs = Date.now()) {
  const fromMs = parseMs(from);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return round((toMs - fromMs) / 60_000, 2);
}

function durationMinutes(from, to) {
  const fromMs = parseMs(from);
  const toMs = parseMs(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return round((toMs - fromMs) / 60_000, 2);
}

function normalizeSeverity(value) {
  const raw = String(value || 'info').trim().toLowerCase();
  if (['critical', 'error', 'fatal', 'fail'].includes(raw)) return 'critical';
  if (['warning', 'warn', 'degraded'].includes(raw)) return 'warning';
  return 'info';
}

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  if (['open', 'resolved', 'pass', 'warn', 'fail', 'unknown', 'ok'].includes(raw)) return raw;
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(safeArray(values).map((item) => String(item || '').trim()).filter(Boolean))];
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

function tail(arr, size) {
  if (!Array.isArray(arr) || arr.length <= size) return arr;
  return arr.slice(arr.length - size);
}

function alertKey(item) {
  const source = String(item?.source || 'unknown').trim().toLowerCase() || 'unknown';
  const code = String(item?.code || '').trim().toLowerCase();
  const message = String(item?.message || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  return `${source}::${code || message || 'unknown'}`;
}

function buildFallbackRouteMatrix(cfg) {
  return {
    version: 1,
    defaultTeam: cfg.defaultTeam,
    severity: {
      critical: { team: cfg.criticalTeam, channels: ['paging', 'itsm', 'slack'], escalateAfterMinutes: 15 },
      warning: { team: cfg.warningTeam, channels: ['slack', 'webhook'], escalateAfterMinutes: 60 },
      info: { team: cfg.infoTeam, channels: ['dashboard'], escalateAfterMinutes: 240 },
    },
    sources: {
      api_sla: { team: 'platform-api', channels: ['slack', 'webhook'], escalateAfterMinutes: 20 },
      api_governance: { team: 'platform-api', channels: ['slack', 'webhook'], escalateAfterMinutes: 20 },
      governance: { team: 'platform-ops', channels: ['slack'], escalateAfterMinutes: 30 },
      stream: { team: 'platform-ops', channels: ['slack'], escalateAfterMinutes: 30 },
      connectors: { team: 'integrations', channels: ['webhook', 'slack'], escalateAfterMinutes: 30 },
      connectors_runtime: { team: 'integrations', channels: ['webhook', 'slack'], escalateAfterMinutes: 30 },
    },
  };
}

function normalizeRouteEntry(entry, fallbackTeam) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const team = String(raw.team || fallbackTeam || 'unassigned').trim() || 'unassigned';
  const channels = uniqueStrings(raw.channels).map((item) => item.toLowerCase());
  const escalateAfterMinutes = Number(raw.escalateAfterMinutes);
  return {
    team,
    channels,
    escalateAfterMinutes: Number.isFinite(escalateAfterMinutes) ? escalateAfterMinutes : null,
  };
}

function normalizeRouteMatrix(raw, fallback) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const defaultTeam = String(src.defaultTeam || fallback.defaultTeam || 'unassigned').trim() || 'unassigned';
  const severitySource = src.severity && typeof src.severity === 'object' ? src.severity : {};
  const sourcesSource = src.sources && typeof src.sources === 'object' ? src.sources : {};
  const severity = {};

  for (const key of ['critical', 'warning', 'info']) {
    severity[key] = normalizeRouteEntry(
      severitySource[key] || fallback.severity?.[key] || {},
      fallback.severity?.[key]?.team || defaultTeam,
    );
  }

  const sources = {};
  for (const [key, value] of Object.entries({
    ...(fallback.sources || {}),
    ...sourcesSource,
  })) {
    const sourceKey = String(key || '').trim().toLowerCase();
    if (!sourceKey) continue;
    sources[sourceKey] = normalizeRouteEntry(value, severity.warning.team || defaultTeam);
  }

  return {
    version: Number(src.version) || Number(fallback.version) || 1,
    defaultTeam,
    severity,
    sources,
  };
}

function resolveRoute(matrix, { severity, source }) {
  const sev = normalizeSeverity(severity);
  const sourceKey = String(source || '').trim().toLowerCase();
  const severityRule = matrix.severity?.[sev] || matrix.severity?.info || { team: matrix.defaultTeam, channels: [] };
  const sourceRule = sourceKey ? matrix.sources?.[sourceKey] : null;
  return {
    team: sourceRule?.team || severityRule.team || matrix.defaultTeam,
    channels: uniqueStrings(sourceRule?.channels?.length ? sourceRule.channels : severityRule.channels).map((item) => item.toLowerCase()),
    escalateAfterMinutes: Number.isFinite(Number(sourceRule?.escalateAfterMinutes))
      ? Number(sourceRule.escalateAfterMinutes)
      : (Number.isFinite(Number(severityRule.escalateAfterMinutes)) ? Number(severityRule.escalateAfterMinutes) : null),
    matchedBy: sourceRule ? 'source' : 'severity',
    ruleKey: sourceRule ? sourceKey : sev,
  };
}

function normalizeIncidentViolation(item) {
  const raw = item && typeof item === 'object' ? item : {};
  return {
    connector: String(raw.connector || 'unknown').trim() || 'unknown',
    code: String(raw.code || 'unknown').trim() || 'unknown',
    message: String(raw.message || raw.code || 'unknown').trim() || 'unknown',
    severity: normalizeSeverity(raw.severity),
    blocking: Boolean(raw.blocking),
  };
}

function buildPostmortemMap(operationsReport) {
  const map = new Map();
  for (const item of safeArray(operationsReport?.postmortems)) {
    const incidentId = String(item?.incidentId || '').trim();
    if (!incidentId) continue;
    map.set(incidentId, {
      exists: Boolean(item?.exists),
      filePath: item?.filePath || null,
      status: item?.status || null,
      generated: Boolean(item?.generated),
      resolvedAt: item?.resolvedAt || null,
    });
  }
  return map;
}

function buildIncidentRecords({
  incidentsState,
  prevStore,
  postmortemMap,
  routeMatrix,
  environment,
  nowMs,
}) {
  const prevMap = new Map(
    safeArray(prevStore?.incidents)
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item]),
  );
  const currentIds = new Set();

  for (const raw of safeArray(incidentsState?.incidents)) {
    const id = String(raw?.id || '').trim();
    if (!id) continue;
    currentIds.add(id);
    const prev = prevMap.get(id) || {};
    const violations = safeArray(raw?.violations).map(normalizeIncidentViolation);
    const connectors = uniqueStrings(violations.map((item) => item.connector));
    const status = normalizeStatus(raw?.status, 'open') === 'resolved' ? 'resolved' : 'open';
    const severity = normalizeSeverity(raw?.maxSeverity || raw?.severity || prev?.severity);
    const startedAt = raw?.startedAt || raw?.detectedAt || prev?.startedAt || prev?.openedAt || null;
    const detectedAt = raw?.detectedAt || raw?.startedAt || prev?.detectedAt || startedAt;
    const resolvedAt = status === 'resolved'
      ? (raw?.resolvedAt || prev?.resolvedAt || nowIso())
      : null;
    const lastSeenAt = raw?.lastSeenAt || raw?.resolvedAt || prev?.lastSeenAt || nowIso();
    const route = resolveRoute(routeMatrix, { severity, source: 'connectors_runtime' });
    const alertEvents = safeArray(raw?.alertEvents);
    const lastAlertAt = alertEvents.length > 0
      ? (alertEvents[alertEvents.length - 1]?.timestamp || prev?.lastAlertAt || null)
      : (prev?.lastAlertAt || null);
    const postmortem = postmortemMap.get(id) || prev?.postmortem || {
      exists: false,
      filePath: null,
      status: null,
      generated: false,
      resolvedAt: null,
    };

    prevMap.set(id, {
      id,
      source: 'connectors_runtime',
      environment,
      status,
      severity,
      maxSeverity: severity,
      startedAt,
      detectedAt,
      openedAt: prev?.openedAt || startedAt || detectedAt || nowIso(),
      lastSeenAt,
      resolvedAt,
      ageMinutes: status === 'resolved'
        ? durationMinutes(prev?.openedAt || startedAt || detectedAt, resolvedAt)
        : ageMinutes(prev?.openedAt || startedAt || detectedAt, nowMs),
      durationMinutes: status === 'resolved'
        ? durationMinutes(prev?.openedAt || startedAt || detectedAt, resolvedAt)
        : null,
      violationCount: violations.length,
      violations,
      connectors,
      alertEventsCount: alertEvents.length,
      lastAlertAt,
      routing: route,
      ownerTeam: route.team,
      escalationTeam: route.team,
      postmortem,
      presentInSource: true,
    });
  }

  const records = [...prevMap.values()].map((item) => {
    const presentInSource = currentIds.has(String(item.id));
    const openedAt = item.openedAt || item.startedAt || item.detectedAt || null;
    const resolvedAt = item.status === 'resolved' ? item.resolvedAt || null : null;
    return {
      ...item,
      presentInSource,
      ageMinutes: item.status === 'resolved'
        ? durationMinutes(openedAt, resolvedAt)
        : ageMinutes(openedAt, nowMs),
      durationMinutes: item.status === 'resolved'
        ? durationMinutes(openedAt, resolvedAt)
        : null,
    };
  });

  records.sort((a, b) => {
    const aMs = parseMs(a.lastSeenAt || a.resolvedAt || a.startedAt);
    const bMs = parseMs(b.lastSeenAt || b.resolvedAt || b.startedAt);
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
  return records;
}

function normalizeDispatchBatch(deliveries, timestamp) {
  const rows = safeArray(deliveries).map((item) => ({
    channel: String(item?.channel || 'unknown').trim().toLowerCase() || 'unknown',
    attempted: Boolean(item?.attempted),
    ok: Boolean(item?.ok),
    status: Number.isFinite(Number(item?.status)) ? Number(item.status) : null,
    dryRun: Boolean(item?.dryRun),
  }));
  return {
    timestamp,
    attempted: rows.filter((item) => item.attempted).length,
    succeeded: rows.filter((item) => item.ok).length,
    deliveries: rows,
  };
}

function buildAlertRecords({
  alertReport,
  alertState,
  prevStore,
  routeMatrix,
  environment,
  nowMs,
}) {
  const prevMap = new Map(
    safeArray(prevStore?.alerts)
      .filter((item) => item?.key)
      .map((item) => [String(item.key), item]),
  );

  const currentViolations = safeArray(alertReport?.violations).map((item) => {
    const severity = normalizeSeverity(item?.severity || item?.status);
    const source = String(item?.source || 'unknown').trim().toLowerCase() || 'unknown';
    const code = String(item?.code || 'unknown').trim().toLowerCase() || 'unknown';
    return {
      key: alertKey({ source, code, message: item?.message }),
      source,
      code,
      message: String(item?.message || code || 'unknown').trim() || 'unknown',
      severity,
      blocking: Boolean(item?.blocking),
      environment: String(item?.environment || environment || 'unknown').trim().toLowerCase() || 'unknown',
    };
  });

  const currentKeys = new Set(currentViolations.map((item) => item.key));
  const dispatchOpenedKeys = safeArray(alertReport?.dispatch?.openedForDispatch).map(alertKey);
  const dispatchResolvedKeys = safeArray(alertReport?.dispatch?.resolvedForDispatch).map((item) => String(item || '').trim());
  const dispatchKeys = new Set([...dispatchOpenedKeys, ...dispatchResolvedKeys].filter(Boolean));
  const lastIssueSentAt = alertState?.lastIssueSentAt && typeof alertState.lastIssueSentAt === 'object'
    ? alertState.lastIssueSentAt
    : {};
  const lastDispatchAt = alertState?.lastDispatchAt || null;
  const dispatchBatch = normalizeDispatchBatch(alertReport?.dispatch?.deliveries, lastDispatchAt || alertReport?.generatedAt || nowIso());

  for (const raw of currentViolations) {
    const prev = prevMap.get(raw.key) || {};
    const route = resolveRoute(routeMatrix, { severity: raw.severity, source: raw.source });
    const dispatchHistory = safeArray(prev.dispatchHistory);
    const effectiveDispatchAt = lastIssueSentAt[raw.key] || lastDispatchAt || prev.lastDispatchAt || null;
    const shouldAppendDispatch = Boolean(
      dispatchKeys.has(raw.key)
        && effectiveDispatchAt
        && effectiveDispatchAt !== prev.lastDispatchAt,
    );
    prevMap.set(raw.key, {
      key: raw.key,
      source: raw.source,
      code: raw.code,
      message: raw.message,
      environment: raw.environment,
      status: 'open',
      severity: raw.severity,
      blocking: raw.blocking,
      openedAt: prev.openedAt || alertReport?.generatedAt || nowIso(),
      lastSeenAt: alertReport?.generatedAt || nowIso(),
      resolvedAt: null,
      ageMinutes: ageMinutes(prev.openedAt || alertReport?.generatedAt || nowIso(), nowMs),
      durationMinutes: null,
      occurrences: Number(prev.occurrences || 0) + 1,
      routing: route,
      ownerTeam: route.team,
      escalationTeam: route.team,
      lastDispatchAt: effectiveDispatchAt || prev.lastDispatchAt || null,
      dispatchAttemptCount: Number(prev.dispatchAttemptCount || 0) + (shouldAppendDispatch ? 1 : 0),
      dispatchSuccessCount: Number(prev.dispatchSuccessCount || 0) + (shouldAppendDispatch && dispatchBatch.succeeded > 0 ? 1 : 0),
      deliveryChannels: uniqueStrings([
        ...(prev.deliveryChannels || []),
        ...dispatchBatch.deliveries.map((item) => item.channel),
      ]).map((item) => item.toLowerCase()),
      dispatchHistory: shouldAppendDispatch
        ? tail([...dispatchHistory, dispatchBatch], 10)
        : dispatchHistory,
      presentInSource: true,
    });
  }

  const records = [];
  for (const item of prevMap.values()) {
    const isCurrent = currentKeys.has(String(item.key));
    const status = isCurrent ? 'open' : 'resolved';
    const openedAt = item.openedAt || item.lastSeenAt || alertReport?.generatedAt || nowIso();
    const resolvedAt = status === 'resolved' ? (item.resolvedAt || alertReport?.generatedAt || nowIso()) : null;
    const dispatchHistory = safeArray(item.dispatchHistory);
    const effectiveDispatchAt = lastIssueSentAt[item.key] || lastDispatchAt || item.lastDispatchAt || null;
    const shouldAppendResolvedDispatch = Boolean(
      status === 'resolved'
        && dispatchKeys.has(String(item.key))
        && effectiveDispatchAt
        && effectiveDispatchAt !== item.lastDispatchAt,
    );
    records.push({
      ...item,
      status,
      presentInSource: isCurrent,
      resolvedAt,
      lastDispatchAt: effectiveDispatchAt || item.lastDispatchAt || null,
      dispatchAttemptCount: Number(item.dispatchAttemptCount || 0) + (shouldAppendResolvedDispatch ? 1 : 0),
      dispatchSuccessCount: Number(item.dispatchSuccessCount || 0) + (shouldAppendResolvedDispatch && dispatchBatch.succeeded > 0 ? 1 : 0),
      deliveryChannels: uniqueStrings([
        ...(item.deliveryChannels || []),
        ...dispatchBatch.deliveries.map((entry) => entry.channel),
      ]).map((entry) => entry.toLowerCase()),
      dispatchHistory: shouldAppendResolvedDispatch
        ? tail([...dispatchHistory, dispatchBatch], 10)
        : dispatchHistory,
      ageMinutes: status === 'resolved'
        ? durationMinutes(openedAt, resolvedAt)
        : ageMinutes(openedAt, nowMs),
      durationMinutes: status === 'resolved'
        ? durationMinutes(openedAt, resolvedAt)
        : null,
    });
  }

  records.sort((a, b) => {
    const aMs = parseMs(a.lastSeenAt || a.resolvedAt || a.openedAt);
    const bMs = parseMs(b.lastSeenAt || b.resolvedAt || b.openedAt);
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
  return records;
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
    for (const item of safeArray(incident?.routing?.channels)) row.channels.add(String(item).toLowerCase());
    row.sources.add(String(incident?.source || 'connectors_runtime').toLowerCase());
  }

  for (const alert of alerts) {
    const row = ensure(alert?.ownerTeam || alert?.routing?.team);
    if (alert?.status === 'resolved') row.resolvedAlerts += 1;
    else row.activeAlerts += 1;
    if (alert?.status !== 'resolved' && alert?.severity === 'critical') row.criticalActiveAlerts += 1;
    for (const item of safeArray(alert?.routing?.channels)) row.channels.add(String(item).toLowerCase());
    row.sources.add(String(alert?.source || 'unknown').toLowerCase());
  }

  return [...map.values()]
    .map((item) => ({
      team: item.team,
      openIncidents: item.openIncidents,
      resolvedIncidents: item.resolvedIncidents,
      criticalOpenIncidents: item.criticalOpenIncidents,
      activeAlerts: item.activeAlerts,
      resolvedAlerts: item.resolvedAlerts,
      criticalActiveAlerts: item.criticalActiveAlerts,
      channels: [...item.channels].sort(),
      sources: [...item.sources].sort(),
    }))
    .sort((a, b) => a.team.localeCompare(b.team));
}

function summarizeIncidents(incidents) {
  const open = incidents.filter((item) => item.status !== 'resolved');
  const resolved = incidents.filter((item) => item.status === 'resolved');
  return {
    total: incidents.length,
    open: open.length,
    resolved: resolved.length,
    openCritical: open.filter((item) => item.severity === 'critical').length,
    openWarning: open.filter((item) => item.severity === 'warning').length,
    openInfo: open.filter((item) => item.severity === 'info').length,
  };
}

function summarizeAlerts(alerts) {
  const active = alerts.filter((item) => item.status !== 'resolved');
  const resolved = alerts.filter((item) => item.status === 'resolved');
  return {
    total: alerts.length,
    active: active.length,
    resolved: resolved.length,
    activeCritical: active.filter((item) => item.severity === 'critical').length,
    activeWarning: active.filter((item) => item.severity === 'warning').length,
    activeInfo: active.filter((item) => item.severity === 'info').length,
  };
}

function buildDashboard({
  ts,
  status,
  summary,
  routing,
  teams,
  incidents,
  alerts,
  violations,
}) {
  const lines = [];
  lines.push('# Fullcycle Connectors Observability Backend');
  lines.push('');
  lines.push(`- Generated at: ${ts}`);
  lines.push(`- Status: ${status.toUpperCase()}`);
  lines.push(`- Environment: ${summary.environment}`);
  lines.push(`- Stream status: ${summary.streamStatus}`);
  lines.push(`- Alerting status: ${summary.alertingStatus}`);
  lines.push(`- API SLA status: ${summary.latestApiSla?.status || 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| Open incidents | ${summary.incidents.open} |`);
  lines.push(`| Open critical incidents | ${summary.incidents.openCritical} |`);
  lines.push(`| Active alerts | ${summary.alerts.active} |`);
  lines.push(`| Active critical alerts | ${summary.alerts.activeCritical} |`);
  lines.push(`| Teams tracked | ${teams.length} |`);
  lines.push(`| Routes configured | ${Object.keys(routing.sources || {}).length + Object.keys(routing.severity || {}).length} |`);
  lines.push('');
  lines.push('## Routing Matrix');
  lines.push('');
  lines.push('| Rule | Team | Channels | Escalate after (min) |');
  lines.push('|---|---|---|---:|');
  for (const [severity, rule] of Object.entries(routing.severity || {})) {
    lines.push(`| severity:${severity} | ${rule.team} | ${(rule.channels || []).join(', ') || 'n/a'} | ${rule.escalateAfterMinutes ?? 'n/a'} |`);
  }
  for (const [source, rule] of Object.entries(routing.sources || {})) {
    lines.push(`| source:${source} | ${rule.team} | ${(rule.channels || []).join(', ') || 'n/a'} | ${rule.escalateAfterMinutes ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Teams');
  lines.push('');
  lines.push('| Team | Open incidents | Critical open incidents | Active alerts | Critical active alerts | Channels |');
  lines.push('|---|---:|---:|---:|---:|---|');
  if (teams.length === 0) {
    lines.push('| - | 0 | 0 | 0 | 0 | n/a |');
  } else {
    for (const item of teams) {
      lines.push(`| ${item.team} | ${item.openIncidents} | ${item.criticalOpenIncidents} | ${item.activeAlerts} | ${item.criticalActiveAlerts} | ${(item.channels || []).join(', ') || 'n/a'} |`);
    }
  }
  lines.push('');
  lines.push('## Incidents');
  lines.push('');
  lines.push('| ID | Status | Severity | Team | Connectors | Started | Resolved | Postmortem |');
  lines.push('|---|---|---|---|---|---|---|---|');
  const incidentRows = incidents.slice(0, 20);
  if (incidentRows.length === 0) {
    lines.push('| - | - | - | - | - | - | - | - |');
  } else {
    for (const item of incidentRows) {
      lines.push(`| ${item.id} | ${item.status} | ${item.severity} | ${item.ownerTeam || 'unassigned'} | ${(item.connectors || []).join(', ') || 'n/a'} | ${item.startedAt || 'n/a'} | ${item.resolvedAt || 'n/a'} | ${item.postmortem?.exists ? 'yes' : 'no'} |`);
    }
  }
  lines.push('');
  lines.push('## Alerts');
  lines.push('');
  lines.push('| Key | Status | Severity | Source | Team | Last seen | Dispatches |');
  lines.push('|---|---|---|---|---|---|---:|');
  const alertRows = alerts.slice(0, 20);
  if (alertRows.length === 0) {
    lines.push('| - | - | - | - | - | - | 0 |');
  } else {
    for (const item of alertRows) {
      lines.push(`| ${item.key} | ${item.status} | ${item.severity} | ${item.source} | ${item.ownerTeam || 'unassigned'} | ${item.lastSeenAt || item.resolvedAt || 'n/a'} | ${item.dispatchAttemptCount || 0} |`);
    }
  }
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
  const ts = nowIso();
  const nowMs = parseMs(ts);
  const cfg = {
    incidentsFile: process.env.FULLCYCLE_CONNECTOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-incidents.json'),
    operationsReportFile: process.env.FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-operations-report.json'),
    alertReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-report.json'),
    alertStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-state.json'),
    apiSlaHistoryFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-sla-history.json'),
    streamStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-state.json'),
    streamReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    backendStoreFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json'),
    backendReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json'),
    backendDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-backend.md'),
    backendAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-audit.jsonl'),
    routeMatrixFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE || path.resolve(process.cwd(), 'config/observability-routing.example.json'),
    environment: String(process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT || process.env.FULLCYCLE_CONNECTOR_ENVIRONMENT || process.env.NODE_ENV || 'development').trim().toLowerCase() || 'development',
    defaultTeam: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_TEAM', 'comercial-ops'),
    criticalTeam: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_CRITICAL_TEAM', 'platform-oncall'),
    warningTeam: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_WARNING_TEAM', 'comercial-ops'),
    infoTeam: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_INFO_TEAM', 'comercial-ops'),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS', false),
    requireIncidents: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS', true),
    requireAlertReport: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT', true),
    requireApiSlaHistory: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY', true),
    maxOpenCriticalIncidents: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS', 0)),
    maxActiveCriticalAlerts: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS', 0)),
    maxIncidentRecords: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_INCIDENT_RECORDS', 500)),
    maxAlertRecords: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ALERT_RECORDS', 500)),
  };

  const fallbackMatrix = buildFallbackRouteMatrix(cfg);
  const [routeMatrixRaw, prevStore, incidentsState, operationsReport, alertReport, alertState, apiSlaHistory, streamState, streamReport] = await Promise.all([
    readJson(cfg.routeMatrixFile, null),
    readJson(cfg.backendStoreFile, { version: 1, incidents: [], alerts: [], teams: [], routing: fallbackMatrix }),
    readJson(cfg.incidentsFile, { incidents: [] }),
    readJson(cfg.operationsReportFile, { summary: {}, postmortems: [] }),
    readJson(cfg.alertReportFile, null),
    readJson(cfg.alertStateFile, {}),
    readJson(cfg.apiSlaHistoryFile, { history: [] }),
    readJson(cfg.streamStateFile, null),
    readJson(cfg.streamReportFile, null),
  ]);

  const routing = normalizeRouteMatrix(routeMatrixRaw, fallbackMatrix);
  const postmortemMap = buildPostmortemMap(operationsReport);
  const environment = String(
    operationsReport?.summary?.environment
      || apiSlaHistory?.history?.[apiSlaHistory.history.length - 1]?.environment
      || cfg.environment,
  ).trim().toLowerCase() || cfg.environment;

  const incidents = buildIncidentRecords({
    incidentsState,
    prevStore,
    postmortemMap,
    routeMatrix: routing,
    environment,
    nowMs,
  }).slice(0, cfg.maxIncidentRecords);

  const alerts = buildAlertRecords({
    alertReport,
    alertState,
    prevStore,
    routeMatrix: routing,
    environment,
    nowMs,
  }).slice(0, cfg.maxAlertRecords);

  const latestApiSla = safeArray(apiSlaHistory?.history).length > 0
    ? apiSlaHistory.history[apiSlaHistory.history.length - 1]
    : null;
  const incidentSummary = summarizeIncidents(incidents);
  const alertSummary = summarizeAlerts(alerts);
  const teams = buildTeamSummary(incidents, alerts);
  const openIncidents = incidents.filter((item) => item.status !== 'resolved');
  const activeAlerts = alerts.filter((item) => item.status !== 'resolved');

  const violations = [];
  if (cfg.requireIncidents && safeArray(incidentsState?.incidents).length === 0) {
    violations.push({
      code: 'incidents_unavailable',
      blocking: true,
      message: `connector incidents unavailable at ${cfg.incidentsFile}`,
    });
  }
  if (cfg.requireAlertReport && !alertReport) {
    violations.push({
      code: 'alert_report_unavailable',
      blocking: true,
      message: `alert report unavailable at ${cfg.alertReportFile}`,
    });
  }
  if (cfg.requireApiSlaHistory && !latestApiSla) {
    violations.push({
      code: 'api_sla_history_unavailable',
      blocking: true,
      message: `api sla history unavailable at ${cfg.apiSlaHistoryFile}`,
    });
  }
  if (incidentSummary.openCritical > cfg.maxOpenCriticalIncidents) {
    violations.push({
      code: 'open_critical_incidents_above_target',
      blocking: true,
      message: `open critical incidents ${incidentSummary.openCritical} > ${cfg.maxOpenCriticalIncidents}`,
    });
  }
  if (alertSummary.activeCritical > cfg.maxActiveCriticalAlerts) {
    violations.push({
      code: 'active_critical_alerts_above_target',
      blocking: true,
      message: `active critical alerts ${alertSummary.activeCritical} > ${cfg.maxActiveCriticalAlerts}`,
    });
  }
  const unassignedTeams = [
    ...openIncidents.filter((item) => !item.ownerTeam || item.ownerTeam === 'unassigned').map((item) => `incident:${item.id}`),
    ...activeAlerts.filter((item) => !item.ownerTeam || item.ownerTeam === 'unassigned').map((item) => `alert:${item.key}`),
  ];
  if (unassignedTeams.length > 0) {
    violations.push({
      code: 'routing_unassigned_team',
      blocking: true,
      message: `records without assigned team: ${unassignedTeams.join(', ')}`,
    });
  }

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const summary = {
    environment,
    streamStatus: normalizeStatus(streamReport?.status || streamState?.status, 'unknown'),
    alertingStatus: normalizeStatus(alertReport?.status, 'unknown'),
    cursor: Number(streamState?.cursor ?? 0),
    incidents: incidentSummary,
    alerts: alertSummary,
    teamsTracked: teams.length,
    latestApiSla: latestApiSla
      ? {
        timestamp: latestApiSla.timestamp || latestApiSla.generatedAt || null,
        environment: latestApiSla.environment || environment,
        status: normalizeStatus(latestApiSla.status, 'unknown'),
        availabilityPct: Number.isFinite(Number(latestApiSla.availabilityPct)) ? Number(latestApiSla.availabilityPct) : null,
        worstLatencyMs: Number.isFinite(Number(latestApiSla.worstLatencyMs)) ? Number(latestApiSla.worstLatencyMs) : null,
        observedPayloadAgeMinutes: Number.isFinite(Number(latestApiSla.observedPayloadAgeMinutes)) ? Number(latestApiSla.observedPayloadAgeMinutes) : null,
        blockingViolations: Number.isFinite(Number(latestApiSla.blockingViolations)) ? Number(latestApiSla.blockingViolations) : null,
      }
      : null,
    violations: violations.length,
    blockingViolations: blockingViolations.length,
  };

  const store = {
    version: 1,
    generatedAt: ts,
    status,
    routing,
    summary,
    teams,
    incidents,
    alerts,
  };

  const report = {
    generatedAt: ts,
    status,
    summary,
    config: {
      incidentsFile: cfg.incidentsFile,
      operationsReportFile: cfg.operationsReportFile,
      alertReportFile: cfg.alertReportFile,
      alertStateFile: cfg.alertStateFile,
      apiSlaHistoryFile: cfg.apiSlaHistoryFile,
      streamStateFile: cfg.streamStateFile,
      streamReportFile: cfg.streamReportFile,
      backendStoreFile: cfg.backendStoreFile,
      backendReportFile: cfg.backendReportFile,
      backendDashboardFile: cfg.backendDashboardFile,
      backendAuditFile: cfg.backendAuditFile,
      routeMatrixFile: cfg.routeMatrixFile,
      enforceTargets: cfg.enforceTargets,
      requireIncidents: cfg.requireIncidents,
      requireAlertReport: cfg.requireAlertReport,
      requireApiSlaHistory: cfg.requireApiSlaHistory,
      maxOpenCriticalIncidents: cfg.maxOpenCriticalIncidents,
      maxActiveCriticalAlerts: cfg.maxActiveCriticalAlerts,
      maxIncidentRecords: cfg.maxIncidentRecords,
      maxAlertRecords: cfg.maxAlertRecords,
    },
    inputs: {
      incidentsSourceCount: safeArray(incidentsState?.incidents).length,
      alertsSourceCount: safeArray(alertReport?.violations).length,
      apiSlaPoints: safeArray(apiSlaHistory?.history).length,
      postmortemsTracked: postmortemMap.size,
    },
    violations,
  };

  await writeJson(cfg.backendStoreFile, store);
  await writeJson(cfg.backendReportFile, report);
  await writeText(cfg.backendDashboardFile, buildDashboard({
    ts,
    status,
    summary,
    routing,
    teams,
    incidents,
    alerts,
    violations,
  }));
  await appendLine(cfg.backendAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase30-observability-backend-consolidation',
    status,
    summary,
    violations,
    backendStoreFile: cfg.backendStoreFile,
    backendReportFile: cfg.backendReportFile,
  }));

  console.log(`Observability backend store: ${cfg.backendStoreFile}`);
  console.log(`Observability backend report: ${cfg.backendReportFile}`);
  console.log(`Observability backend dashboard: ${cfg.backendDashboardFile}`);
  console.log(`Observability backend audit: ${cfg.backendAuditFile}`);
  console.log(`[OBS-BACKEND] status=${status} openIncidents=${incidentSummary.open} activeAlerts=${alertSummary.active} teams=${teams.length} violations=${violations.length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[OBS-BACKEND] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase30 backend consolidation failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
