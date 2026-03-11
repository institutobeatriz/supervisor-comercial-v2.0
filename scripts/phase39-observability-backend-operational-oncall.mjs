import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadOperationalProvider } from './observability-operational-provider.mjs';

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

function envCsvSet(name, fallbackCsv) {
  const raw = process.env[name] || fallbackCsv;
  return new Set(
    String(raw || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw || fallback;
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

async function readJson(filePath, fallback = null) {
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

async function writeText(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, payload, 'utf-8');
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
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function normalizeExternal(snapshot, key) {
  const direct = safeArray(snapshot?.[key]);
  const nested = safeArray(snapshot?.items?.[key]);
  const source = direct.length > 0 ? direct : nested;
  return source
    .map((item) => ({
      externalId: String(item?.externalId || item?.external_id || item?.id || item?.key || '').trim(),
      incidentId: String(item?.incidentId || item?.incident_id || item?.localIncidentId || item?.local_incident_id || '').trim(),
      status: normalizeStatus(item?.status || item?.state || item?.phase),
      owner: String(item?.owner || item?.assignee || '').trim(),
      raw: item,
    }))
    .filter((item) => item.externalId || item.incidentId);
}

function mapBy(items, key) {
  const out = new Map();
  for (const item of items) {
    const value = String(item?.[key] || '').trim();
    if (!value || out.has(value)) continue;
    out.set(value, item);
  }
  return out;
}

function buildEscalation(item) {
  const targetMinutes = Number(item?.routing?.escalateAfterMinutes);
  const age = Number(item?.ageMinutes);
  const isOpen = normalizeStatus(item?.status, 'unknown') !== 'resolved';
  const target = Number.isFinite(targetMinutes) ? targetMinutes : null;
  const ageMinutesValue = Number.isFinite(age) ? age : null;
  const breached = Boolean(isOpen && target !== null && ageMinutesValue !== null && ageMinutesValue >= target);
  return {
    targetMinutes: target,
    ageMinutes: ageMinutesValue,
    breached,
    status: breached ? 'breached' : (isOpen ? 'tracking' : 'resolved'),
  };
}

function cloneRecord(item, nowMs) {
  const openedAt = item?.openedAt || item?.startedAt || item?.detectedAt || null;
  const resolvedAt = normalizeStatus(item?.status, 'unknown') === 'resolved' ? (item?.resolvedAt || null) : null;
  return {
    ...item,
    severity: normalizeSeverity(item?.severity),
    ownerTeam: String(item?.ownerTeam || item?.routing?.team || '').trim() || 'unassigned',
    escalationTeam: String(item?.escalationTeam || item?.ownerTeam || item?.routing?.team || '').trim() || 'unassigned',
    ageMinutes: normalizeStatus(item?.status, 'unknown') === 'resolved'
      ? durationMinutes(openedAt, resolvedAt)
      : ageMinutes(openedAt, nowMs),
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

function buildAnalytics({ ts, environment, incidents, alerts, teams, prevAnalytics, providerMeta }) {
  const openIncidents = incidents.filter((item) => item.status !== 'resolved');
  const activeAlerts = alerts.filter((item) => item.status !== 'resolved');
  const allActive = [...openIncidents, ...activeAlerts];
  const ownership = summarizeOwnership(allActive);
  const breachedEscalations = allActive.filter((item) => item?.escalation?.breached).length;
  const operationalProvider = {
    mode: providerMeta?.mode || 'unknown',
    contractLoaded: Boolean(providerMeta?.contractLoaded),
    contractVersion: providerMeta?.contractVersion || null,
    contractSchema: providerMeta?.contractSchema || null,
    producerMode: providerMeta?.producerMode || null,
    producerReady: providerMeta?.producerReady ?? null,
    legacyFallbackState: providerMeta?.legacyFallbackState || null,
    legacyFallbackAllowed: providerMeta?.legacyFallbackAllowed === true,
    loadedSources: Number(providerMeta?.summary?.loadedSources || 0),
    missingSources: Number(providerMeta?.summary?.missingSources || 0),
  };
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
    operationalProvider,
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
    operationalProvider,
  };

  return {
    version: 1,
    generatedAt: ts,
    current,
    entries: [...previousEntries, snapshot],
  };
}

function buildDashboard({ ts, status, summary, teams, incidents, alerts, analytics, violations, oncall }) {
  const lines = [
    '# Fullcycle Connectors Observability Backend',
    '',
    `- Generated at: ${ts}`,
    `- Status: ${status.toUpperCase()}`,
    `- Environment: ${summary.environment}`,
    `- Stream status: ${summary.streamStatus}`,
    `- Alerting status: ${summary.alertingStatus}`,
    `- API SLA status: ${summary.latestApiSla?.status || 'unknown'}`,
    `- Owner coverage: ${summary.ownerCoveragePct}%`,
    `- Breached escalations: ${summary.breachedEscalations}`,
    '',
    '## On-call Source',
    '',
    `- Source mode: ${oncall.sourceMode}`,
    `- Provider mode: ${oncall.operationalProvider?.mode || 'unknown'}`,
    `- Contract loaded: ${oncall.operationalProvider?.contractLoaded ? 'yes' : 'no'}`,
    `- Contract version: ${oncall.operationalProvider?.contractVersion || 'n/a'}`,
    `- Operational state loaded: ${oncall.operationalStateLoaded ? 'yes' : 'no'}`,
    `- Snapshot loaded: ${oncall.snapshotLoaded ? 'yes' : 'no'}`,
    `- Direct operational owners: ${oncall.directAssignments}`,
    `- Roster entries: ${oncall.rosterEntries}`,
    `- Team fallback entries: ${oncall.teamFallbackEntries}`,
    '',
    '## Ownership and Escalation',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Active records | ${analytics.current.activeRecords} |`,
    `| Assigned owners | ${analytics.current.assignedOwners} |`,
    `| Unassigned owners | ${analytics.current.unassignedOwners} |`,
    `| Owner coverage % | ${analytics.current.ownerCoveragePct} |`,
    `| Breached escalations | ${analytics.current.breachedEscalations} |`,
    `| Analytics history points | ${analytics.entries.length} |`,
    '',
    '## Teams',
    '',
    '| Team | Open incidents | Active alerts | Pending escalations | Owners | Channels |',
    '|---|---:|---:|---:|---|---|',
  ];

  if (teams.length === 0) {
    lines.push('| - | 0 | 0 | 0 | n/a | n/a |');
  } else {
    for (const item of teams) {
      lines.push(`| ${item.team} | ${item.openIncidents} | ${item.activeAlerts} | ${item.pendingEscalations} | ${(item.owners || []).join(', ') || 'n/a'} | ${(item.channels || []).join(', ') || 'n/a'} |`);
    }
  }

  lines.push('', '## Incidents', '', '| ID | Status | Severity | Team | Owner | Source | Escalation | Started |', '|---|---|---|---|---|---|---|---|');
  for (const item of incidents.slice(0, 20)) {
    lines.push(`| ${item.id} | ${item.status} | ${item.severity} | ${item.ownerTeam || 'unassigned'} | ${item.owner || 'unassigned'} | ${item.ownerSource || 'n/a'} | ${item.escalation?.status || 'n/a'} | ${item.startedAt || item.openedAt || 'n/a'} |`);
  }
  if (incidents.length === 0) lines.push('| - | - | - | - | - | - | - | - |');

  lines.push('', '## Alerts', '', '| Key | Status | Severity | Team | Owner | Source | Escalation | Last seen |', '|---|---|---|---|---|---|---|---|');
  for (const item of alerts.slice(0, 20)) {
    lines.push(`| ${item.key} | ${item.status} | ${item.severity} | ${item.ownerTeam || 'unassigned'} | ${item.owner || 'unassigned'} | ${item.ownerSource || 'n/a'} | ${item.escalation?.status || 'n/a'} | ${item.lastSeenAt || item.openedAt || 'n/a'} |`);
  }
  if (alerts.length === 0) lines.push('| - | - | - | - | - | - | - | - |');

  lines.push('', '## Recent Analytics', '', '| Timestamp | Coverage % | Open incidents | Active alerts | Breached escalations |', '|---|---:|---:|---:|---:|');
  for (const item of analytics.entries.slice(-10).reverse()) {
    lines.push(`| ${item.timestamp} | ${item.ownerCoveragePct} | ${item.openIncidents} | ${item.activeAlerts} | ${item.breachedEscalations} |`);
  }
  if (analytics.entries.length === 0) lines.push('| - | 0 | 0 | 0 | 0 |');

  lines.push('', '## Violations', '');
  if (violations.length === 0) lines.push('- none');
  else for (const item of violations) lines.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
  lines.push('');
  return lines.join('\n');
}

function findRemoteRecord(record, byExternal, byIncident, incidentId) {
  const localExternal = String(record?.externalId || '').trim();
  if (localExternal) {
    const byExt = byExternal.get(localExternal);
    if (byExt) return byExt;
  }
  return byIncident.get(String(incidentId || '').trim()) || null;
}

function isOperationalRemoteCandidate(remote, localStatus, openStatuses) {
  if (!remote || !String(remote.owner || '').trim()) return false;
  if (normalizeStatus(localStatus, 'unknown') === 'resolved') return true;
  return openStatuses.has(normalizeStatus(remote.status, 'unknown'));
}

function resolveOperationalDirectOwner({ incident, stateRecord, snapshotMaps, openStatuses, timezone, nowIso }) {
  const localStatus = normalizeStatus(incident?.status, 'unknown');
  const pagingRemote = findRemoteRecord(stateRecord?.paging || {}, snapshotMaps.pagingByExternal, snapshotMaps.pagingByIncident, incident?.id);
  if (isOperationalRemoteCandidate(pagingRemote, localStatus, openStatuses.paging)) {
    return {
      owner: String(pagingRemote.owner).trim(),
      source: 'operational_snapshot_paging',
      ruleId: String(pagingRemote.externalId || pagingRemote.incidentId || incident?.id || 'snapshot-paging'),
      referenceTime: stateRecord?.updatedAt || stateRecord?.ownerAssignedAt || incident?.lastSeenAt || incident?.detectedAt || nowIso,
      timezone,
    };
  }

  const ticketRemote = findRemoteRecord(stateRecord?.ticket || {}, snapshotMaps.ticketByExternal, snapshotMaps.ticketByIncident, incident?.id);
  if (isOperationalRemoteCandidate(ticketRemote, localStatus, openStatuses.ticket)) {
    return {
      owner: String(ticketRemote.owner).trim(),
      source: 'operational_snapshot_ticket',
      ruleId: String(ticketRemote.externalId || ticketRemote.incidentId || incident?.id || 'snapshot-ticket'),
      referenceTime: stateRecord?.updatedAt || stateRecord?.ownerAssignedAt || incident?.lastSeenAt || incident?.detectedAt || nowIso,
      timezone,
    };
  }

  const stateOwner = String(stateRecord?.owner || '').trim();
  if (stateOwner) {
    return {
      owner: stateOwner,
      source: 'operational_state',
      ruleId: String(incident?.id || 'state'),
      referenceTime: stateRecord?.ownerAssignedAt || stateRecord?.updatedAt || incident?.lastSeenAt || incident?.detectedAt || nowIso,
      timezone: String(stateRecord?.ownerTimezone || timezone || '').trim() || timezone,
    };
  }

  return null;
}

function buildOperationalRoster(entries) {
  const exact = new Map();
  const teamOnly = new Map();

  function maybeSet(map, key, value) {
    const current = map.get(key);
    const currentMs = parseMs(current?.referenceTime);
    const nextMs = parseMs(value?.referenceTime);
    if (!current || (Number.isFinite(nextMs) && nextMs >= (Number.isFinite(currentMs) ? currentMs : 0))) {
      map.set(key, value);
    }
  }

  for (const entry of entries) {
    const team = String(entry?.team || '').trim().toLowerCase();
    const tier = String(entry?.tier || '').trim().toUpperCase();
    if (!team || !tier || !String(entry?.owner || '').trim()) continue;
    maybeSet(exact, `${team}::${tier}`, entry);
    maybeSet(teamOnly, team, entry);
  }

  return { exact, teamOnly, exactCount: exact.size, teamCount: teamOnly.size };
}

function resolveRosterOwner(record, roster) {
  const team = String(record?.ownerTeam || record?.routing?.team || '').trim().toLowerCase();
  const tier = String(record?.ownerTier || tierBySeverity(record?.severity)).trim().toUpperCase();
  if (!team) return null;
  return roster.exact.get(`${team}::${tier}`) || roster.teamOnly.get(team) || null;
}

function applyOwner(record, decision, nowIso, fallbackTimezone) {
  const out = { ...record };
  out.ownerTier = out.ownerTier || tierBySeverity(out.severity);
  out.ownerReferenceTime = decision?.referenceTime || out.ownerReferenceTime || out.lastSeenAt || out.detectedAt || nowIso;
  out.ownerTimezone = decision?.timezone || out.ownerTimezone || fallbackTimezone;
  out.ownerAssignedAt = decision?.owner ? (decision.assignedAt || nowIso) : null;
  out.ownerRuleId = decision?.ruleId || null;
  out.ownerSource = decision?.source || null;
  out.owner = decision?.owner || null;
  out.escalation = buildEscalation(out);
  return out;
}

function preserveExistingOwner(record, nowIso, fallbackTimezone) {
  const owner = String(record?.owner || '').trim();
  if (!owner) return null;
  return {
    owner,
    source: String(record?.ownerSource || 'manual').trim() || 'manual',
    ruleId: String(record?.ownerRuleId || '').trim() || null,
    referenceTime: record?.ownerReferenceTime || record?.ownerAssignedAt || record?.lastSeenAt || record?.detectedAt || nowIso,
    timezone: String(record?.ownerTimezone || fallbackTimezone || '').trim() || fallbackTimezone,
    assignedAt: record?.ownerAssignedAt || nowIso,
  };
}

async function main() {
  const ts = new Date().toISOString();
  const nowMs = parseMs(ts);
  const cfg = {
    phase32Script: path.resolve(process.cwd(), 'scripts/phase32-observability-backend-oncall-analytics.mjs'),
    backendStoreFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json'),
    backendReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json'),
    backendDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-backend.md'),
    backendAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-audit.jsonl'),
    backendAnalyticsFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-analytics.json'),
    providerMode: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
    contractFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    materializeContract: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    allowLegacyFallback: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
    automationStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE || process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    snapshotFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE || process.env.ITSM_SNAPSHOT_FILE || path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'),
    fullcycleReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE || process.env.FULLCYCLE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'),
    requireOperationalSource: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE', true),
    requireSnapshot: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT', false),
    preserveManualOwner: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER', envBool('ONCALL_OWNER_PRESERVE_MANUAL', true)),
    minOwnerCoveragePct: Math.max(0, Math.min(100, envFloat('FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT', 100))),
    maxAnalyticsEntries: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES', 400)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS', false),
    operationalTimezone: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_TIMEZONE', 'America/Sao_Paulo'),
    pagingOpenStatuses: envCsvSet('ONCALL_PAGING_OPEN_STATUSES', 'open,triggered,acknowledged,firing'),
    ticketOpenStatuses: envCsvSet('ITSM_TICKET_OPEN_STATUSES', 'open,in_progress,triage,acknowledged'),
  };

  const phase32Run = await runNode(cfg.phase32Script, {
    ...process.env,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '0',
  });
  if ((phase32Run.status ?? 1) !== 0) {
    if (phase32Run.stdout.trim()) process.stdout.write(phase32Run.stdout);
    if (phase32Run.stderr.trim()) process.stderr.write(phase32Run.stderr);
    throw new Error(`phase32 backend baseline failed with status=${phase32Run.status}`);
  }

  const [baseStore, baseReport, prevAnalytics] = await Promise.all([
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.backendReportFile, null),
    readJson(cfg.backendAnalyticsFile, { entries: [] }),
  ]);
  if (!baseStore || !baseReport) throw new Error('phase39 backend prerequisites missing after baseline run');
  const provider = await loadOperationalProvider({
    ts,
    providerMode: cfg.providerMode,
    materializeContract: cfg.materializeContract,
    allowLegacyFallback: cfg.allowLegacyFallback,
    contractFile: cfg.contractFile,
    automationStateFile: cfg.automationStateFile,
    snapshotFile: cfg.snapshotFile,
    fullcycleReportFile: cfg.fullcycleReportFile,
    materializedBy: 'phase39-observability-backend-operational-oncall',
  });
  const automationState = provider.automationState;
  const snapshot = provider.snapshot;
  const fullcycleReport = provider.fullcycleReport;
  const providerMeta = provider.meta;
  const baselineGeneratedAt = String(baseStore.generatedAt || '');
  const previousEntries = safeArray(prevAnalytics?.entries);
  const sanitizedPrevEntries = previousEntries.length > 0
    && String(previousEntries[previousEntries.length - 1]?.timestamp || '') === baselineGeneratedAt
    ? previousEntries.slice(0, -1)
    : previousEntries;

  const snapshotMaps = {
    ticketByExternal: mapBy(normalizeExternal(snapshot, 'tickets'), 'externalId'),
    ticketByIncident: mapBy(normalizeExternal(snapshot, 'tickets'), 'incidentId'),
    pagingByExternal: mapBy(normalizeExternal(snapshot, 'paging'), 'externalId'),
    pagingByIncident: mapBy(normalizeExternal(snapshot, 'paging'), 'incidentId'),
  };
  const stateIncidents = automationState && typeof automationState === 'object' && !Array.isArray(automationState) && automationState.incidents ? automationState.incidents : {};

  const incidentClones = safeArray(baseStore.incidents).map((item) => cloneRecord(item, nowMs));
  const directIncidentAssignments = new Map();
  const directEntries = [];
  for (const incident of incidentClones) {
    const stateRecord = stateIncidents[String(incident.id || '').trim()] || {};
    const direct = resolveOperationalDirectOwner({
      incident,
      stateRecord,
      snapshotMaps,
      openStatuses: { paging: cfg.pagingOpenStatuses, ticket: cfg.ticketOpenStatuses },
      timezone: cfg.operationalTimezone,
      nowIso: ts,
    });
    if (!direct?.owner) continue;
    directIncidentAssignments.set(String(incident.id), direct);
    if (normalizeStatus(incident.status, 'unknown') !== 'resolved') {
      directEntries.push({
        team: String(incident.ownerTeam || incident.routing?.team || '').trim() || 'unassigned',
        tier: incident.ownerTier || tierBySeverity(incident.severity),
        owner: direct.owner,
        source: direct.source,
        ruleId: direct.ruleId,
        referenceTime: direct.referenceTime,
        timezone: direct.timezone,
      });
    }
  }

  const roster = buildOperationalRoster(directEntries);
  const incidents = incidentClones.map((incident) => {
    const direct = directIncidentAssignments.get(String(incident.id || ''));
    const rosterOwner = resolveRosterOwner(incident, roster);
    const rosterDecision = rosterOwner ? {
      owner: rosterOwner.owner,
      source: 'operational_roster',
      ruleId: rosterOwner.ruleId || `${rosterOwner.team || incident.ownerTeam}:${rosterOwner.tier || incident.ownerTier || tierBySeverity(incident.severity)}`,
      referenceTime: rosterOwner.referenceTime,
      timezone: rosterOwner.timezone || cfg.operationalTimezone,
    } : null;
    const preserved = cfg.preserveManualOwner ? preserveExistingOwner(incident, ts, cfg.operationalTimezone) : null;
    const decision = direct || rosterDecision || preserved;
    return applyOwner(incident, decision, ts, cfg.operationalTimezone);
  });

  const alerts = safeArray(baseStore.alerts).map((item) => {
    const record = cloneRecord(item, nowMs);
    record.ownerTier = record.ownerTier || tierBySeverity(record.severity);
    const rosterOwner = resolveRosterOwner(record, roster);
    const rosterDecision = rosterOwner ? {
      owner: rosterOwner.owner,
      source: 'operational_roster',
      ruleId: rosterOwner.ruleId || `${rosterOwner.team || record.ownerTeam}:${rosterOwner.tier || record.ownerTier}`,
      referenceTime: rosterOwner.referenceTime,
      timezone: rosterOwner.timezone || cfg.operationalTimezone,
    } : null;
    const preserved = cfg.preserveManualOwner ? preserveExistingOwner(record, ts, cfg.operationalTimezone) : null;
    const decision = rosterDecision || preserved;
    return applyOwner(record, decision, ts, cfg.operationalTimezone);
  });

  const teams = buildTeamSummary(incidents, alerts);
  const analytics = buildAnalytics({
    ts,
    environment: baseStore.summary?.environment || 'unknown',
    incidents,
    alerts,
    teams,
    prevAnalytics: { ...prevAnalytics, entries: sanitizedPrevEntries },
    providerMeta,
  });
  analytics.entries = analytics.entries.slice(-cfg.maxAnalyticsEntries);

  const activeRecords = [...incidents.filter((item) => item.status !== 'resolved'), ...alerts.filter((item) => item.status !== 'resolved')];
  const ownership = summarizeOwnership(activeRecords);
  const unassignedRecords = activeRecords.filter((item) => !String(item.owner || '').trim()).map((item) => item.id ? `incident:${item.id}` : `alert:${item.key}`);
  const hasActiveRecords = activeRecords.length > 0;

  const violations = safeArray(baseReport.violations).map((item) => ({ ...item }));
  const operationalStateLoaded = Boolean(providerMeta?.sources?.incidentAutomation?.loaded);
  const snapshotLoaded = Boolean(providerMeta?.sources?.itsmSnapshot?.loaded);
  const fullcycleLoaded = Boolean(providerMeta?.sources?.fullcycleReport?.loaded);
  if (cfg.providerMode === 'materialized_contract' && hasActiveRecords && !providerMeta?.contractLoaded) {
    violations.push({
      code: 'operational_contract_unavailable',
      blocking: true,
      message: `operational contract unavailable at ${cfg.contractFile}${providerMeta?.loadError ? ` (${providerMeta.loadError})` : ''}`,
    });
  }
  if (cfg.requireOperationalSource && hasActiveRecords && !operationalStateLoaded && !snapshotLoaded) violations.push({ code: 'operational_oncall_source_unavailable', blocking: true, message: `operational state unavailable at ${cfg.automationStateFile} and snapshot unavailable at ${cfg.snapshotFile}` });
  if (cfg.requireSnapshot && hasActiveRecords && !snapshotLoaded) violations.push({ code: 'operational_snapshot_unavailable', blocking: true, message: `snapshot unavailable at ${cfg.snapshotFile}` });
  if (cfg.requireOperationalSource && hasActiveRecords && directEntries.length === 0) violations.push({ code: 'operational_roster_unavailable', blocking: true, message: 'no direct operational owner evidence was found to build the roster' });
  if (cfg.requireOperationalSource && unassignedRecords.length > 0) violations.push({ code: 'operational_owner_unassigned', blocking: true, message: `records without operational owner: ${unassignedRecords.join(', ')}` });
  if (ownership.coveragePct < cfg.minOwnerCoveragePct) violations.push({ code: 'operational_owner_coverage_below_target', blocking: true, message: `owner coverage ${ownership.coveragePct}% < ${cfg.minOwnerCoveragePct}%` });

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0 ? (cfg.enforceTargets ? 'fail' : 'warn') : 'pass';
  const summary = {
    ...baseStore.summary,
    teamsTracked: teams.length,
    ownerCoveragePct: ownership.coveragePct,
    unassignedOwners: ownership.unassignedOwners,
    breachedEscalations: analytics.current.breachedEscalations,
    analyticsPoints: analytics.entries.length,
    operationalProviderMode: providerMeta?.mode || 'unknown',
    operationalContractLoaded: Boolean(providerMeta?.contractLoaded),
    operationalLoadedSources: Number(providerMeta?.summary?.loadedSources || 0),
  };

  const store = {
    ...baseStore,
    version: 3,
    generatedAt: ts,
    status,
    summary,
    teams,
    incidents,
    alerts,
    operationalProvider: providerMeta,
    analytics: { current: analytics.current, historyPoints: analytics.entries.length },
    oncall: {
      dynamicOwnerEnabled: true,
      preserveManualOwner: cfg.preserveManualOwner,
      defaultOwnerConfigured: false,
      rotationLoaded: false,
      calendarLoaded: false,
      sourceMode: providerMeta?.sourceMode || 'operational_state',
      operationalStateFile: cfg.automationStateFile,
      operationalStateLoaded,
      snapshotFile: cfg.snapshotFile,
      snapshotLoaded,
      snapshotRequired: cfg.requireSnapshot,
      fullcycleReportFile: cfg.fullcycleReportFile,
      fullcycleReportLoaded: fullcycleLoaded,
      directAssignments: directEntries.length,
      rosterEntries: roster.exactCount,
      teamFallbackEntries: roster.teamCount,
      timezone: cfg.operationalTimezone,
      operationalProvider: providerMeta,
    },
  };

  const report = {
    generatedAt: ts,
    status,
    summary,
    baseReportStatus: baseReport.status,
    ownership,
    analytics: { current: analytics.current, totalEntries: analytics.entries.length, file: cfg.backendAnalyticsFile },
    config: {
      ...(baseReport.config || {}),
      backendAnalyticsFile: cfg.backendAnalyticsFile,
      operationalStateFile: cfg.automationStateFile,
      snapshotFile: cfg.snapshotFile,
      fullcycleReportFile: cfg.fullcycleReportFile,
      operationalContractFile: cfg.contractFile,
      operationalProviderMode: providerMeta?.mode || 'unknown',
      materializeOperationalProvider: cfg.materializeContract,
      requireOperationalSource: cfg.requireOperationalSource,
      requireSnapshot: cfg.requireSnapshot,
      minOwnerCoveragePct: cfg.minOwnerCoveragePct,
      maxAnalyticsEntries: cfg.maxAnalyticsEntries,
      sourceMode: providerMeta?.sourceMode || 'operational_state',
    },
    inputs: {
      ...(baseReport.inputs || {}),
      operationalStateLoaded,
      snapshotLoaded,
      fullcycleReportLoaded: fullcycleLoaded,
      directAssignments: directEntries.length,
      rosterEntries: roster.exactCount,
      teamFallbackEntries: roster.teamCount,
      operationalProvider: providerMeta,
    },
    operationalProvider: providerMeta,
    violations,
  };

  await writeJson(cfg.backendStoreFile, store);
  await writeJson(cfg.backendReportFile, report);
  await writeJson(cfg.backendAnalyticsFile, analytics);
  await writeText(cfg.backendDashboardFile, buildDashboard({ ts, status, summary, teams, incidents, alerts, analytics, violations, oncall: store.oncall }));
  await appendLine(cfg.backendAuditFile, JSON.stringify({ timestamp: ts, source: 'phase39-observability-backend-operational-oncall', status, summary, ownership, oncall: store.oncall, operationalProvider: providerMeta, violations }));

  console.log(`Observability backend store: ${cfg.backendStoreFile}`);
  console.log(`Observability backend report: ${cfg.backendReportFile}`);
  console.log(`Observability backend analytics: ${cfg.backendAnalyticsFile}`);
  console.log(`Observability backend dashboard: ${cfg.backendDashboardFile}`);
  console.log(`[OBS-BACKEND-OPS] status=${status} provider=${providerMeta?.mode || 'unknown'} contract=${providerMeta?.contractLoaded ? 'ready' : 'missing'} coverage=${ownership.coveragePct}% direct=${directEntries.length} roster=${roster.exactCount} active=${analytics.current.activeRecords}`);

  if (status === 'fail') {
    for (const item of blockingViolations) console.error(`[OBS-BACKEND-OPS] ${item.code}: ${item.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase39 backend operational on-call failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
