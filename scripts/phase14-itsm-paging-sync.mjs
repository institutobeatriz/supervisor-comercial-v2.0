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

function tierBySeverity(severity) {
  if (severity === 'critical') return 'P1';
  if (severity === 'warning') return 'P2';
  return 'P3';
}

function safeIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function createSlaConfig() {
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

function normalizeIncidents(state) {
  const incidents = Array.isArray(state?.incidents) ? state.incidents : [];
  return incidents
    .filter((incident) => typeof incident?.id === 'string' && incident.id.trim().length > 0)
    .sort((a, b) => Date.parse(a.startedAt || '') - Date.parse(b.startedAt || ''));
}

function parseResponseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractExternalId(parsedBody) {
  if (!parsedBody || typeof parsedBody !== 'object') return null;
  return parsedBody.ticketKey
    || parsedBody.ticket_key
    || parsedBody.ticketId
    || parsedBody.ticket_id
    || parsedBody.incidentId
    || parsedBody.incident_id
    || parsedBody.id
    || parsedBody.key
    || null;
}

async function postWebhook({
  url,
  bearerToken,
  payload,
  timeoutMs,
  dryRun,
}) {
  if (dryRun) {
    return {
      ok: true,
      status: null,
      body: 'dry-run',
      parsedBody: null,
      externalId: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.text();
    const parsedBody = parseResponseJson(body);

    return {
      ok: response.ok,
      status: response.status,
      body: body.slice(0, 1000),
      parsedBody,
      externalId: extractExternalId(parsedBody),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: error instanceof Error ? error.message : String(error),
      parsedBody: null,
      externalId: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createIncidentRecord(nowIso) {
  return {
    createdAt: nowIso,
    updatedAt: nowIso,
    lastStatus: null,
    lastSeverity: null,
    sla: null,
    paging: {
      openedAt: null,
      resolvedAt: null,
      externalId: null,
      lastStatus: null,
      lastResponse: null,
    },
    ticket: {
      createdAt: null,
      resolvedAt: null,
      externalId: null,
      lastStatus: null,
      lastResponse: null,
    },
    events: [],
  };
}

function appendEvent(record, event, maxEvents) {
  if (!Array.isArray(record.events)) record.events = [];
  record.events.push(event);
  if (record.events.length > maxEvents) {
    record.events = record.events.slice(record.events.length - maxEvents);
  }
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();

  const config = {
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    stateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    reportFile: process.env.INCIDENT_AUTOMATION_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-report.json'),
    timeoutMs: envInt('INCIDENT_AUTOMATION_TIMEOUT_MS', 8_000),
    dryRun: envBool('INCIDENT_AUTOMATION_DRY_RUN', false),
    requireEndpoints: envBool('INCIDENT_AUTOMATION_REQUIRE_ENDPOINTS', false),
    failOnError: envBool('INCIDENT_AUTOMATION_FAIL_ON_ERROR', false),
    maxEventsPerIncident: envInt('INCIDENT_AUTOMATION_MAX_EVENTS_PER_INCIDENT', 50),
    source: process.env.ITSM_SERVICE_NAME || 'supervisor-comercial',
    team: process.env.ITSM_TEAM || 'comercial-ops',
    pagingWebhookUrl: process.env.ONCALL_PAGING_WEBHOOK_URL || '',
    pagingBearerToken: process.env.ONCALL_PAGING_BEARER_TOKEN || '',
    ticketWebhookUrl: process.env.ITSM_TICKET_WEBHOOK_URL || '',
    ticketBearerToken: process.env.ITSM_TICKET_BEARER_TOKEN || '',
    defaultOwner: process.env.ITSM_DEFAULT_OWNER || '',
  };

  const hasPaging = Boolean(config.pagingWebhookUrl);
  const hasTicket = Boolean(config.ticketWebhookUrl);

  if (config.requireEndpoints && !hasPaging && !hasTicket) {
    console.error('[AUTOMATION] endpoints required but none configured');
    process.exit(1);
  }

  const slaConfig = createSlaConfig();
  const incidentsState = await readJson(config.incidentsFile, { incidents: [] });
  const incidents = normalizeIncidents(incidentsState);
  let existing = await readJson(config.stateFile, { version: 1, incidents: {} });
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    existing = { version: 1, incidents: {} };
  }
  if (!existing.incidents || typeof existing.incidents !== 'object' || Array.isArray(existing.incidents)) {
    existing.incidents = {};
  }

  const summary = {
    generatedAt: nowIso,
    incidentsFile: config.incidentsFile,
    stateFile: config.stateFile,
    dryRun: config.dryRun,
    endpoints: {
      pagingConfigured: hasPaging,
      ticketConfigured: hasTicket,
    },
    totals: {
      incidents: incidents.length,
      open: incidents.filter((incident) => incident.status === 'open').length,
      resolved: incidents.filter((incident) => incident.status === 'resolved').length,
    },
    actions: {
      pagingOpen: 0,
      pagingResolve: 0,
      ticketCreate: 0,
      ticketResolve: 0,
    },
    skipped: {
      pagingNoEndpoint: 0,
      ticketNoEndpoint: 0,
      pagingNotOpened: 0,
      ticketNotCreated: 0,
      alreadyProcessed: 0,
    },
    errors: [],
  };

  for (const incident of incidents) {
    const incidentId = incident.id;
    const incidentStatus = incident.status || 'unknown';
    const severity = incident.maxSeverity || incident.severity || 'info';
    const tier = tierBySeverity(severity);
    const sla = slaConfig[tier];

    const record = existing.incidents[incidentId] || createIncidentRecord(nowIso);
    record.updatedAt = nowIso;
    record.lastStatus = incidentStatus;
    record.lastSeverity = severity;
    record.owner = record.owner || config.defaultOwner || null;
    record.sla = {
      tier,
      ackTargetMinutes: sla.ackTargetMinutes,
      resolveTargetMinutes: sla.resolveTargetMinutes,
    };
    record.incident = {
      startedAt: safeIso(incident.startedAt),
      detectedAt: safeIso(incident.detectedAt),
      resolvedAt: safeIso(incident.resolvedAt),
      lastSeenAt: safeIso(incident.lastSeenAt),
    };

    const basePayload = {
      source: config.source,
      team: config.team,
      incident: {
        id: incidentId,
        status: incidentStatus,
        severity,
        tier,
        startedAt: record.incident.startedAt,
        detectedAt: record.incident.detectedAt,
        resolvedAt: record.incident.resolvedAt,
      },
      sla: record.sla,
      summary: {
        mttdMs: typeof incident.mttdMs === 'number' ? incident.mttdMs : null,
        durationMs: typeof incident.durationMs === 'number' ? incident.durationMs : null,
        criticalFailures: Array.isArray(incident.criticalFailures) ? incident.criticalFailures : [],
        sloBreaches: Array.isArray(incident.sloBreaches) ? incident.sloBreaches : [],
      },
      automation: {
        processedAt: nowIso,
        dryRun: config.dryRun,
      },
    };

    const needsOpen = incidentStatus === 'open';
    const needsResolve = incidentStatus === 'resolved';
    let hadAction = false;

    if (needsOpen) {
      if (hasPaging && !record.paging.openedAt) {
        const response = await postWebhook({
          url: config.pagingWebhookUrl,
          bearerToken: config.pagingBearerToken,
          payload: { ...basePayload, action: 'open', channel: 'paging' },
          timeoutMs: config.timeoutMs,
          dryRun: config.dryRun,
        });
        hadAction = true;
        if (response.ok) {
          record.paging.openedAt = nowIso;
          record.paging.externalId = record.paging.externalId || response.externalId;
          summary.actions.pagingOpen += 1;
        } else {
          summary.errors.push(`paging open failed for ${incidentId}: ${response.body}`);
        }
        record.paging.lastStatus = response.status;
        record.paging.lastResponse = response.body;
        appendEvent(record, { timestamp: nowIso, channel: 'paging', action: 'open', ok: response.ok, status: response.status }, config.maxEventsPerIncident);
      } else if (!hasPaging) {
        summary.skipped.pagingNoEndpoint += 1;
      }

      if (hasTicket && !record.ticket.createdAt) {
        const response = await postWebhook({
          url: config.ticketWebhookUrl,
          bearerToken: config.ticketBearerToken,
          payload: { ...basePayload, action: 'open', channel: 'itsm' },
          timeoutMs: config.timeoutMs,
          dryRun: config.dryRun,
        });
        hadAction = true;
        if (response.ok) {
          record.ticket.createdAt = nowIso;
          record.ticket.externalId = record.ticket.externalId || response.externalId;
          summary.actions.ticketCreate += 1;
        } else {
          summary.errors.push(`ticket create failed for ${incidentId}: ${response.body}`);
        }
        record.ticket.lastStatus = response.status;
        record.ticket.lastResponse = response.body;
        appendEvent(record, { timestamp: nowIso, channel: 'itsm', action: 'open', ok: response.ok, status: response.status }, config.maxEventsPerIncident);
      } else if (!hasTicket) {
        summary.skipped.ticketNoEndpoint += 1;
      }
    } else if (needsResolve) {
      if (hasPaging && record.paging.openedAt && !record.paging.resolvedAt) {
        const response = await postWebhook({
          url: config.pagingWebhookUrl,
          bearerToken: config.pagingBearerToken,
          payload: { ...basePayload, action: 'resolve', channel: 'paging', externalId: record.paging.externalId || null },
          timeoutMs: config.timeoutMs,
          dryRun: config.dryRun,
        });
        hadAction = true;
        if (response.ok) {
          record.paging.resolvedAt = nowIso;
          summary.actions.pagingResolve += 1;
        } else {
          summary.errors.push(`paging resolve failed for ${incidentId}: ${response.body}`);
        }
        record.paging.lastStatus = response.status;
        record.paging.lastResponse = response.body;
        appendEvent(record, { timestamp: nowIso, channel: 'paging', action: 'resolve', ok: response.ok, status: response.status }, config.maxEventsPerIncident);
      } else if (!hasPaging) {
        summary.skipped.pagingNoEndpoint += 1;
      } else if (!record.paging.openedAt) {
        summary.skipped.pagingNotOpened += 1;
      }

      if (hasTicket && record.ticket.createdAt && !record.ticket.resolvedAt) {
        const response = await postWebhook({
          url: config.ticketWebhookUrl,
          bearerToken: config.ticketBearerToken,
          payload: { ...basePayload, action: 'resolve', channel: 'itsm', externalId: record.ticket.externalId || null },
          timeoutMs: config.timeoutMs,
          dryRun: config.dryRun,
        });
        hadAction = true;
        if (response.ok) {
          record.ticket.resolvedAt = nowIso;
          summary.actions.ticketResolve += 1;
        } else {
          summary.errors.push(`ticket resolve failed for ${incidentId}: ${response.body}`);
        }
        record.ticket.lastStatus = response.status;
        record.ticket.lastResponse = response.body;
        appendEvent(record, { timestamp: nowIso, channel: 'itsm', action: 'resolve', ok: response.ok, status: response.status }, config.maxEventsPerIncident);
      } else if (!hasTicket) {
        summary.skipped.ticketNoEndpoint += 1;
      } else if (!record.ticket.createdAt) {
        summary.skipped.ticketNotCreated += 1;
      }
    } else {
      summary.skipped.alreadyProcessed += 1;
    }

    if (!hadAction && (needsOpen || needsResolve)) {
      summary.skipped.alreadyProcessed += 1;
    }

    existing.incidents[incidentId] = record;
  }

  existing.version = 1;
  existing.updatedAt = nowIso;
  await writeJson(config.stateFile, existing);
  await writeJson(config.reportFile, summary);

  console.log(`Incident automation report: ${config.reportFile}`);
  console.log(`Incident automation state: ${config.stateFile}`);
  console.log(`[AUTOMATION] incidents=${summary.totals.incidents} errors=${summary.errors.length}`);
  console.log(`[AUTOMATION] paging open=${summary.actions.pagingOpen} resolve=${summary.actions.pagingResolve}`);
  console.log(`[AUTOMATION] ticket create=${summary.actions.ticketCreate} resolve=${summary.actions.ticketResolve}`);

  if (summary.errors.length > 0) {
    console.error('[AUTOMATION] errors:');
    for (const error of summary.errors) {
      console.error(` - ${error}`);
    }
    if (config.failOnError) {
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(`Unexpected phase14 automation failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
