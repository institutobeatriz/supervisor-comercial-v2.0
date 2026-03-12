import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONAL_COLLECTOR_INTERFACE,
  OPERATIONAL_COLLECTOR_SCHEMA,
  OPERATIONAL_COLLECTOR_VERSION,
  envString,
  readJson,
  writeJson,
} from './observability-operational-provider.mjs';

// ---------------------------------------------------------------------------
// Collector output validation
// ---------------------------------------------------------------------------

export function validateCollectorSources(sources) {
  const errors = [];
  if (!sources || typeof sources !== 'object') {
    errors.push('sources must be a non-null object');
    return errors;
  }
  for (const key of ['incidentAutomation', 'itsmSnapshot', 'fullcycleReport']) {
    if (!sources[key] || typeof sources[key] !== 'object') {
      errors.push(`sources.${key} is missing or not an object`);
    }
  }
  if (errors.length > 0) return errors;

  const ia = sources.incidentAutomation;
  if (typeof ia.loaded !== 'boolean') errors.push('sources.incidentAutomation.loaded must be boolean');
  if (ia.incidents !== null && typeof ia.incidents !== 'object') errors.push('sources.incidentAutomation.incidents must be object');
  if (typeof ia.incidentCount !== 'number') errors.push('sources.incidentAutomation.incidentCount must be number');

  const it = sources.itsmSnapshot;
  if (typeof it.loaded !== 'boolean') errors.push('sources.itsmSnapshot.loaded must be boolean');
  if (!Array.isArray(it.paging)) errors.push('sources.itsmSnapshot.paging must be array');
  if (!Array.isArray(it.tickets)) errors.push('sources.itsmSnapshot.tickets must be array');
  if (typeof it.pagingCount !== 'number') errors.push('sources.itsmSnapshot.pagingCount must be number');
  if (typeof it.ticketCount !== 'number') errors.push('sources.itsmSnapshot.ticketCount must be number');

  const fr = sources.fullcycleReport;
  if (typeof fr.loaded !== 'boolean') errors.push('sources.fullcycleReport.loaded must be boolean');
  if (typeof fr.status !== 'string') errors.push('sources.fullcycleReport.status must be string');
  if (fr.summary !== null && typeof fr.summary !== 'object') errors.push('sources.fullcycleReport.summary must be object');

  return errors;
}

// ---------------------------------------------------------------------------
// Normalization helpers (mirrors private helpers in the provider)
// ---------------------------------------------------------------------------

function timestampFrom(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (String(value || '').trim()) return String(value).trim();
  }
  return null;
}

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw || fallback;
}

