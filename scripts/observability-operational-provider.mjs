import fs from 'node:fs/promises';
import path from 'node:path';

export const OPERATIONAL_PROVIDER_SCHEMA = 'fullcycle.observability.operational-provider.v1';
export const OPERATIONAL_PROVIDER_VERSION = 1;

export const OPERATIONAL_COLLECTOR_SCHEMA = 'fullcycle.observability.operational-collector.v1';
export const OPERATIONAL_COLLECTOR_VERSION = 1;

/**
 * Interface contract for the dedicated operational data collector.
 * This defines what a real collector/service must produce to replace file-based producer feeding.
 * Phase 43: canonical definition — consumers must not invent alternatives.
 */
export const OPERATIONAL_COLLECTOR_INTERFACE = {
  schema: OPERATIONAL_COLLECTOR_SCHEMA,
  version: OPERATIONAL_COLLECTOR_VERSION,
  description: 'Interface for dedicated operational data collector replacing file-based producer feeding',
  integrationModes: ['file', 'api', 'service'],
  preferredMode: 'service',
  outputs: {
    incidentAutomation: {
      description: 'Current incident automation state with owner assignments and external IDs',
      required: true,
      fields: {
        version: { type: 'number', required: true },
        updatedAt: { type: 'string', format: 'iso8601', required: true },
        incidents: {
          type: 'object',
          description: 'Map of incidentId -> incident automation record',
          required: true,
          recordSchema: {
            owner: { type: 'string', nullable: true },
            ownerAssignedAt: { type: 'string', format: 'iso8601', nullable: true },
            ownerTimezone: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'iso8601', nullable: true },
            paging: { type: 'object', fields: { externalId: { type: 'string', nullable: true } } },
            ticket: { type: 'object', fields: { externalId: { type: 'string', nullable: true } } },
          },
        },
      },
    },
    itsmSnapshot: {
      description: 'Current ITSM snapshot with paging and ticket entries',
      required: true,
      fields: {
        generatedAt: { type: 'string', format: 'iso8601', required: true },
        paging: {
          type: 'array',
          required: true,
          itemSchema: {
            externalId: { type: 'string' },
            incidentId: { type: 'string' },
            status: { type: 'string' },
            owner: { type: 'string', nullable: true },
          },
        },
        tickets: {
          type: 'array',
          required: true,
          itemSchema: {
            externalId: { type: 'string' },
            incidentId: { type: 'string' },
            status: { type: 'string' },
            owner: { type: 'string', nullable: true },
          },
        },
      },
    },
    fullcycleReport: {
      description: 'Latest fullcycle governance report with owner coverage and status',
      required: true,
      fields: {
        generatedAt: { type: 'string', format: 'iso8601', required: true },
        status: { type: 'string', enum: ['pass', 'warn', 'fail', 'unknown'], required: true },
        summary: {
          type: 'object',
          required: true,
          fields: {
            ownerCoveragePct: { type: 'number', minimum: 0, maximum: 100, nullable: true },
          },
        },
      },
    },
  },
  collectorContract: {
    description: 'What the collector must expose for the producer to consume',
    materializeTo: 'logs/monitoring/fullcycle-connector-observability-operational-provider.json',
    schema: OPERATIONAL_PROVIDER_SCHEMA,
    version: OPERATIONAL_PROVIDER_VERSION,
  },
  enforcement: {
    phase: 'phase43-disable-legacy-fallback',
    legacyFilesBlocked: true,
    enforceNoLegacy: 'FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY',
    rolloutTarget: 'phase44-collector-service-integration',
  },
};

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

function buildMaterializedContract({ sources, cfg, ts, materializedBy, producer = null }) {
  return {
    version: OPERATIONAL_PROVIDER_VERSION,
    schema: OPERATIONAL_PROVIDER_SCHEMA,
    generatedAt: ts,
    providerMode: 'materialized_contract',
    materializationMode: 'controlled',
    materializedBy,
    producer: producer && typeof producer === 'object'
      ? {
        mode: String(producer.mode || '').trim() || 'unknown',
        generatedAt: String(producer.generatedAt || ts).trim() || ts,
        ready: producer.ready !== false,
        reportFile: String(producer.reportFile || '').trim() || null,
        dashboardFile: String(producer.dashboardFile || '').trim() || null,
        auditFile: String(producer.auditFile || '').trim() || null,
        legacyFallbackAllowed: producer.legacyFallbackAllowed === true,
        legacyFallbackState: String(producer.legacyFallbackState || '').trim() || (producer.legacyFallbackAllowed === true ? 'deprecated_allowed' : 'disabled'),
        deprecationTarget: String(producer.deprecationTarget || '').trim() || null,
      }
      : null,
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
  const producer = contract?.producer && typeof contract.producer === 'object' ? contract.producer : null;
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
    producerMode: producer?.mode || null,
    producerGeneratedAt: producer?.generatedAt || null,
    producerReady: producer ? producer.ready !== false : null,
    producerReportFile: producer?.reportFile || null,
    producerDashboardFile: producer?.dashboardFile || null,
    producerAuditFile: producer?.auditFile || null,
    legacyFallbackState: 'disabled',
    legacyFallbackAllowed: false,
    deprecationTarget: producer?.deprecationTarget || null,
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
    materializeContract: options.materializeContract ?? envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    contractFile: options.contractFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    automationStateFile: options.automationStateFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE', envString('INCIDENT_AUTOMATION_STATE_FILE', path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'))),
    snapshotFile: options.snapshotFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE', envString('ITSM_SNAPSHOT_FILE', path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'))),
    fullcycleReportFile: options.fullcycleReportFile || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE', envString('FULLCYCLE_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'))),
    materializedBy: options.materializedBy || 'phase41-observability-operational-provider-contract',
    producer: options.producer && typeof options.producer === 'object' ? options.producer : null,
    collectorSources: options.collectorSources && typeof options.collectorSources === 'object' ? options.collectorSources : null,
  };

  let legacySources;
  let legacyRaw;
  if (cfg.collectorSources) {
    legacySources = cfg.collectorSources;
    legacyRaw = { automationState: null, snapshot: null, fullcycleReport: null };
  } else {
    const [automationState, snapshot, fullcycleReport] = await Promise.all([
      readJson(cfg.automationStateFile, null),
      readJson(cfg.snapshotFile, null),
      readJson(cfg.fullcycleReportFile, null),
    ]);
    legacyRaw = { automationState, snapshot, fullcycleReport };
    legacySources = buildLegacySources({ automationState, snapshot, fullcycleReport, cfg });
  }
  const legacy = {
    sources: legacySources,
    ...legacyRaw,
  };

  let contract = null;
  let loadError = null;
  let materialized = false;

  if (cfg.materializeContract) {
    contract = buildMaterializedContract({
      sources: legacySources,
      cfg,
      ts,
      materializedBy: cfg.materializedBy,
      producer: cfg.producer,
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
