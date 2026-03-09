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

function envCsvSet(name, fallbackCsv) {
  const raw = process.env[name] || fallbackCsv;
  return new Set(
    String(raw)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
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

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function safeMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function safeIso(value) {
  const parsed = safeMs(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function tierBySeverity(severity) {
  if (severity === 'critical') return 'P1';
  if (severity === 'warning') return 'P2';
  return 'P3';
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function defaultSlaByTier() {
  return {
    P1: {
      ackTargetMinutes: envInt('SLA_P1_ACK_MIN', 5),
      resolveTargetMinutes: envInt('SLA_P1_RESOLVE_MIN', 60),
    },
    P2: {
      ackTargetMinutes: envInt('SLA_P2_ACK_MIN', 15),
      resolveTargetMinutes: envInt('SLA_P2_RESOLVE_MIN', 240),
    },
    P3: {
      ackTargetMinutes: envInt('SLA_P3_ACK_MIN', 60),
      resolveTargetMinutes: envInt('SLA_P3_RESOLVE_MIN', 1440),
    },
  };
}

function createRecord(nowIso) {
  return {
    createdAt: nowIso,
    updatedAt: nowIso,
    owner: null,
    ownerSource: null,
    ownerRuleId: null,
    ownerAssignedAt: null,
    lastStatus: null,
    lastSeverity: null,
    sla: null,
    incident: null,
    paging: { openedAt: null, resolvedAt: null, externalId: null },
    ticket: { createdAt: null, resolvedAt: null, externalId: null },
    events: [],
  };
}

function parseDay(value) {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value;
  const key = String(value || '').trim().toLowerCase();
  const map = {
    sun: 0,
    sunday: 0,
    dom: 0,
    domingo: 0,
    mon: 1,
    monday: 1,
    seg: 1,
    segunda: 1,
    tue: 2,
    tuesday: 2,
    ter: 2,
    terca: 2,
    wed: 3,
    wednesday: 3,
    qua: 3,
    quarta: 3,
    thu: 4,
    thursday: 4,
    qui: 4,
    quinta: 4,
    fri: 5,
    friday: 5,
    sex: 5,
    sexta: 5,
    sat: 6,
    saturday: 6,
    sab: 6,
    sabado: 6,
  };
  return map[key];
}

function parseTimeMinutes(value, fallback) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function getZonedDayMinute(isoOrNow, timezone) {
  const date = new Date(Number.isFinite(safeMs(isoOrNow)) ? isoOrNow : Date.now());
  const weekdayText = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date).toLowerCase();
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const day = dayMap[weekdayText.slice(0, 3)] ?? 0;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);

  return {
    day,
    minuteOfDay: (hour * 60) + minute,
  };
}

function normalizeRotation(rawRotation, fallbackTimezone) {
  if (!rawRotation || typeof rawRotation !== 'object' || Array.isArray(rawRotation)) return null;
  const timezone = String(rawRotation.timezone || fallbackTimezone || 'America/Sao_Paulo');
  const rulesRaw = Array.isArray(rawRotation.rules) ? rawRotation.rules : [];
  const rules = rulesRaw
    .map((rule, index) => {
      const daysRaw = Array.isArray(rule.days) ? rule.days : [];
      const days = daysRaw
        .map((item) => parseDay(item))
        .filter((item) => typeof item === 'number');
      const startMinute = parseTimeMinutes(rule.start, 0);
      const endMinute = parseTimeMinutes(rule.end, 23 * 60 + 59);
      const owner = typeof rule.owner === 'string' && rule.owner.trim() ? rule.owner.trim() : null;
      const ownerByTier = (rule.ownerByTier && typeof rule.ownerByTier === 'object' && !Array.isArray(rule.ownerByTier))
        ? {
            P1: typeof rule.ownerByTier.P1 === 'string' ? rule.ownerByTier.P1.trim() : '',
            P2: typeof rule.ownerByTier.P2 === 'string' ? rule.ownerByTier.P2.trim() : '',
            P3: typeof rule.ownerByTier.P3 === 'string' ? rule.ownerByTier.P3.trim() : '',
          }
        : null;
      return {
        id: String(rule.id || rule.name || `rule-${index + 1}`),
        days,
        startMinute,
        endMinute,
        owner,
        ownerByTier,
      };
    })
    .filter((rule) => rule.owner || (rule.ownerByTier && (rule.ownerByTier.P1 || rule.ownerByTier.P2 || rule.ownerByTier.P3)));

  return { timezone, rules };
}

function ruleMatches(rule, day, minuteOfDay) {
  if (rule.days.length > 0 && !rule.days.includes(day)) return false;
  if (rule.startMinute <= rule.endMinute) {
    return minuteOfDay >= rule.startMinute && minuteOfDay <= rule.endMinute;
  }
  return minuteOfDay >= rule.startMinute || minuteOfDay <= rule.endMinute;
}

function resolveOwner({ tier, referenceTime, rotation, defaultOwner }) {
  if (rotation && rotation.rules.length > 0) {
    const zoned = getZonedDayMinute(referenceTime, rotation.timezone);
    for (const rule of rotation.rules) {
      if (!ruleMatches(rule, zoned.day, zoned.minuteOfDay)) continue;
      const ownerByTier = rule.ownerByTier?.[tier] || null;
      const owner = (ownerByTier && ownerByTier.trim()) || rule.owner;
      if (owner) {
        return {
          owner,
          source: 'rotation',
          ruleId: rule.id,
          timezone: rotation.timezone,
        };
      }
    }
  }

  if (defaultOwner) {
    return {
      owner: defaultOwner,
      source: 'default',
      ruleId: null,
      timezone: rotation?.timezone || null,
    };
  }

  return {
    owner: null,
    source: 'unassigned',
    ruleId: null,
    timezone: rotation?.timezone || null,
  };
}

function firstEventTime(events, action, channels) {
  if (!Array.isArray(events)) return NaN;
  const candidates = events
    .filter((event) => event?.action === action && channels.includes(event?.channel))
    .map((event) => safeMs(event?.timestamp))
    .filter((value) => Number.isFinite(value));
  return candidates.length > 0 ? Math.min(...candidates) : NaN;
}

function ensureTierSummary(map, tier) {
  if (!map[tier]) {
    map[tier] = {
      incidents: 0,
      open: 0,
      resolved: 0,
      ack: { measured: 0, met: 0, breached: 0, breachRatePct: null },
      resolve: { measured: 0, met: 0, breached: 0, breachRatePct: null },
    };
  }
  return map[tier];
}

function externalItems(rawSnapshot, key) {
  const direct = Array.isArray(rawSnapshot?.[key]) ? rawSnapshot[key] : [];
  const nested = Array.isArray(rawSnapshot?.items?.[key]) ? rawSnapshot.items[key] : [];
  const source = direct.length > 0 ? direct : nested;

  return source
    .map((item) => ({
      externalId: String(item.externalId || item.external_id || item.id || item.key || '').trim(),
      incidentId: String(item.incidentId || item.incident_id || item.localIncidentId || item.local_incident_id || '').trim(),
      status: normalizeStatus(item.status || item.state || item.phase),
      owner: typeof item.owner === 'string' ? item.owner.trim() : (typeof item.assignee === 'string' ? item.assignee.trim() : ''),
      raw: item,
    }))
    .filter((item) => item.externalId || item.incidentId);
}

function toMap(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (!map.has(value)) map.set(value, item);
  }
  return map;
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();

  const config = {
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    stateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    executiveReportFile: process.env.ONCALL_EXECUTIVE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/executive-sla-report.json'),
    governanceReportFile: process.env.GOVERNANCE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/executive-governance-report.json'),
    governanceDashboardFile: process.env.GOVERNANCE_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/executive-governance.md'),
    rotationFile: process.env.ONCALL_ROTATION_FILE || path.resolve(process.cwd(), 'config/oncall-rotation.json'),
    rotationTimezone: process.env.ONCALL_ROTATION_TIMEZONE || 'America/Sao_Paulo',
    defaultOwner: process.env.ITSM_DEFAULT_OWNER || '',
    ownerDynamicEnabled: envBool('ONCALL_OWNER_DYNAMIC_ENABLED', true),
    ownerPreserveManual: envBool('ONCALL_OWNER_PRESERVE_MANUAL', true),
    ownerRequireAssignment: envBool('ONCALL_OWNER_REQUIRE_ASSIGNMENT', false),
    reconciliationEnabled: envBool('ITSM_RECONCILIATION_ENABLED', true),
    snapshotFile: process.env.ITSM_SNAPSHOT_FILE || path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'),
    reconciliationAllowMissingSnapshot: envBool('ITSM_RECONCILIATION_ALLOW_MISSING_SNAPSHOT', true),
    reconciliationFailOnDrift: envBool('ITSM_RECONCILIATION_FAIL_ON_DRIFT', false),
    ticketResolvedStatuses: envCsvSet('ITSM_TICKET_RESOLVED_STATUSES', 'resolved,closed,done'),
    ticketOpenStatuses: envCsvSet('ITSM_TICKET_OPEN_STATUSES', 'open,in_progress,triage,acknowledged'),
    pagingResolvedStatuses: envCsvSet('ONCALL_PAGING_RESOLVED_STATUSES', 'resolved,closed'),
    pagingOpenStatuses: envCsvSet('ONCALL_PAGING_OPEN_STATUSES', 'open,triggered,acknowledged,firing'),
    enforceExecutiveTargets: envBool('SLO_EXECUTIVE_ENFORCE_TARGETS', false),
    minSamplesPerTier: envInt('SLO_EXEC_MIN_SAMPLES_PER_TIER', 1),
    maxOpenIncidents: envInt('SLO_EXEC_MAX_OPEN_INCIDENTS', 0),
    p1AckBreachRateMaxPct: envFloat('SLO_EXEC_P1_ACK_BREACH_RATE_MAX_PCT', 0),
    p1ResolveBreachRateMaxPct: envFloat('SLO_EXEC_P1_RESOLVE_BREACH_RATE_MAX_PCT', 0),
    p2AckBreachRateMaxPct: envFloat('SLO_EXEC_P2_ACK_BREACH_RATE_MAX_PCT', 10),
    p2ResolveBreachRateMaxPct: envFloat('SLO_EXEC_P2_RESOLVE_BREACH_RATE_MAX_PCT', 10),
    p3AckBreachRateMaxPct: envFloat('SLO_EXEC_P3_ACK_BREACH_RATE_MAX_PCT', 20),
    p3ResolveBreachRateMaxPct: envFloat('SLO_EXEC_P3_RESOLVE_BREACH_RATE_MAX_PCT', 20),
  };

  const incidentsState = await readJson(config.incidentsFile, { incidents: [] });
  const incidents = Array.isArray(incidentsState.incidents) ? incidentsState.incidents : [];

  let state = await readJson(config.stateFile, { version: 1, incidents: {} });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    state = { version: 1, incidents: {} };
  }
  if (!state.incidents || typeof state.incidents !== 'object' || Array.isArray(state.incidents)) {
    state.incidents = {};
  }

  const rotationRaw = await readJson(config.rotationFile, null);
  const rotation = normalizeRotation(rotationRaw, config.rotationTimezone);
  const slaDefaults = defaultSlaByTier();

  const ownerStats = {
    dynamicEnabled: config.ownerDynamicEnabled,
    rotationFile: config.rotationFile,
    rotationLoaded: Boolean(rotation),
    preservedManual: 0,
    assigned: 0,
    updated: 0,
    fallbackDefault: 0,
    unresolved: 0,
  };

  const incidentIndex = new Map();
  for (const incident of incidents) {
    const incidentId = String(incident.id || '').trim();
    if (!incidentId) continue;
    incidentIndex.set(incidentId, incident);
    const severity = incident.maxSeverity || incident.severity || 'info';
    const tier = tierBySeverity(severity);

    const record = state.incidents[incidentId] || createRecord(nowIso);
    record.updatedAt = nowIso;
    record.lastStatus = incident.status || record.lastStatus || 'unknown';
    record.lastSeverity = severity;
    record.incident = {
      startedAt: safeIso(incident.startedAt),
      detectedAt: safeIso(incident.detectedAt),
      resolvedAt: safeIso(incident.resolvedAt),
      lastSeenAt: safeIso(incident.lastSeenAt),
    };
    record.sla = {
      tier,
      ackTargetMinutes: Number.isFinite(Number(record?.sla?.ackTargetMinutes))
        ? Number(record.sla.ackTargetMinutes)
        : slaDefaults[tier].ackTargetMinutes,
      resolveTargetMinutes: Number.isFinite(Number(record?.sla?.resolveTargetMinutes))
        ? Number(record.sla.resolveTargetMinutes)
        : slaDefaults[tier].resolveTargetMinutes,
    };
    if (!record.paging || typeof record.paging !== 'object') record.paging = { openedAt: null, resolvedAt: null, externalId: null };
    if (!record.ticket || typeof record.ticket !== 'object') record.ticket = { createdAt: null, resolvedAt: null, externalId: null };
    if (!Array.isArray(record.events)) record.events = [];

    if (config.ownerDynamicEnabled) {
      const ownerDecision = resolveOwner({
        tier,
        referenceTime: record.incident.detectedAt || record.incident.startedAt || nowIso,
        rotation,
        defaultOwner: config.defaultOwner,
      });
      const preserveManual = config.ownerPreserveManual
        && Boolean(record.owner)
        && !['rotation', 'default', 'unassigned', null, ''].includes(record.ownerSource || null);

      if (preserveManual) {
        ownerStats.preservedManual += 1;
      } else if (ownerDecision.owner) {
        if (!record.owner) ownerStats.assigned += 1;
        if (record.owner && record.owner !== ownerDecision.owner) ownerStats.updated += 1;
        if (ownerDecision.source === 'default') ownerStats.fallbackDefault += 1;
        record.owner = ownerDecision.owner;
        record.ownerSource = ownerDecision.source;
        record.ownerRuleId = ownerDecision.ruleId || null;
        record.ownerAssignedAt = nowIso;
      }
    }

    if (!record.owner) ownerStats.unresolved += 1;
    state.incidents[incidentId] = record;
  }

  state.updatedAt = nowIso;
  state.version = 1;
  await writeJson(config.stateFile, state);

  const slaByTier = {};
  const totals = {
    incidents: 0,
    open: 0,
    resolved: 0,
    openWithoutOwner: 0,
  };

  for (const [incidentId, incident] of incidentIndex.entries()) {
    const record = state.incidents[incidentId] || {};
    const tier = record?.sla?.tier || tierBySeverity(record?.lastSeverity || incident.maxSeverity || incident.severity || 'info');
    const tierSummary = ensureTierSummary(slaByTier, tier);

    totals.incidents += 1;
    tierSummary.incidents += 1;
    if (incident.status === 'open') {
      totals.open += 1;
      tierSummary.open += 1;
      if (!record.owner) totals.openWithoutOwner += 1;
    }
    if (incident.status === 'resolved') {
      totals.resolved += 1;
      tierSummary.resolved += 1;
    }

    const detectedAtMs = safeMs(record?.incident?.detectedAt || incident.detectedAt);
    const ackAtMs = safeMs(record?.paging?.openedAt) || firstEventTime(record.events, 'open', ['paging', 'itsm']);
    const resolvedAtMs = safeMs(record?.incident?.resolvedAt || incident.resolvedAt);
    const ackTargetMs = Number(record?.sla?.ackTargetMinutes || 0) * 60_000;
    const resolveTargetMs = Number(record?.sla?.resolveTargetMinutes || 0) * 60_000;

    if (Number.isFinite(detectedAtMs) && Number.isFinite(ackAtMs) && ackTargetMs > 0) {
      const ackLatencyMs = Math.max(0, ackAtMs - detectedAtMs);
      tierSummary.ack.measured += 1;
      if (ackLatencyMs <= ackTargetMs) tierSummary.ack.met += 1;
      else tierSummary.ack.breached += 1;
    }

    if (incident.status === 'resolved' && Number.isFinite(detectedAtMs) && Number.isFinite(resolvedAtMs) && resolveTargetMs > 0) {
      const resolveLatencyMs = Math.max(0, resolvedAtMs - detectedAtMs);
      tierSummary.resolve.measured += 1;
      if (resolveLatencyMs <= resolveTargetMs) tierSummary.resolve.met += 1;
      else tierSummary.resolve.breached += 1;
    }
  }

  for (const tier of Object.keys(slaByTier)) {
    const item = slaByTier[tier];
    item.ack.breachRatePct = item.ack.measured > 0
      ? Number(((item.ack.breached / item.ack.measured) * 100).toFixed(2))
      : null;
    item.resolve.breachRatePct = item.resolve.measured > 0
      ? Number(((item.resolve.breached / item.resolve.measured) * 100).toFixed(2))
      : null;
  }

  const reconciliation = {
    enabled: config.reconciliationEnabled,
    snapshotFile: config.snapshotFile,
    snapshotLoaded: false,
    drifts: [],
    counts: {
      ticket: 0,
      paging: 0,
      orphan: 0,
      statusMismatch: 0,
      ownerMismatch: 0,
      missingRemote: 0,
      localMissingExternalId: 0,
    },
  };

  if (config.reconciliationEnabled) {
    const snapshot = await readJson(config.snapshotFile, null);
    if (!snapshot) {
      if (!config.reconciliationAllowMissingSnapshot) {
        reconciliation.drifts.push({
          type: 'snapshot_missing',
          severity: 'warning',
          message: `snapshot not found: ${config.snapshotFile}`,
        });
      }
    } else {
      reconciliation.snapshotLoaded = true;
      const tickets = externalItems(snapshot, 'tickets');
      const paging = externalItems(snapshot, 'paging');
      const ticketByExternalId = toMap(tickets, 'externalId');
      const ticketByIncidentId = toMap(tickets, 'incidentId');
      const pagingByExternalId = toMap(paging, 'externalId');
      const pagingByIncidentId = toMap(paging, 'incidentId');

      const usedTicketKeys = new Set();
      const usedPagingKeys = new Set();

      for (const [incidentId, incident] of incidentIndex.entries()) {
        const record = state.incidents[incidentId] || {};
        const localStatus = normalizeStatus(incident.status || record.lastStatus || '');
        const localOwner = String(record.owner || '').trim();

        const checkChannel = ({
          channel,
          externalId,
          byExternalId,
          byIncidentId,
          resolvedStatuses,
          openStatuses,
          usedKeys,
        }) => {
          if (!externalId) {
            const byIncident = byIncidentId.get(incidentId);
            if (byIncident) {
              reconciliation.drifts.push({
                type: 'local_missing_external_id',
                channel,
                incidentId,
                remoteExternalId: byIncident.externalId || null,
                severity: 'warning',
              });
              reconciliation.counts.localMissingExternalId += 1;
              if (byIncident.externalId) usedKeys.add(byIncident.externalId);
            }
            return;
          }

          const remote = byExternalId.get(externalId) || byIncidentId.get(incidentId);
          if (!remote) {
            reconciliation.drifts.push({
              type: 'missing_remote_record',
              channel,
              incidentId,
              localExternalId: externalId,
              severity: 'warning',
            });
            reconciliation.counts.missingRemote += 1;
            return;
          }

          if (remote.externalId) usedKeys.add(remote.externalId);
          const remoteStatus = normalizeStatus(remote.status);
          const remoteResolved = resolvedStatuses.has(remoteStatus);
          const remoteOpen = openStatuses.has(remoteStatus);

          if (localStatus === 'resolved' && !remoteResolved) {
            reconciliation.drifts.push({
              type: 'status_mismatch',
              channel,
              incidentId,
              expected: 'resolved',
              remoteStatus: remote.status || null,
              severity: 'warning',
            });
            reconciliation.counts.statusMismatch += 1;
          } else if (localStatus === 'open' && !remoteOpen) {
            reconciliation.drifts.push({
              type: 'status_mismatch',
              channel,
              incidentId,
              expected: 'open',
              remoteStatus: remote.status || null,
              severity: 'warning',
            });
            reconciliation.counts.statusMismatch += 1;
          }

          if (localOwner && remote.owner && localOwner.toLowerCase() !== remote.owner.toLowerCase()) {
            reconciliation.drifts.push({
              type: 'owner_mismatch',
              channel,
              incidentId,
              localOwner,
              remoteOwner: remote.owner,
              severity: 'info',
            });
            reconciliation.counts.ownerMismatch += 1;
          }
        };

        checkChannel({
          channel: 'ticket',
          externalId: String(record?.ticket?.externalId || '').trim(),
          byExternalId: ticketByExternalId,
          byIncidentId: ticketByIncidentId,
          resolvedStatuses: config.ticketResolvedStatuses,
          openStatuses: config.ticketOpenStatuses,
          usedKeys: usedTicketKeys,
        });

        checkChannel({
          channel: 'paging',
          externalId: String(record?.paging?.externalId || '').trim(),
          byExternalId: pagingByExternalId,
          byIncidentId: pagingByIncidentId,
          resolvedStatuses: config.pagingResolvedStatuses,
          openStatuses: config.pagingOpenStatuses,
          usedKeys: usedPagingKeys,
        });
      }

      for (const item of tickets) {
        if (item.externalId && usedTicketKeys.has(item.externalId)) continue;
        const incidentId = item.incidentId;
        if (incidentId && incidentIndex.has(incidentId)) continue;
        reconciliation.drifts.push({
          type: 'orphan_remote_record',
          channel: 'ticket',
          incidentId: incidentId || null,
          remoteExternalId: item.externalId || null,
          severity: 'warning',
        });
        reconciliation.counts.orphan += 1;
      }

      for (const item of paging) {
        if (item.externalId && usedPagingKeys.has(item.externalId)) continue;
        const incidentId = item.incidentId;
        if (incidentId && incidentIndex.has(incidentId)) continue;
        reconciliation.drifts.push({
          type: 'orphan_remote_record',
          channel: 'paging',
          incidentId: incidentId || null,
          remoteExternalId: item.externalId || null,
          severity: 'warning',
        });
        reconciliation.counts.orphan += 1;
      }

      reconciliation.counts.ticket = tickets.length;
      reconciliation.counts.paging = paging.length;
    }
  }

  const executiveReport = await readJson(config.executiveReportFile, null);
  const violations = [];
  const targetByTier = {
    P1: {
      ackBreachRateMaxPct: config.p1AckBreachRateMaxPct,
      resolveBreachRateMaxPct: config.p1ResolveBreachRateMaxPct,
    },
    P2: {
      ackBreachRateMaxPct: config.p2AckBreachRateMaxPct,
      resolveBreachRateMaxPct: config.p2ResolveBreachRateMaxPct,
    },
    P3: {
      ackBreachRateMaxPct: config.p3AckBreachRateMaxPct,
      resolveBreachRateMaxPct: config.p3ResolveBreachRateMaxPct,
    },
  };

  if (config.ownerRequireAssignment && ownerStats.unresolved > 0) {
    violations.push({
      code: 'owner_unresolved',
      blocking: true,
      message: `unresolved owners: ${ownerStats.unresolved}`,
    });
  }

  if (config.reconciliationFailOnDrift && reconciliation.drifts.length > 0) {
    violations.push({
      code: 'reconciliation_drift',
      blocking: true,
      message: `drifts detected: ${reconciliation.drifts.length}`,
    });
  }

  if (config.enforceExecutiveTargets) {
    if (totals.open > config.maxOpenIncidents) {
      violations.push({
        code: 'open_incidents_exceeded',
        blocking: true,
        message: `open incidents ${totals.open} > ${config.maxOpenIncidents}`,
      });
    }

    for (const tier of ['P1', 'P2', 'P3']) {
      const item = slaByTier[tier] || {
        ack: { measured: 0, breachRatePct: null },
        resolve: { measured: 0, breachRatePct: null },
      };
      const target = targetByTier[tier];

      if (item.ack.measured >= config.minSamplesPerTier && item.ack.breachRatePct !== null && item.ack.breachRatePct > target.ackBreachRateMaxPct) {
        violations.push({
          code: 'ack_breach_rate_exceeded',
          blocking: true,
          tier,
          message: `${tier} ack breach rate ${item.ack.breachRatePct}% > target ${target.ackBreachRateMaxPct}%`,
        });
      }

      if (item.resolve.measured >= config.minSamplesPerTier && item.resolve.breachRatePct !== null && item.resolve.breachRatePct > target.resolveBreachRateMaxPct) {
        violations.push({
          code: 'resolve_breach_rate_exceeded',
          blocking: true,
          tier,
          message: `${tier} resolve breach rate ${item.resolve.breachRatePct}% > target ${target.resolveBreachRateMaxPct}%`,
        });
      }
    }
  }

  const report = {
    generatedAt: nowIso,
    sources: {
      incidentsFile: config.incidentsFile,
      stateFile: config.stateFile,
      executiveReportFile: config.executiveReportFile,
      rotationFile: config.rotationFile,
      snapshotFile: config.snapshotFile,
    },
    owner: ownerStats,
    totals,
    sla: {
      byTier: slaByTier,
      targets: targetByTier,
      enforce: config.enforceExecutiveTargets,
      minSamplesPerTier: config.minSamplesPerTier,
      maxOpenIncidents: config.maxOpenIncidents,
    },
    reconciliation,
    executiveReportAvailable: Boolean(executiveReport),
    violations,
    status: violations.some((item) => item.blocking) ? 'fail' : 'pass',
  };

  await writeJson(config.governanceReportFile, report);

  const lines = [];
  lines.push('# Executive Governance');
  lines.push('');
  lines.push(`- Generated at: ${nowIso}`);
  lines.push(`- Incidents source: \`${config.incidentsFile}\``);
  lines.push(`- Automation state: \`${config.stateFile}\``);
  lines.push(`- Governance report: \`${config.governanceReportFile}\``);
  lines.push(`- Status: ${report.status.toUpperCase()}`);
  lines.push('');
  lines.push('## Ownership');
  lines.push('');
  lines.push(`- Dynamic enabled: ${ownerStats.dynamicEnabled ? 'yes' : 'no'}`);
  lines.push(`- Rotation loaded: ${ownerStats.rotationLoaded ? 'yes' : 'no'}`);
  lines.push(`- Assigned: ${ownerStats.assigned}`);
  lines.push(`- Updated: ${ownerStats.updated}`);
  lines.push(`- Preserved manual: ${ownerStats.preservedManual}`);
  lines.push(`- Fallback default: ${ownerStats.fallbackDefault}`);
  lines.push(`- Unresolved: ${ownerStats.unresolved}`);
  lines.push('');
  lines.push('## Reconciliation');
  lines.push('');
  lines.push(`- Enabled: ${reconciliation.enabled ? 'yes' : 'no'}`);
  lines.push(`- Snapshot loaded: ${reconciliation.snapshotLoaded ? 'yes' : 'no'}`);
  lines.push(`- Drift count: ${reconciliation.drifts.length}`);
  lines.push('');
  lines.push('## SLA Targets');
  lines.push('');
  lines.push('| Tier | Ack breach rate | Ack target max | Resolve breach rate | Resolve target max |');
  lines.push('|---|---|---|---|---|');
  for (const tier of ['P1', 'P2', 'P3']) {
    const item = slaByTier[tier] || { ack: { breachRatePct: null }, resolve: { breachRatePct: null } };
    const target = targetByTier[tier];
    lines.push(`| ${tier} | ${item.ack.breachRatePct === null ? 'n/a' : `${item.ack.breachRatePct}%`} | ${target.ackBreachRateMaxPct}% | ${item.resolve.breachRatePct === null ? 'n/a' : `${item.resolve.breachRatePct}%`} | ${target.resolveBreachRateMaxPct}% |`);
  }
  lines.push('');
  lines.push('## Violations');
  lines.push('');
  if (violations.length === 0) {
    lines.push('- none');
  } else {
    for (const violation of violations) {
      lines.push(`- [${violation.blocking ? 'BLOCKING' : 'INFO'}] ${violation.code}: ${violation.message}`);
    }
  }
  lines.push('');

  await writeText(config.governanceDashboardFile, lines.join('\n'));

  console.log(`Governance dashboard: ${config.governanceDashboardFile}`);
  console.log(`Governance report: ${config.governanceReportFile}`);
  console.log(`[GOVERNANCE] status=${report.status} incidents=${totals.incidents} open=${totals.open} drifts=${reconciliation.drifts.length}`);

  if (violations.some((item) => item.blocking)) {
    for (const violation of violations) {
      if (!violation.blocking) continue;
      console.error(`[GOVERNANCE] ${violation.code}: ${violation.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase16 governance failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