function normalizeExternal(snapshot, key) {
  const direct = Array.isArray(snapshot?.[key]) ? snapshot[key] : [];
  const nested = Array.isArray(snapshot?.items?.[key]) ? snapshot.items[key] : [];
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

function sanitizeIncidentAutomation(automationState) {
  const incidents =
    automationState && typeof automationState.incidents === 'object' && !Array.isArray(automationState.incidents)
      ? automationState.incidents
      : {};
  return Object.fromEntries(
    Object.entries(incidents).map(([incidentId, item]) => [
      String(incidentId).trim(),
      {
        owner: String(item?.owner || '').trim() || null,
        ownerAssignedAt: String(item?.ownerAssignedAt || '').trim() || null,
        ownerTimezone: String(item?.ownerTimezone || '').trim() || null,
        updatedAt: String(item?.updatedAt || '').trim() || null,
        paging: {
          externalId: String(item?.paging?.externalId || item?.paging?.external_id || '').trim() || null,
        },
        ticket: {
          externalId: String(item?.ticket?.externalId || item?.ticket?.external_id || '').trim() || null,
        },
      },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Synthetic sources (deterministic test data)
// ---------------------------------------------------------------------------

function buildSyntheticSources(ts) {
  return {
    incidentAutomation: {
      key: 'incidentAutomation',
      label: 'Incident automation state',
      file: '(synthetic)',
      loaded: true,
      timestamp: ts,
      incidentCount: 1,
      incidents: {
        'INC-SYNTH-001': {
          owner: 'team-platform',
          ownerAssignedAt: ts,
          ownerTimezone: 'America/Sao_Paulo',
          updatedAt: ts,
          paging: { externalId: 'PAGE-SYNTH-001' },
          ticket: { externalId: 'TKT-SYNTH-001' },
        },
      },
    },
    itsmSnapshot: {
      key: 'itsmSnapshot',
      label: 'ITSM snapshot',
      file: '(synthetic)',
      loaded: true,
      timestamp: ts,
      pagingCount: 1,
      ticketCount: 1,
      paging: [
        {
          externalId: 'PAGE-SYNTH-001',
          incidentId: 'INC-SYNTH-001',
          status: 'active',
          owner: 'team-platform',
          raw: null,
        },
      ],
      tickets: [
        {
          externalId: 'TKT-SYNTH-001',
          incidentId: 'INC-SYNTH-001',
          status: 'open',
          owner: 'team-platform',
          raw: null,
        },
      ],
    },
    fullcycleReport: {
      key: 'fullcycleReport',
      label: 'Fullcycle report',
      file: '(synthetic)',
      loaded: true,
      timestamp: ts,
      status: 'pass',
      ownerCoveragePct: 100,
      summary: { ownerCoveragePct: 100, status: 'pass' },
    },
  };
}

// ---------------------------------------------------------------------------
// File-based sources (reads real files from disk)
// ---------------------------------------------------------------------------

async function buildFileSources({ automationStateFile, snapshotFile, fullcycleReportFile }) {
  const [automationState, snapshot, fullcycleReport] = await Promise.all([
    readJson(automationStateFile, null),
    readJson(snapshotFile, null),
    readJson(fullcycleReportFile, null),
  ]);

  const stateIncidents = sanitizeIncidentAutomation(automationState || {});
  const normalizedPaging = normalizeExternal(snapshot, 'paging');
  const normalizedTickets = normalizeExternal(snapshot, 'tickets');

  return {
    incidentAutomation: {
      key: 'incidentAutomation',
      label: 'Incident automation state',
      file: automationStateFile,
      loaded: Boolean(automationState && typeof automationState === 'object'),
      timestamp: timestampFrom(automationState, ['updatedAt', 'generatedAt', 'timestamp']),
      incidentCount: Object.keys(stateIncidents).length,
      incidents: stateIncidents,
    },
    itsmSnapshot: {
      key: 'itsmSnapshot',
      label: 'ITSM snapshot',
      file: snapshotFile,
      loaded: Boolean(snapshot && typeof snapshot === 'object'),
      timestamp: timestampFrom(snapshot, ['generatedAt', 'updatedAt', 'timestamp']),
      pagingCount: normalizedPaging.length,
      ticketCount: normalizedTickets.length,
      paging: normalizedPaging,
      tickets: normalizedTickets,
    },
    fullcycleReport: {
      key: 'fullcycleReport',
      label: 'Fullcycle report',
      file: fullcycleReportFile,
      loaded: Boolean(fullcycleReport && typeof fullcycleReport === 'object'),
      timestamp: timestampFrom(fullcycleReport, ['generatedAt', 'updatedAt', 'timestamp']),
      status: normalizeStatus(fullcycleReport?.status, 'unknown'),
      ownerCoveragePct:
        Number.isFinite(Number(fullcycleReport?.summary?.ownerCoveragePct))
          ? Number(fullcycleReport.summary.ownerCoveragePct)
          : null,
      summary:
        fullcycleReport?.summary && typeof fullcycleReport.summary === 'object'
          ? fullcycleReport.summary
          : {},
    },
  };
}

// ---------------------------------------------------------------------------
// API-based sources (fetches from internal observability API)
// ---------------------------------------------------------------------------

async function buildApiSources({ apiBaseUrl, apiKey }) {
  const url = `${apiBaseUrl}/api/observability/connectors/backend/report`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-admin-key': apiKey || '',
        'x-observability-role': 'executive',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('collector api timeout');
    }
    throw new Error(`collector api unreachable: ${err.message}`);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`collector api returned status ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error('collector api response not JSON');
  }

  const rawSources = data?.sources || data?.backend?.sources || {};
  return mapApiSourcesToCollectorFormat(rawSources);
}

function mapApiSourcesToCollectorFormat(rawSources) {
  const ia = rawSources?.incidentAutomation || {};
  const it = rawSources?.itsmSnapshot || {};
  const fr = rawSources?.fullcycleReport || {};

  return {
    incidentAutomation: {
      key: 'incidentAutomation',
      label: 'Incident automation state',
      file: '(api)',
      loaded: Boolean(ia.loaded),
      timestamp: ia.timestamp || null,
      incidentCount: typeof ia.incidentCount === 'number' ? ia.incidentCount : 0,
      incidents: ia.incidents && typeof ia.incidents === 'object' ? ia.incidents : {},
    },
    itsmSnapshot: {
      key: 'itsmSnapshot',
      label: 'ITSM snapshot',
      file: '(api)',
      loaded: Boolean(it.loaded),
      timestamp: it.timestamp || null,
      pagingCount: typeof it.pagingCount === 'number' ? it.pagingCount : (Array.isArray(it.paging) ? it.paging.length : 0),
      ticketCount: typeof it.ticketCount === 'number' ? it.ticketCount : (Array.isArray(it.tickets) ? it.tickets.length : 0),
      paging: Array.isArray(it.paging) ? it.paging : [],
      tickets: Array.isArray(it.tickets) ? it.tickets : [],
    },
    fullcycleReport: {
      key: 'fullcycleReport',
      label: 'Fullcycle report',
      file: '(api)',
      loaded: Boolean(fr.loaded),
      timestamp: fr.timestamp || null,
      status: typeof fr.status === 'string' ? fr.status : 'unknown',
      ownerCoveragePct: typeof fr.ownerCoveragePct === 'number' ? fr.ownerCoveragePct : null,
      summary: fr.summary && typeof fr.summary === 'object' ? fr.summary : {},
    },
  };
}

// ---------------------------------------------------------------------------
// Main collector function (exported for direct import)
// ---------------------------------------------------------------------------

/**
 * Collect operational sources respecting OPERATIONAL_COLLECTOR_INTERFACE.
 *
 * @param {object} options
 * @param {string} [options.mode='file']        - 'file' | 'synthetic' | 'api'
 * @param {string} [options.apiBaseUrl]         - base URL for api mode
 * @param {string} [options.apiKey]             - API key for api mode
 * @param {string} [options.automationStateFile]
 * @param {string} [options.snapshotFile]
 * @param {string} [options.fullcycleReportFile]
 * @param {string} [options.ts]
 * @returns {{ sources, mode, schema, version, collectorMode, validationErrors }}
 */
export async function collectOperationalSources(options = {}) {
  const ts = options.ts || new Date().toISOString();
  const mode = options.mode || envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE', 'file');
  const automationStateFile =
    options.automationStateFile ||
    envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE',
      envString('INCIDENT_AUTOMATION_STATE_FILE', path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json')));
  const snapshotFile =
    options.snapshotFile ||
    envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE',
      envString('ITSM_SNAPSHOT_FILE', path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json')));
  const fullcycleReportFile =
    options.fullcycleReportFile ||
    envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE',
      envString('FULLCYCLE_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json')));
  const apiBaseUrl =
    options.apiBaseUrl ||
    envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL', 'http://localhost:3000');
  const apiKey =
    options.apiKey ||
    envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY',
      envString('ADMIN_API_KEY', ''));

  let sources;
  let collectorMode = mode;

  if (mode === 'api') {
    sources = await buildApiSources({ apiBaseUrl, apiKey });
    collectorMode = 'api';
  } else if (mode === 'synthetic') {
    sources = buildSyntheticSources(ts);
  } else {
    sources = await buildFileSources({ automationStateFile, snapshotFile, fullcycleReportFile });
    collectorMode = 'file';
  }

  const validationErrors = validateCollectorSources(sources);

  return {
    sources,
    mode: collectorMode,
    schema: OPERATIONAL_COLLECTOR_SCHEMA,
    version: OPERATIONAL_COLLECTOR_VERSION,
    collectorMode,
    interface: OPERATIONAL_COLLECTOR_INTERFACE,
    generatedAt: ts,
    validationErrors,
    valid: validationErrors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Script entry point
// ---------------------------------------------------------------------------

async function main() {
  const ts = new Date().toISOString();
  const mode = envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE', 'file');
  const reportFile = path.resolve(process.cwd(), 'logs/monitoring/phase44-collector/collector-report.json');

  const result = await collectOperationalSources({ ts, mode });

  const report = {
    generatedAt: ts,
    schema: OPERATIONAL_COLLECTOR_SCHEMA,
    version: OPERATIONAL_COLLECTOR_VERSION,
    collectorMode: result.collectorMode,
    valid: result.valid,
    validationErrors: result.validationErrors,
    summary: {
      incidentAutomationLoaded: result.sources.incidentAutomation.loaded,
      incidentCount: result.sources.incidentAutomation.incidentCount,
      itsmSnapshotLoaded: result.sources.itsmSnapshot.loaded,
      pagingCount: result.sources.itsmSnapshot.pagingCount,
      ticketCount: result.sources.itsmSnapshot.ticketCount,
      fullcycleReportLoaded: result.sources.fullcycleReport.loaded,
      fullcycleStatus: result.sources.fullcycleReport.status,
    },
  };

  await writeJson(reportFile, report);
  console.log(`Collector report: ${reportFile}`);
  console.log(
    `[OBS-BACKEND-COLLECTOR] mode=${result.collectorMode} valid=${result.valid}` +
    ` incidents=${result.sources.incidentAutomation.incidentCount}` +
    ` paging=${result.sources.itsmSnapshot.pagingCount}` +
    ` tickets=${result.sources.itsmSnapshot.ticketCount}` +
    ` fullcycle=${result.sources.fullcycleReport.status}`,
  );

  if (!result.valid) {
    for (const err of result.validationErrors) {
      console.error(`[OBS-BACKEND-COLLECTOR] validation error: ${err}`);
    }
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(`Unexpected phase44 collector failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
