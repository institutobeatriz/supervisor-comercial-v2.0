import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function tierBySeverity(severity) {
  if (severity === 'critical') return 'P1';
  if (severity === 'warning') return 'P2';
  return 'P3';
}

function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function pctl(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function actionKey(action) {
  const fp = {
    type: String(action?.type || '').trim(),
    channel: String(action?.channel || '').trim(),
    incidentId: String(action?.incidentId || '').trim(),
    remoteExternalId: String(action?.remoteExternalId || '').trim(),
    localExternalId: String(action?.localExternalId || '').trim(),
    localOwner: String(action?.localOwner || '').trim(),
    remoteOwner: String(action?.remoteOwner || '').trim(),
  };
  const digest = createHash('sha1').update(stableStringify(fp)).digest('hex').slice(0, 16);
  return `${fp.type || 'unknown'}:${digest}`;
}

function remoteAction(type) {
  if (type === 'link_local_external_id') return 'local_link';
  if (String(type).startsWith('create_remote_')) return 'open';
  if (String(type).startsWith('remote_reopen_')) return 'reopen';
  if (String(type).startsWith('remote_resolve_')) return 'resolve';
  if (String(type).startsWith('owner_sync_')) return 'assign';
  if (type === 'orphan_remote_ticket' || type === 'orphan_remote_paging') return 'orphan_detected';
  if (type === 'investigate_missing_remote_record') return 'investigate_missing';
  return null;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function resolveConnector(channel, cfg) {
  if (channel === 'ticket') {
    const provider = norm(cfg.itsmProvider) || 'generic';
    return {
      key: `itsm:${['generic', 'jira', 'servicenow'].includes(provider) ? provider : 'generic'}`,
      provider: ['generic', 'jira', 'servicenow'].includes(provider) ? provider : 'generic',
      channel,
      endpointUrl: cfg.ticketWebhookUrl,
      bearerToken: cfg.ticketBearerToken,
    };
  }
  if (channel === 'paging') {
    const provider = norm(cfg.oncallProvider) || 'generic';
    return {
      key: `oncall:${['generic', 'pagerduty', 'opsgenie'].includes(provider) ? provider : 'generic'}`,
      provider: ['generic', 'pagerduty', 'opsgenie'].includes(provider) ? provider : 'generic',
      channel,
      endpointUrl: cfg.pagingWebhookUrl,
      bearerToken: cfg.pagingBearerToken,
    };
  }
  return null;
}

function extractExternalId(parsedBody) {
  if (!parsedBody || typeof parsedBody !== 'object') return null;
  return String(
    parsedBody.ticketKey
    || parsedBody.ticket_key
    || parsedBody.ticketId
    || parsedBody.ticket_id
    || parsedBody.incidentId
    || parsedBody.incident_id
    || parsedBody.issueKey
    || parsedBody.issue_key
    || parsedBody.sys_id
    || parsedBody.id
    || parsedBody.key
    || '',
  ).trim() || null;
}

function retryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function isRetryableResponse(response) {
  if (!response) return false;
  if (response.timedOut) return true;
  if (response.status === null || response.status === undefined) return true;
  return retryableStatus(response.status);
}

function buildIncidentIndex(raw) {
  const map = new Map();
  const incidents = Array.isArray(raw?.incidents) ? raw.incidents : [];
  for (const incident of incidents) {
    const id = String(incident?.id || '').trim();
    if (!id) continue;
    map.set(id, incident);
  }
  return map;
}

function ensureStateIncident(state, incidentId, nowIso) {
  if (!state.incidents || typeof state.incidents !== 'object' || Array.isArray(state.incidents)) {
    state.incidents = {};
  }
  const id = String(incidentId || '').trim();
  if (!id) return null;
  if (!state.incidents[id] || typeof state.incidents[id] !== 'object' || Array.isArray(state.incidents[id])) {
    state.incidents[id] = {
      createdAt: nowIso,
      updatedAt: nowIso,
      owner: null,
      ownerSource: null,
      ownerRuleId: null,
      ownerAssignedAt: null,
      lastStatus: null,
      lastSeverity: null,
      incident: null,
      paging: { externalId: null, openedAt: null, resolvedAt: null },
      ticket: { externalId: null, createdAt: null, resolvedAt: null },
      events: [],
    };
  }
  const record = state.incidents[id];
  if (!record.paging || typeof record.paging !== 'object') {
    record.paging = { externalId: null, openedAt: null, resolvedAt: null };
  }
  if (!record.ticket || typeof record.ticket !== 'object') {
    record.ticket = { externalId: null, createdAt: null, resolvedAt: null };
  }
  if (!Array.isArray(record.events)) {
    record.events = [];
  }
  record.updatedAt = nowIso;
  return record;
}

function appendStateEvent(record, event, maxEvents) {
  if (!record) return;
  if (!Array.isArray(record.events)) record.events = [];
  record.events.push(event);
  if (record.events.length > maxEvents) {
    record.events = record.events.slice(record.events.length - maxEvents);
  }
}

function localExternalByChannel(record, channel) {
  if (!record || typeof record !== 'object') return null;
  if (channel === 'ticket') return String(record?.ticket?.externalId || '').trim() || null;
  if (channel === 'paging') return String(record?.paging?.externalId || '').trim() || null;
  return null;
}

function applyLocalLink({ record, channel, remoteExternalId, nowIso, maxEvents }) {
  const ext = String(remoteExternalId || '').trim();
  if (!record) {
    return { ok: false, reason: 'missing_incident_state', message: 'incident state record not found' };
  }
  if (!ext) {
    return { ok: false, reason: 'missing_remote_external_id', message: 'remoteExternalId is required for local link' };
  }
  if (channel === 'ticket') {
    record.ticket.externalId = ext;
    if (!record.ticket.createdAt) record.ticket.createdAt = nowIso;
  } else if (channel === 'paging') {
    record.paging.externalId = ext;
    if (!record.paging.openedAt) record.paging.openedAt = nowIso;
  } else {
    return { ok: false, reason: 'invalid_channel', message: `unsupported channel for local link: ${channel}` };
  }
  appendStateEvent(
    record,
    {
      timestamp: nowIso,
      channel,
      action: 'local_link',
      ok: true,
      externalId: ext,
    },
    maxEvents,
  );
  return { ok: true, reason: 'local_link_applied', message: `linked ${channel} external id` };
}
function applyRemoteSuccessToLocalState({
  record,
  action,
  remoteVerb,
  responseExternalId,
  nowIso,
  statusCode,
  message,
  maxEvents,
}) {
  if (!record) return;
  const channel = String(action?.channel || '').trim();
  const type = String(action?.type || '').trim();
  const actionExternal = String(
    responseExternalId
    || action?.remoteExternalId
    || action?.localExternalId
    || '',
  ).trim() || null;

  if (channel === 'ticket') {
    if (type.startsWith('create_remote_') || type.startsWith('remote_reopen_')) {
      if (!record.ticket.createdAt) record.ticket.createdAt = nowIso;
      record.ticket.resolvedAt = null;
      if (actionExternal) record.ticket.externalId = actionExternal;
    } else if (type.startsWith('remote_resolve_')) {
      if (!record.ticket.createdAt) record.ticket.createdAt = nowIso;
      record.ticket.resolvedAt = nowIso;
      if (actionExternal && !record.ticket.externalId) record.ticket.externalId = actionExternal;
    } else if (type.startsWith('owner_sync_')) {
      if (String(action?.localOwner || '').trim()) {
        record.owner = String(action.localOwner).trim();
      }
    }
  } else if (channel === 'paging') {
    if (type.startsWith('create_remote_') || type.startsWith('remote_reopen_')) {
      if (!record.paging.openedAt) record.paging.openedAt = nowIso;
      record.paging.resolvedAt = null;
      if (actionExternal) record.paging.externalId = actionExternal;
    } else if (type.startsWith('remote_resolve_')) {
      if (!record.paging.openedAt) record.paging.openedAt = nowIso;
      record.paging.resolvedAt = nowIso;
      if (actionExternal && !record.paging.externalId) record.paging.externalId = actionExternal;
    } else if (type.startsWith('owner_sync_')) {
      if (String(action?.localOwner || '').trim()) {
        record.owner = String(action.localOwner).trim();
      }
    }
  }

  appendStateEvent(
    record,
    {
      timestamp: nowIso,
      channel,
      action: remoteVerb,
      actionType: type,
      ok: true,
      status: statusCode,
      message: message || null,
      externalId: actionExternal,
    },
    maxEvents,
  );
}

function mapPagerDutySeverity(tier) {
  if (tier === 'P1') return 'critical';
  if (tier === 'P2') return 'warning';
  return 'info';
}

function mapOpsgeniePriority(tier) {
  if (tier === 'P1') return 'P1';
  if (tier === 'P2') return 'P2';
  return 'P3';
}

function buildConnectorPayload({
  action,
  connector,
  incident,
  stateRecord,
  cfg,
  nowIso,
  runId,
}) {
  const incidentId = String(action?.incidentId || incident?.id || '').trim();
  const incidentStatus = norm(incident?.status || stateRecord?.lastStatus || 'unknown') || 'unknown';
  const severity = norm(incident?.maxSeverity || incident?.severity || stateRecord?.lastSeverity || 'info') || 'info';
  const tier = tierBySeverity(severity);
  const remoteVerb = remoteAction(action?.type);
  const localExternal = String(action?.localExternalId || localExternalByChannel(stateRecord, connector.channel) || '').trim();
  const remoteExternal = String(action?.remoteExternalId || '').trim();
  const externalId = remoteExternal || localExternal || null;

  const payload = {
    source: cfg.serviceName,
    team: cfg.team,
    channel: connector.channel,
    provider: connector.provider,
    action: remoteVerb,
    actionType: String(action?.type || '').trim(),
    actionRef: {
      key: String(action?.actionKey || '').trim(),
      blocking: Boolean(action?.blocking),
      runId,
    },
    incident: {
      id: incidentId,
      status: incidentStatus,
      severity,
      tier,
      startedAt: incident?.startedAt || stateRecord?.incident?.startedAt || null,
      detectedAt: incident?.detectedAt || stateRecord?.incident?.detectedAt || null,
      resolvedAt: incident?.resolvedAt || stateRecord?.incident?.resolvedAt || null,
      lastSeenAt: incident?.lastSeenAt || stateRecord?.incident?.lastSeenAt || null,
    },
    owner: {
      local: String(action?.localOwner || stateRecord?.owner || '').trim() || null,
      remote: String(action?.remoteOwner || '').trim() || null,
    },
    external: {
      id: externalId,
      remoteId: remoteExternal || null,
      localId: localExternal || null,
    },
    metadata: {
      generatedAt: nowIso,
      dryRun: cfg.dryRun,
      replaySuccess: cfg.replaySuccess,
      replayApplied: cfg.replayApplied,
    },
  };

  if (connector.channel === 'ticket') {
    if (connector.provider === 'jira') {
      payload.jira = {
        projectKey: String(cfg.jiraProjectKey || '').trim(),
        issueType: String(cfg.jiraIssueType || '').trim() || 'Incident',
        component: String(cfg.jiraComponent || cfg.team || '').trim() || null,
        summary: `[${tier}] ${incidentId || 'incident'} ${String(action?.type || '').trim()}`,
        labels: [`service:${cfg.serviceName}`, `tier:${tier}`, 'fullcycle'],
      };
    } else if (connector.provider === 'servicenow') {
      payload.servicenow = {
        table: String(cfg.servicenowTable || '').trim() || 'incident',
        assignmentGroup: String(cfg.servicenowAssignmentGroup || cfg.team || '').trim() || null,
        businessService: String(cfg.serviceName || '').trim(),
        caller: String(cfg.servicenowCaller || '').trim() || null,
      };
    } else {
      payload.ticket = {
        service: cfg.serviceName,
        team: cfg.team,
      };
    }
  }

  if (connector.channel === 'paging') {
    if (connector.provider === 'pagerduty') {
      payload.pagerduty = {
        routing_key: String(cfg.pagerdutyRoutingKey || '').trim(),
        event_action: remoteVerb === 'open' || remoteVerb === 'reopen' ? 'trigger' : (remoteVerb === 'resolve' ? 'resolve' : 'acknowledge'),
        severity: mapPagerDutySeverity(tier),
      };
    } else if (connector.provider === 'opsgenie') {
      payload.opsgenie = {
        action: remoteVerb,
        priority: mapOpsgeniePriority(tier),
        team: String(cfg.opsgenieTeam || cfg.team || '').trim() || null,
      };
    } else {
      payload.oncall = {
        severity: tier,
        team: cfg.team,
      };
    }
  }

  return payload;
}

function validateRequestContract({ action, connector, payload }) {
  const errors = [];
  const remoteVerb = remoteAction(action?.type);

  if (!remoteVerb) {
    errors.push('unsupported remote action');
  }
  if (!payload?.actionRef?.key) {
    errors.push('missing actionRef.key');
  }
  if (!payload?.incident?.id) {
    errors.push('missing incident.id');
  }
  if (!payload?.action) {
    errors.push('missing action');
  }

  if ((remoteVerb === 'reopen' || remoteVerb === 'resolve' || remoteVerb === 'assign')
    && !payload?.external?.id
    && !String(action?.remoteExternalId || '').trim()
    && !String(action?.localExternalId || '').trim()) {
    errors.push('missing external id for reopen/resolve/assign');
  }

  if (connector?.channel === 'ticket' && connector?.provider === 'jira') {
    if (!payload?.jira?.projectKey) errors.push('jira.projectKey is required');
    if (!payload?.jira?.issueType) errors.push('jira.issueType is required');
  }

  if (connector?.channel === 'ticket' && connector?.provider === 'servicenow') {
    if (!payload?.servicenow?.table) errors.push('servicenow.table is required');
  }

  if (connector?.channel === 'paging' && connector?.provider === 'pagerduty') {
    if (!payload?.pagerduty?.routing_key) errors.push('pagerduty.routing_key is required');
    if (!payload?.pagerduty?.event_action) errors.push('pagerduty.event_action is required');
  }

  if (connector?.channel === 'paging' && connector?.provider === 'opsgenie') {
    if (!payload?.opsgenie?.priority) errors.push('opsgenie.priority is required');
  }

  return { ok: errors.length === 0, errors };
}

function validateResponseContract({ action, response }) {
  const errors = [];
  const remoteVerb = remoteAction(action?.type);
  if (!response?.ok) {
    errors.push('response is not successful');
  }
  if ((remoteVerb === 'open' || remoteVerb === 'reopen') && !response?.externalId) {
    errors.push('missing external id in successful response');
  }
  return { ok: errors.length === 0, errors };
}
async function postConnector({ connector, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (connector?.bearerToken) headers.Authorization = `Bearer ${connector.bearerToken}`;
    const response = await fetch(String(connector.endpointUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    const parsedBody = parseJson(body);
    const latencyMs = Date.now() - started;
    const externalId = extractExternalId(parsedBody)
      || String(payload?.external?.id || '').trim()
      || null;

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        body: body.slice(0, 1000),
        parsedBody,
        externalId,
        latencyMs,
        timedOut: false,
        reason: 'remote_success',
        message: '',
      };
    }

    return {
      ok: false,
      status: response.status,
      body: body.slice(0, 1000),
      parsedBody,
      externalId,
      latencyMs,
      timedOut: false,
      reason: 'http_error',
      message: `HTTP ${response.status}: ${body.slice(0, 240)}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      body: message,
      parsedBody: null,
      externalId: null,
      latencyMs,
      timedOut,
      reason: timedOut ? 'timeout' : 'network_error',
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeRemoteWithRetry({ connector, payload, cfg }) {
  const maxAttempts = Math.max(1, cfg.maxRetries + 1);
  let attempts = 0;
  let retried = 0;
  const attemptLatencies = [];
  let last = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    attempts += 1;
    const response = await postConnector({
      connector,
      payload,
      timeoutMs: cfg.timeoutMs,
    });
    if (Number.isFinite(response.latencyMs)) {
      attemptLatencies.push(response.latencyMs);
    }
    last = response;

    if (response.ok) break;
    if (i < (maxAttempts - 1) && isRetryableResponse(response)) {
      retried += 1;
      await sleep(cfg.retryBackoffMs * (i + 1));
      continue;
    }
    break;
  }

  const finalRes = last || {
    ok: false,
    status: null,
    body: 'no response',
    parsedBody: null,
    externalId: null,
    latencyMs: null,
    timedOut: false,
    reason: 'unknown_error',
    message: 'no response',
  };

  return {
    ok: Boolean(finalRes.ok),
    status: finalRes.status,
    body: finalRes.body,
    parsedBody: finalRes.parsedBody,
    externalId: finalRes.externalId,
    latencyMs: Number.isFinite(finalRes.latencyMs) ? finalRes.latencyMs : null,
    timedOut: Boolean(finalRes.timedOut),
    reason: finalRes.reason || (finalRes.ok ? 'remote_success' : 'remote_error'),
    message: finalRes.message || '',
    attempts,
    retried,
    attemptLatencies,
    httpAttempts: attempts,
  };
}

function createConnectorBucket(connector) {
  return {
    key: connector.key,
    channel: connector.channel,
    provider: connector.provider,
    endpointConfigured: Boolean(connector.endpointUrl),
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    dryRun: 0,
    attempted: 0,
    httpAttempts: 0,
    retried: 0,
    timeouts: 0,
    httpErrors: 0,
    contractRequestErrors: 0,
    contractResponseErrors: 0,
    statuses: {},
    latencies: [],
  };
}

function summarizeConnectors(map) {
  const summary = {};
  for (const [key, bucket] of map.entries()) {
    const latencies = bucket.latencies.filter((item) => Number.isFinite(item));
    const latencyAvg = avg(latencies);
    const latencyP95 = pctl(latencies, 95);
    const latencyMin = latencies.length > 0 ? Math.min(...latencies) : null;
    const latencyMax = latencies.length > 0 ? Math.max(...latencies) : null;
    summary[key] = {
      key,
      channel: bucket.channel,
      provider: bucket.provider,
      endpointConfigured: bucket.endpointConfigured,
      total: bucket.total,
      success: bucket.success,
      failed: bucket.failed,
      skipped: bucket.skipped,
      dryRun: bucket.dryRun,
      attempted: bucket.attempted,
      httpAttempts: bucket.httpAttempts,
      retried: bucket.retried,
      timeouts: bucket.timeouts,
      httpErrors: bucket.httpErrors,
      contractRequestErrors: bucket.contractRequestErrors,
      contractResponseErrors: bucket.contractResponseErrors,
      statuses: bucket.statuses,
      latencyMs: {
        avg: latencyAvg === null ? null : Number(latencyAvg.toFixed(2)),
        p95: latencyP95 === null ? null : Number(latencyP95.toFixed(2)),
        min: latencyMin === null ? null : Number(latencyMin.toFixed(2)),
        max: latencyMax === null ? null : Number(latencyMax.toFixed(2)),
        sample: latencies.length,
      },
    };
  }
  return summary;
}

function updateActionExecutionState({
  executionState,
  nowIso,
  runId,
  action,
  outcome,
  statusCode,
  message,
  attempts,
  retried,
}) {
  if (!executionState.actions || typeof executionState.actions !== 'object' || Array.isArray(executionState.actions)) {
    executionState.actions = {};
  }
  const key = String(action?.actionKey || '').trim();
  if (!key) return;
  const record = executionState.actions[key] || {
    firstSeenAt: nowIso,
    updatedAt: nowIso,
    type: String(action?.type || '').trim(),
    channel: String(action?.channel || '').trim(),
    incidentId: String(action?.incidentId || '').trim() || null,
    totalRuns: 0,
    successes: 0,
    failures: 0,
    skipped: 0,
  };

  record.updatedAt = nowIso;
  record.type = String(action?.type || '').trim();
  record.channel = String(action?.channel || '').trim();
  record.incidentId = String(action?.incidentId || '').trim() || null;
  record.lastRunId = runId;
  record.lastOutcome = outcome;
  record.lastStatus = statusCode ?? null;
  record.lastMessage = String(message || '');
  record.lastAttempts = attempts;
  record.lastRetried = retried;
  record.totalRuns = Number(record.totalRuns || 0) + 1;

  if (outcome === 'success') {
    record.successes = Number(record.successes || 0) + 1;
    record.lastSuccessAt = nowIso;
  } else if (outcome === 'failed') {
    record.failures = Number(record.failures || 0) + 1;
    record.lastFailureAt = nowIso;
  } else if (outcome === 'skipped') {
    record.skipped = Number(record.skipped || 0) + 1;
  }

  executionState.actions[key] = record;
}

function normalizeStateFile(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : { version: 1, incidents: {} };
  if (!state.incidents || typeof state.incidents !== 'object' || Array.isArray(state.incidents)) {
    state.incidents = {};
  }
  return state;
}

function normalizeExecutionState(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : { version: 1, actions: {}, runs: [] };
  if (!state.actions || typeof state.actions !== 'object' || Array.isArray(state.actions)) {
    state.actions = {};
  }
  if (!Array.isArray(state.runs)) {
    state.runs = [];
  }
  return state;
}

function normalizeTelemetryState(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : { version: 1, history: [] };
  if (!Array.isArray(state.history)) {
    state.history = [];
  }
  return state;
}

function byTypeEnsure(outcomesByType, type) {
  if (!outcomesByType[type]) {
    outcomesByType[type] = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };
  }
  return outcomesByType[type];
}
async function main() {
  const startedAt = new Date();
  const nowIso = startedAt.toISOString();
  const runId = `fullcycle-exec-${startedAt.getTime()}`;

  const cfg = {
    actionsFile: process.env.FULLCYCLE_ACTIONS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-actions.json'),
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    stateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    executionStateFile: process.env.FULLCYCLE_EXECUTION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-execution-state.json'),
    reportFile: process.env.FULLCYCLE_EXECUTION_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-execution-report.json'),
    dashboardFile: process.env.FULLCYCLE_EXECUTION_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-execution.md'),
    connectorTelemetryFile: process.env.FULLCYCLE_CONNECTOR_TELEMETRY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-telemetry.json'),
    connectorDashboardFile: process.env.FULLCYCLE_CONNECTOR_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors.md'),
    serviceName: process.env.ITSM_SERVICE_NAME || 'supervisor-comercial',
    team: process.env.ITSM_TEAM || 'comercial-ops',
    pagingWebhookUrl: process.env.ONCALL_PAGING_WEBHOOK_URL || '',
    pagingBearerToken: process.env.ONCALL_PAGING_BEARER_TOKEN || '',
    ticketWebhookUrl: process.env.ITSM_TICKET_WEBHOOK_URL || '',
    ticketBearerToken: process.env.ITSM_TICKET_BEARER_TOKEN || '',
    itsmProvider: process.env.ITSM_CONNECTOR_PROVIDER || process.env.ITSM_PROVIDER || 'generic',
    oncallProvider: process.env.ONCALL_CONNECTOR_PROVIDER || process.env.ONCALL_PROVIDER || 'generic',
    jiraProjectKey: process.env.ITSM_JIRA_PROJECT_KEY || process.env.JIRA_PROJECT_KEY || '',
    jiraIssueType: process.env.ITSM_JIRA_ISSUE_TYPE || process.env.JIRA_ISSUE_TYPE || 'Incident',
    jiraComponent: process.env.ITSM_JIRA_COMPONENT || '',
    servicenowTable: process.env.ITSM_SERVICENOW_TABLE || process.env.SERVICENOW_TABLE || 'incident',
    servicenowAssignmentGroup: process.env.ITSM_SERVICENOW_ASSIGNMENT_GROUP || process.env.SERVICENOW_ASSIGNMENT_GROUP || '',
    servicenowCaller: process.env.ITSM_SERVICENOW_CALLER || process.env.SERVICENOW_CALLER || '',
    pagerdutyRoutingKey: process.env.ONCALL_PAGERDUTY_ROUTING_KEY || process.env.PAGERDUTY_ROUTING_KEY || '',
    opsgenieTeam: process.env.ONCALL_OPSGENIE_TEAM || process.env.OPSGENIE_TEAM || '',
    dryRun: envBool('FULLCYCLE_EXEC_DRY_RUN', false),
    requireEndpoints: envBool('FULLCYCLE_EXEC_REQUIRE_ENDPOINTS', false),
    failOnError: envBool('FULLCYCLE_EXEC_FAIL_ON_ERROR', false),
    failOnBlockingError: envBool('FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR', true),
    applyLocalLinks: envBool('FULLCYCLE_EXEC_APPLY_LOCAL_LINKS', true),
    replaySuccess: envBool('FULLCYCLE_EXEC_REPLAY_SUCCESS', false),
    replayApplied: envBool('FULLCYCLE_EXEC_REPLAY_APPLIED', false),
    writeActionsFile: envBool('FULLCYCLE_EXEC_WRITE_ACTIONS_FILE', true),
    timeoutMs: envInt('FULLCYCLE_EXEC_TIMEOUT_MS', 8_000),
    maxRetries: Math.max(0, envInt('FULLCYCLE_EXEC_MAX_RETRIES', 2)),
    retryBackoffMs: Math.max(0, envInt('FULLCYCLE_EXEC_RETRY_BACKOFF_MS', 400)),
    maxEventsPerIncident: Math.max(1, envInt('FULLCYCLE_EXEC_MAX_EVENTS_PER_INCIDENT', 80)),
    maxRunHistory: Math.max(1, envInt('FULLCYCLE_EXEC_MAX_RUN_HISTORY', 180)),
    connectorTelemetryMaxHistory: Math.max(1, envInt('FULLCYCLE_CONNECTOR_TELEMETRY_MAX_HISTORY', 500)),
    connectorValidateContract: envBool('FULLCYCLE_CONNECTOR_VALIDATE_CONTRACT', true),
    connectorEnforceRequestContract: envBool('FULLCYCLE_CONNECTOR_ENFORCE_REQUEST_CONTRACT', true),
    connectorEnforceResponseContract: envBool('FULLCYCLE_CONNECTOR_ENFORCE_RESPONSE_CONTRACT', false),
  };

  const actionsDoc = await readJson(cfg.actionsFile, { actions: [] });
  const actions = Array.isArray(actionsDoc?.actions) ? actionsDoc.actions : [];

  const incidentsDoc = await readJson(cfg.incidentsFile, { incidents: [] });
  const incidentsById = buildIncidentIndex(incidentsDoc);

  let state = normalizeStateFile(await readJson(cfg.stateFile, { version: 1, incidents: {} }));
  let executionState = normalizeExecutionState(await readJson(cfg.executionStateFile, { version: 1, actions: {}, runs: [] }));
  let telemetryState = normalizeTelemetryState(await readJson(cfg.connectorTelemetryFile, { version: 1, history: [] }));

  const totals = {
    total: actions.length,
    success: 0,
    failed: 0,
    skipped: 0,
    attempted: 0,
    retried: 0,
    blockingTotal: actions.filter((item) => Boolean(item?.blocking)).length,
    blockingFailed: 0,
    pendingAfter: 0,
    blockingPendingAfter: 0,
  };
  const outcomesByType = {};
  const skippedReasons = {};
  const failures = [];
  const contractStats = {
    enabled: cfg.connectorValidateContract,
    requestErrors: 0,
    responseErrors: 0,
  };

  const connectorMap = new Map();
  const getConnectorBucket = (connector) => {
    if (!connector) return null;
    if (!connectorMap.has(connector.key)) {
      connectorMap.set(connector.key, createConnectorBucket(connector));
    }
    return connectorMap.get(connector.key);
  };

  for (const actionRaw of actions) {
    const action = actionRaw && typeof actionRaw === 'object' && !Array.isArray(actionRaw) ? actionRaw : {};
    const type = String(action.type || '').trim();
    const channel = String(action.channel || '').trim();
    const incidentId = String(action.incidentId || '').trim();
    const blocking = Boolean(action.blocking);
    const key = String(action.actionKey || '').trim() || actionKey(action);
    action.actionKey = key;

    const typeStats = byTypeEnsure(outcomesByType, type || 'unknown');
    typeStats.total += 1;

    const remoteVerb = remoteAction(type);
    const connector = remoteVerb && remoteVerb !== 'local_link' ? resolveConnector(channel, cfg) : null;
    const connectorBucket = getConnectorBucket(connector);
    if (connectorBucket) connectorBucket.total += 1;

    action.execution = {
      runId,
      startedAt: nowIso,
      completedAt: nowIso,
      outcome: 'failed',
      reason: 'unknown',
      status: null,
      message: '',
      attempts: 0,
      retried: 0,
      action: remoteVerb,
      connector: connector?.key || null,
      provider: connector?.provider || null,
      latencyMs: null,
    };

    let outcome = 'failed';
    let reason = 'unknown';
    let message = '';
    let statusCode = null;
    let attempts = 0;
    let retried = 0;
    let latencyMs = null;

    const previous = executionState.actions[key] || null;
    const skipBySuccess = Boolean(previous && previous.lastOutcome === 'success' && !cfg.replaySuccess);
    const skipByApplied = Boolean(action.applied && !cfg.replayApplied);

    if (skipBySuccess || skipByApplied) {
      outcome = 'skipped';
      reason = skipBySuccess ? 'already_success' : 'already_applied';
      message = skipBySuccess
        ? 'action already succeeded in previous run'
        : 'action already marked as applied';
      if (connectorBucket) connectorBucket.skipped += 1;
    } else if (!type) {
      outcome = 'failed';
      reason = 'invalid_action_type';
      message = 'action type is missing';
      if (connectorBucket) connectorBucket.failed += 1;
    } else if (type === 'link_local_external_id') {
      if (!cfg.applyLocalLinks) {
        outcome = 'skipped';
        reason = 'local_links_disabled';
        message = 'FULLCYCLE_EXEC_APPLY_LOCAL_LINKS=false';
      } else if (!incidentId) {
        outcome = 'failed';
        reason = 'missing_incident_id';
        message = 'incidentId is required for local link';
      } else {
        const record = ensureStateIncident(state, incidentId, nowIso);
        const localResult = applyLocalLink({
          record,
          channel,
          remoteExternalId: action.remoteExternalId,
          nowIso,
          maxEvents: cfg.maxEventsPerIncident,
        });
        outcome = localResult.ok ? 'success' : 'failed';
        reason = localResult.reason;
        message = localResult.message;
        if (localResult.ok) {
          action.applied = true;
        }
      }
    } else if (!remoteVerb) {
      outcome = 'failed';
      reason = 'unsupported_action_type';
      message = `unsupported action type: ${type}`;
      if (connectorBucket) connectorBucket.failed += 1;
    } else if (!connector) {
      outcome = 'failed';
      reason = 'unknown_channel';
      message = `unsupported channel: ${channel}`;
    } else if (!connector.endpointUrl) {
      outcome = 'failed';
      reason = 'endpoint_not_configured';
      message = `${channel} endpoint not configured`;
      if (connectorBucket) connectorBucket.failed += 1;
    } else {
      const stateRecord = incidentId ? ensureStateIncident(state, incidentId, nowIso) : null;
      const incident = incidentId ? (incidentsById.get(incidentId) || null) : null;
      const payload = buildConnectorPayload({
        action,
        connector,
        incident,
        stateRecord,
        cfg,
        nowIso,
        runId,
      });

      if (cfg.requireEndpoints && !connector.endpointUrl) {
        outcome = 'failed';
        reason = 'endpoint_not_configured';
        message = `${channel} endpoint not configured`;
        if (connectorBucket) connectorBucket.failed += 1;
      } else {
        const reqValidation = cfg.connectorValidateContract
          ? validateRequestContract({ action, connector, payload })
          : { ok: true, errors: [] };
        if (!reqValidation.ok) {
          contractStats.requestErrors += 1;
          if (connectorBucket) connectorBucket.contractRequestErrors += 1;
          outcome = cfg.connectorEnforceRequestContract ? 'failed' : 'skipped';
          reason = 'contract_request_invalid';
          message = reqValidation.errors.join('; ');
          if (connectorBucket) {
            if (outcome === 'failed') connectorBucket.failed += 1;
            if (outcome === 'skipped') connectorBucket.skipped += 1;
          }
        } else if (cfg.dryRun) {
          outcome = 'success';
          reason = 'dry_run';
          message = 'dry-run (no remote call)';
          const record = incidentId ? ensureStateIncident(state, incidentId, nowIso) : null;
          const dryExternal = String(
            action.remoteExternalId
            || action.localExternalId
            || localExternalByChannel(record, channel)
            || '',
          ).trim() || null;
          applyRemoteSuccessToLocalState({
            record,
            action,
            remoteVerb,
            responseExternalId: dryExternal,
            nowIso,
            statusCode: null,
            message,
            maxEvents: cfg.maxEventsPerIncident,
          });
          action.applied = true;
          if (connectorBucket) {
            connectorBucket.success += 1;
            connectorBucket.dryRun += 1;
          }
        } else {
          const result = await executeRemoteWithRetry({
            connector,
            payload,
            cfg,
          });
          attempts = result.attempts;
          retried = result.retried;
          latencyMs = result.latencyMs;
          statusCode = result.status;
          totals.attempted += 1;
          totals.retried += retried;

          if (connectorBucket) {
            connectorBucket.attempted += 1;
            connectorBucket.httpAttempts += result.httpAttempts;
            connectorBucket.retried += retried;
            if (result.timedOut) connectorBucket.timeouts += 1;
            if (Number.isFinite(result.status) && result.status >= 400) connectorBucket.httpErrors += 1;
            if (Number.isFinite(result.status)) {
              const sk = String(result.status);
              connectorBucket.statuses[sk] = (connectorBucket.statuses[sk] || 0) + 1;
            }
            for (const latency of result.attemptLatencies || []) {
              if (Number.isFinite(latency)) connectorBucket.latencies.push(latency);
            }
          }

          if (result.ok) {
            const resValidation = cfg.connectorValidateContract
              ? validateResponseContract({ action, response: result })
              : { ok: true, errors: [] };
            if (!resValidation.ok) {
              contractStats.responseErrors += 1;
              if (connectorBucket) connectorBucket.contractResponseErrors += 1;
              if (cfg.connectorEnforceResponseContract) {
                outcome = 'failed';
                reason = 'contract_response_invalid';
                message = resValidation.errors.join('; ');
                if (connectorBucket) connectorBucket.failed += 1;
              } else {
                outcome = 'success';
                reason = 'response_contract_warning';
                message = resValidation.errors.join('; ');
                if (connectorBucket) connectorBucket.success += 1;
              }
            } else {
              outcome = 'success';
              reason = 'remote_success';
              message = result.message || '';
              if (connectorBucket) connectorBucket.success += 1;
            }

            if (outcome === 'success') {
              const record = incidentId ? ensureStateIncident(state, incidentId, nowIso) : null;
              applyRemoteSuccessToLocalState({
                record,
                action,
                remoteVerb,
                responseExternalId: result.externalId,
                nowIso,
                statusCode,
                message: result.message || '',
                maxEvents: cfg.maxEventsPerIncident,
              });
              action.applied = true;
            }
          } else {
            outcome = 'failed';
            reason = result.reason || 'remote_error';
            message = result.message || result.body || '';
            if (connectorBucket) connectorBucket.failed += 1;
          }
        }
      }
    }

    action.execution.outcome = outcome;
    action.execution.reason = reason;
    action.execution.status = statusCode;
    action.execution.message = message;
    action.execution.attempts = attempts;
    action.execution.retried = retried;
    action.execution.latencyMs = latencyMs;
    action.execution.completedAt = new Date().toISOString();

    if (outcome === 'success') {
      totals.success += 1;
      typeStats.success += 1;
    } else if (outcome === 'failed') {
      totals.failed += 1;
      typeStats.failed += 1;
      if (blocking) totals.blockingFailed += 1;
      failures.push({
        actionKey: key,
        type,
        channel,
        incidentId: incidentId || null,
        blocking,
        reason,
        status: statusCode,
        message,
      });
    } else {
      totals.skipped += 1;
      typeStats.skipped += 1;
      skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
    }

    updateActionExecutionState({
      executionState,
      nowIso,
      runId,
      action,
      outcome,
      statusCode,
      message,
      attempts,
      retried,
    });
  }

  totals.pendingAfter = actions.filter((item) => !item?.applied).length;
  totals.blockingPendingAfter = actions.filter((item) => Boolean(item?.blocking) && !item?.applied).length;

  let status = 'pass';
  if (cfg.failOnBlockingError && totals.blockingFailed > 0) {
    status = 'fail';
  } else if (cfg.failOnError && totals.failed > 0) {
    status = 'fail';
  }

  const connectors = summarizeConnectors(connectorMap);

  const report = {
    generatedAt: nowIso,
    runId,
    status,
    config: {
      dryRun: cfg.dryRun,
      requireEndpoints: cfg.requireEndpoints,
      failOnError: cfg.failOnError,
      failOnBlockingError: cfg.failOnBlockingError,
      replaySuccess: cfg.replaySuccess,
      replayApplied: cfg.replayApplied,
      timeoutMs: cfg.timeoutMs,
      maxRetries: cfg.maxRetries,
      retryBackoffMs: cfg.retryBackoffMs,
      validateContract: cfg.connectorValidateContract,
      enforceRequestContract: cfg.connectorEnforceRequestContract,
      enforceResponseContract: cfg.connectorEnforceResponseContract,
      providers: {
        itsm: norm(cfg.itsmProvider) || 'generic',
        oncall: norm(cfg.oncallProvider) || 'generic',
      },
      endpoints: {
        pagingConfigured: Boolean(cfg.pagingWebhookUrl),
        ticketConfigured: Boolean(cfg.ticketWebhookUrl),
      },
    },
    sources: {
      actionsFile: cfg.actionsFile,
      incidentsFile: cfg.incidentsFile,
      stateFile: cfg.stateFile,
      executionStateFile: cfg.executionStateFile,
      connectorTelemetryFile: cfg.connectorTelemetryFile,
    },
    totals,
    outcomesByType,
    skippedReasons,
    failures,
    contract: contractStats,
    connectors,
  };

  state.updatedAt = nowIso;
  state.version = 1;
  executionState.updatedAt = nowIso;
  executionState.version = 1;
  executionState.runs.push({
    runId,
    timestamp: nowIso,
    totals: {
      total: totals.total,
      success: totals.success,
      failed: totals.failed,
      skipped: totals.skipped,
      attempted: totals.attempted,
      retried: totals.retried,
      blockingTotal: totals.blockingTotal,
      blockingFailed: totals.blockingFailed,
    },
    sources: {
      actionsFile: cfg.actionsFile,
      stateFile: cfg.stateFile,
      incidentsFile: cfg.incidentsFile,
    },
  });
  if (executionState.runs.length > cfg.maxRunHistory) {
    executionState.runs = executionState.runs.slice(executionState.runs.length - cfg.maxRunHistory);
  }

  telemetryState.version = 1;
  telemetryState.updatedAt = nowIso;
  telemetryState.lastRunId = runId;
  telemetryState.history.push({
    timestamp: nowIso,
    runId,
    status,
    totals: {
      total: totals.total,
      success: totals.success,
      failed: totals.failed,
      skipped: totals.skipped,
      attempted: totals.attempted,
      retried: totals.retried,
      blockingFailed: totals.blockingFailed,
    },
    contract: contractStats,
    connectors,
  });
  if (telemetryState.history.length > cfg.connectorTelemetryMaxHistory) {
    telemetryState.history = telemetryState.history.slice(telemetryState.history.length - cfg.connectorTelemetryMaxHistory);
  }

  await writeJson(cfg.stateFile, state);
  await writeJson(cfg.executionStateFile, executionState);
  await writeJson(cfg.reportFile, report);
  await writeJson(cfg.connectorTelemetryFile, telemetryState);

  if (cfg.writeActionsFile) {
    const nextActionsDoc = {
      ...(actionsDoc && typeof actionsDoc === 'object' && !Array.isArray(actionsDoc) ? actionsDoc : {}),
      generatedAt: nowIso,
      actions,
    };
    await writeJson(cfg.actionsFile, nextActionsDoc);
  }

  const dashboardLines = [];
  dashboardLines.push('# Fullcycle Execution');
  dashboardLines.push('');
  dashboardLines.push(`- Generated at: ${nowIso}`);
  dashboardLines.push(`- Run ID: ${runId}`);
  dashboardLines.push(`- Status: ${status.toUpperCase()}`);
  dashboardLines.push(`- Dry run: ${cfg.dryRun ? 'yes' : 'no'}`);
  dashboardLines.push(`- Ticket endpoint: ${cfg.ticketWebhookUrl ? 'configured' : 'not configured'}`);
  dashboardLines.push(`- Paging endpoint: ${cfg.pagingWebhookUrl ? 'configured' : 'not configured'}`);
  dashboardLines.push('');
  dashboardLines.push('## Totals');
  dashboardLines.push('');
  dashboardLines.push(`- Actions: ${totals.total}`);
  dashboardLines.push(`- Success: ${totals.success}`);
  dashboardLines.push(`- Failed: ${totals.failed}`);
  dashboardLines.push(`- Skipped: ${totals.skipped}`);
  dashboardLines.push(`- Attempted remote calls: ${totals.attempted}`);
  dashboardLines.push(`- Retries executed: ${totals.retried}`);
  dashboardLines.push(`- Pending after run: ${totals.pendingAfter}`);
  dashboardLines.push(`- Blocking failures: ${totals.blockingFailed}`);
  dashboardLines.push(`- Blocking pending after run: ${totals.blockingPendingAfter}`);
  dashboardLines.push('');
  dashboardLines.push('## Contract');
  dashboardLines.push('');
  dashboardLines.push(`- Validation enabled: ${cfg.connectorValidateContract ? 'yes' : 'no'}`);
  dashboardLines.push(`- Request errors: ${contractStats.requestErrors}`);
  dashboardLines.push(`- Response errors: ${contractStats.responseErrors}`);
  dashboardLines.push('');
  dashboardLines.push('## Connectors');
  dashboardLines.push('');
  dashboardLines.push('| Connector | Total | Success | Failed | Skipped | Retries | p95 latency (ms) |');
  dashboardLines.push('|---|---|---|---|---|---|---|');
  const connectorKeys = Object.keys(connectors).sort();
  if (connectorKeys.length === 0) {
    dashboardLines.push('| - | 0 | 0 | 0 | 0 | 0 | n/a |');
  } else {
    for (const key of connectorKeys) {
      const item = connectors[key];
      dashboardLines.push(`| ${key} | ${item.total} | ${item.success} | ${item.failed} | ${item.skipped} | ${item.retried} | ${item.latencyMs.p95 ?? 'n/a'} |`);
    }
  }
  dashboardLines.push('');
  dashboardLines.push('## Failures');
  dashboardLines.push('');
  if (failures.length === 0) {
    dashboardLines.push('- none');
  } else {
    for (const failure of failures) {
      dashboardLines.push(`- [${failure.blocking ? 'BLOCKING' : 'INFO'}] ${failure.type} (${failure.channel}) incident=${failure.incidentId || 'n/a'} reason=${failure.reason}`);
    }
  }
  dashboardLines.push('');
  await writeText(cfg.dashboardFile, dashboardLines.join('\n'));

  const connectorLines = [];
  connectorLines.push('# Fullcycle Connector Telemetry');
  connectorLines.push('');
  connectorLines.push(`- Generated at: ${nowIso}`);
  connectorLines.push(`- Run ID: ${runId}`);
  connectorLines.push(`- Status: ${status.toUpperCase()}`);
  connectorLines.push(`- Telemetry history size: ${telemetryState.history.length}`);
  connectorLines.push('');
  connectorLines.push('| Connector | Provider | Channel | Endpoint | Total | Success | Failed | Skipped | HTTP attempts | Retries | Timeout | HTTP errors | Contract req | Contract res | p95 latency (ms) |');
  connectorLines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  if (connectorKeys.length === 0) {
    connectorLines.push('| - | - | - | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a |');
  } else {
    for (const key of connectorKeys) {
      const item = connectors[key];
      connectorLines.push(`| ${key} | ${item.provider} | ${item.channel} | ${item.endpointConfigured ? 'yes' : 'no'} | ${item.total} | ${item.success} | ${item.failed} | ${item.skipped} | ${item.httpAttempts} | ${item.retried} | ${item.timeouts} | ${item.httpErrors} | ${item.contractRequestErrors} | ${item.contractResponseErrors} | ${item.latencyMs.p95 ?? 'n/a'} |`);
    }
  }
  connectorLines.push('');
  await writeText(cfg.connectorDashboardFile, connectorLines.join('\n'));

  console.log(`Fullcycle execution report: ${cfg.reportFile}`);
  console.log(`Fullcycle execution state: ${cfg.executionStateFile}`);
  console.log(`Fullcycle connector telemetry: ${cfg.connectorTelemetryFile}`);
  console.log(`[FULLCYCLE-EXEC] status=${status} total=${totals.total} success=${totals.success} failed=${totals.failed} skipped=${totals.skipped}`);

  if (status === 'fail') {
    for (const failure of failures) {
      if (!failure.blocking && !cfg.failOnError) continue;
      console.error(`[FULLCYCLE-EXEC] ${failure.type} (${failure.channel}) ${failure.reason}: ${failure.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase18 fullcycle execution failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
