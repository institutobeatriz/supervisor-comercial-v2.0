import fs from 'node:fs/promises';
import path from 'node:path';

export const OPERATIONAL_PROVIDER_SCHEMA = 'fullcycle.observability.operational-provider.v1';
export const OPERATIONAL_PROVIDER_VERSION = 1;

export function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw || fallback;
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function timestampFrom(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (String(value || '').trim()) return String(value).trim();
  }
  return null;
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

function sanitizeIncidentAutomation(automationState) {
  const incidents = automationState && typeof automationState.incidents === 'object' && !Array.isArray(automationState.incidents)
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

function buildLegacySources({ automationState, snapshot, fullcycleReport, cfg }) {
  const normalizedSnapshot = {
    paging: normalizeExternal(snapshot, 'paging'),
    tickets: normalizeExternal(snapshot, 'tickets'),
  };
  const stateIncidents = sanitizeIncidentAutomation(automationState || {});

  return {
    incidentAutomation: {
      key: 'incidentAutomation',
      label: 'Incident automation state',
      file: cfg.automationStateFile,
      loaded: Boolean(automationState && typeof automationState === 'object'),
      timestamp: timestampFrom(automationState, ['updatedAt', 'generatedAt', 'timestamp']),
      incidentCount: Object.keys(stateIncidents).length,
      incidents: stateIncidents,
    },
    itsmSnapshot: {
      key: 'itsmSnapshot',
      label: 'ITSM snapshot',
      file: cfg.snapshotFile,
      loaded: Boolean(snapshot && typeof snapshot === 'object'),
      timestamp: timestampFrom(snapshot, ['generatedAt', 'updatedAt', 'timestamp']),
      pagingCount: normalizedSnapshot.paging.length,
      ticketCount: normalizedSnapshot.tickets.length,
      paging: normalizedSnapshot.paging,
      tickets: normalizedSnapshot.tickets,
    },
    fullcycleReport: {
      key: 'fullcycleReport',
      label: 'Fullcycle report',
      file: cfg.fullcycleReportFile,
      loaded: Boolean(fullcycleReport && typeof fullcycleReport === 'object'),
      timestamp: timestampFrom(fullcycleReport, ['generatedAt', 'updatedAt', 'timestamp']),
      status: normalizeStatus(fullcycleReport?.status, 'unknown'),
      ownerCoveragePct: Number.isFinite(Number(fullcycleReport?.summary?.ownerCoveragePct))
        ? Number(fullcycleReport.summary.ownerCoveragePct)
        : null,
      summary: fullcycleReport?.summary && typeof fullcycleReport.summary === 'object'
        ? fullcycleReport.summary
        : {},
    },
  };
}

function summarizeSources(sources) {
  const items = Object.values(sources);
  return {
    loadedSources: items.filter((item) => item.loaded).length,
    missingSources: items.filter((item) => !item.loaded).length,
    incidentAutomationIncidents: Number(sources.incidentAutomation?.incidentCount || 0),
    pagingEntries: Number(sources.itsmSnapshot?.pagingCount || 0),
    ticketEntries: Number(sources.itsmSnapshot?.ticketCount || 0),
    fullcycleStatus: sources.fullcycleReport?.status || 'unknown',
  };
}

function buildMaterializedContract({ sources, cfg, ts, materializedBy }) {
  return {
    version: OPERATIONAL_PROVIDER_VERSION,
    schema: OPERATIONAL_PROVIDER_SCHEMA,
    generatedAt: ts,
    providerMode: 'materialized_contract',
    materializationMode: 'controlled',
    materializedBy,
    sourceFiles: {
      incidentAutomation: cfg.automationStateFile,
      itsmSnapshot: cfg.snapshotFile,
      fullcycleReport: cfg.fullcycleReportFile,
    },
    summary: summarizeSources(sources),
    sources,
  };
}

function isOperationalContract(contract) {
  return Boolean(
    contract
    && typeof contract === 'object'
    && Number(contract.version) === OPERATIONAL_PROVIDER_VERSION
    && String(contract.schema || '').trim() === OPERATIONAL_PROVIDER_SCHEMA
    && contract.sources
    && typeof contract.sources === 'object',
  );
}

function buildProviderMeta({ cfg, mode, contract, sources, contractLoaded, loadError, materialized }) {
  return {
    mode,
    sourceMode: mode === 'materialized_contract' ? 'operational_contract' : 'operational_state',
    contractFile: cfg.contractFile,
    contractLoaded,
    contractVersion: contract?.version || null,
    contractSchema: contract?.schema || null,
    contractGeneratedAt: contract?.generatedAt || null,
    contractState: contractLoaded ? 'ready' : 'missing',
    materialized,
    materializationMode: contract?.materializationMode || (mode === 'materialized_contract' ? 'controlled' : 'legacy'),
    materializedBy: contract?.materializedBy || null,
    allowLegacyFallback: cfg.allowLegacyFallback,
    sources,
    summary: summarizeSources(sources),
    loadError: loadError || null,
  };
}

function asOperationalInputs({ meta, contractLoaded, contract, legacy }) {
  const sourceSnapshot = contractLoaded && contract ? contract.sources : legacy.sources;
  return {
    automationState: sourceSnapshot.incidentAutomation.loaded
      ? {
        updatedAt: sourceSnapshot.incidentAutomation.timestamp,
        incidents: sourceSnapshot.incidentAutomation.incidents,
      }
      : null,
    snapshot: sourceSnapshot.itsmSnapshot.loaded
      ? {
        generatedAt: sourceSnapshot.itsmSnapshot.timestamp,
        paging: sourceSnapshot.itsmSnapshot.paging,
        tickets: sourceSnapshot.itsmSnapshot.tickets,
      }
      : null,
    fullcycleReport: sourceSnapshot.fullcycleReport.loaded
      ? {
        generatedAt: sourceSnapshot.fullcycleReport.timestamp,
        status: sourceSnapshot.fullcycleReport.status,
        summary: sourceSnapshot.fullcycleReport.summary,
      }
      : null,
    meta,
  };
}

export async function loadOperationalProvider(options = {}) {
  const ts = options.ts || new Date().toISOString();
  const cfg = {
    providerMode: options.providerMode || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
    materializeContract: options.materializeContract ?? envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    allowLegacyFallback: options.allowLegacyFallback ?? envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
    contractFile: options.contractFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    automationStateFile: options.automationStateFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE', envString('INCIDENT_AUTOMATION_STATE_FILE', path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'))),
    snapshotFile: options.snapshotFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE', envString('ITSM_SNAPSHOT_FILE', path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'))),
    fullcycleReportFile: options.fullcycleReportFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE', envString('FULLCYCLE_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'))),
    materializedBy: options.materializedBy || 'phase41-observability-operational-provider-contract',
  };

  const [automationState, snapshot, fullcycleReport] = await Promise.all([
    readJson(cfg.automationStateFile, null),
    readJson(cfg.snapshotFile, null),
    readJson(cfg.fullcycleReportFile, null),
  ]);
  const legacySources = buildLegacySources({ automationState, snapshot, fullcycleReport, cfg });
  const legacy = {
    sources: legacySources,
    automationState,
    snapshot,
    fullcycleReport,
  };

  if (cfg.providerMode !== 'materialized_contract') {
    const meta = buildProviderMeta({
      cfg,
      mode: 'legacy_files',
      contract: null,
      sources: legacySources,
      contractLoaded: false,
      loadError: null,
      materialized: false,
    });
    return { ...asOperationalInputs({ meta, contractLoaded: false, contract: null, legacy }), contract: null };
  }

  let contract = null;
  let loadError = null;
  let materialized = false;

  if (cfg.materializeContract) {
    contract = buildMaterializedContract({
      sources: legacySources,
      cfg,
      ts,
      materializedBy: cfg.materializedBy,
    });
    await writeJson(cfg.contractFile, contract);
    materialized = true;
  } else {
    const loadedContract = await readJson(cfg.contractFile, null);
    if (isOperationalContract(loadedContract)) {
      contract = loadedContract;
    } else {
      loadError = loadedContract ? 'invalid_contract' : 'missing_contract';
    }
  }

  if (!contract && cfg.allowLegacyFallback) {
    const meta = buildProviderMeta({
      cfg,
      mode: 'materialized_contract',
      contract: null,
      sources: legacySources,
      contractLoaded: false,
      loadError,
      materialized,
    });
    return { ...asOperationalInputs({ meta, contractLoaded: false, contract: null, legacy }), contract: null };
  }

  const contractLoaded = isOperationalContract(contract);
  const sources = contractLoaded ? contract.sources : {
    incidentAutomation: { key: 'incidentAutomation', label: 'Incident automation state', file: cfg.automationStateFile, loaded: false, timestamp: null, incidentCount: 0, incidents: {} },
    itsmSnapshot: { key: 'itsmSnapshot', label: 'ITSM snapshot', file: cfg.snapshotFile, loaded: false, timestamp: null, pagingCount: 0, ticketCount: 0, paging: [], tickets: [] },
    fullcycleReport: { key: 'fullcycleReport', label: 'Fullcycle report', file: cfg.fullcycleReportFile, loaded: false, timestamp: null, status: 'unknown', ownerCoveragePct: null, summary: {} },
  };
  const meta = buildProviderMeta({
    cfg,
    mode: 'materialized_contract',
    contract,
    sources,
    contractLoaded,
    loadError,
    materialized,
  });
  return { ...asOperationalInputs({ meta, contractLoaded, contract, legacy }), contract };
}
