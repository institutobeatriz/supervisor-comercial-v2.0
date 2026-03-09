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

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw || fallback;
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

function ageMinutes(value, nowMs = Date.now()) {
  const ts = parseMs(value);
  if (!Number.isFinite(ts) || !Number.isFinite(nowMs)) return null;
  return round((nowMs - ts) / 60_000, 2);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
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

function timestampFrom(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (String(value || '').trim()) return String(value).trim();
  }
  return null;
}

function classifyFreshness(loaded, timestamp, maxAgeMinutes, nowMs) {
  if (!loaded) {
    return {
      timestamp: null,
      ageMinutes: null,
      freshnessState: 'missing',
      freshEnough: false,
    };
  }

  const age = ageMinutes(timestamp, nowMs);
  if (!String(timestamp || '').trim() || age === null) {
    return {
      timestamp: String(timestamp || '').trim() || null,
      ageMinutes: age,
      freshnessState: 'unknown',
      freshEnough: false,
    };
  }

  if (age <= maxAgeMinutes) {
    return {
      timestamp,
      ageMinutes: age,
      freshnessState: 'healthy',
      freshEnough: true,
    };
  }

  return {
    timestamp,
    ageMinutes: age,
    freshnessState: 'stale',
    freshEnough: false,
  };
}

function buildSourceStatus({
  key,
  label,
  file,
  loaded,
  timestamp,
  payload,
  timestampKeys,
  maxAgeMinutes,
  requiredWhenActive,
  nowMs,
}) {
  const loadedValue = typeof loaded === 'boolean'
    ? loaded
    : Boolean(payload && typeof payload === 'object');
  const timestampValue = String(timestamp || '').trim() || timestampFrom(payload, timestampKeys);
  const freshness = classifyFreshness(loadedValue, timestampValue, maxAgeMinutes, nowMs);
  return {
    key,
    label,
    file,
    loaded: loadedValue,
    requiredWhenActive,
    maxAgeMinutes,
    timestamp: freshness.timestamp,
    ageMinutes: freshness.ageMinutes,
    freshnessState: freshness.freshnessState,
    freshEnough: freshness.freshEnough,
  };
}

function summarizeOperationalSources(sources, activeRecordCount) {
  const hasActiveRecords = activeRecordCount > 0;
  const counts = {
    healthy: 0,
    stale: 0,
    missing: 0,
    unknown: 0,
  };

  for (const source of sources) {
    if (source.freshnessState === 'healthy') counts.healthy += 1;
    else if (source.freshnessState === 'stale') counts.stale += 1;
    else if (source.freshnessState === 'missing') counts.missing += 1;
    else counts.unknown += 1;
  }

  const required = sources.filter((source) => source.requiredWhenActive);
  const requiredBad = required.filter((source) => source.freshnessState !== 'healthy');
  const anyBad = sources.filter((source) => source.freshnessState !== 'healthy');

  let freshnessState = 'healthy';
  if (sources.some((source) => source.freshnessState === 'missing')) freshnessState = 'missing';
  else if (sources.some((source) => source.freshnessState === 'stale')) freshnessState = 'stale';
  else if (sources.some((source) => source.freshnessState === 'unknown')) freshnessState = 'unknown';

  let actionabilityState = 'ready';
  if (!hasActiveRecords) {
    actionabilityState = anyBad.length > 0 ? 'idle_gap' : 'idle';
  } else if (requiredBad.length > 0) {
    actionabilityState = 'degraded';
  } else {
    actionabilityState = 'ready';
  }

  return {
    overall: {
      workloadState: hasActiveRecords ? 'active' : 'idle',
      freshnessState,
      actionabilityState,
      healthySources: counts.healthy,
      staleSources: counts.stale,
      missingSources: counts.missing,
      unknownSources: counts.unknown,
      requiredSources: required.length,
      requiredHealthySources: required.filter((source) => source.freshnessState === 'healthy').length,
      activeRecords: activeRecordCount,
      activeWorkloadPresent: hasActiveRecords,
    },
    sources: Object.fromEntries(sources.map((source) => [source.key, source])),
  };
}

function buildSourceViolations(sources, hasActiveRecords) {
  const violations = [];

  for (const source of sources) {
    if (source.freshnessState === 'healthy') continue;

    const codeBase = source.key === 'incidentAutomation'
      ? 'operational_state'
      : source.key === 'itsmSnapshot'
        ? 'operational_snapshot'
        : 'operational_fullcycle_report';

    let code = `${codeBase}_missing`;
    if (source.freshnessState === 'stale') code = `${codeBase}_stale`;
    else if (source.freshnessState === 'unknown') code = `${codeBase}_timestamp_missing`;

    const blocking = Boolean(hasActiveRecords && source.requiredWhenActive);
    const details = [
      source.loaded ? `loaded=yes` : 'loaded=no',
      source.timestamp ? `timestamp=${source.timestamp}` : 'timestamp=n/a',
      source.ageMinutes !== null ? `age=${source.ageMinutes}min` : 'age=n/a',
      `max=${source.maxAgeMinutes}min`,
    ].join(', ');

    violations.push({
      code,
      blocking,
      message: `${source.label} freshness=${source.freshnessState} (${details})`,
    });
  }

  if (!hasActiveRecords) {
    const degraded = sources.filter((source) => source.freshnessState !== 'healthy');
    if (degraded.length > 0) {
      violations.push({
        code: 'operational_sources_idle_gap',
        blocking: false,
        message: `idle workload with degraded operational sources: ${degraded.map((source) => `${source.key}:${source.freshnessState}`).join(', ')}`,
      });
    }
  }

  return violations;
}

function stripOperationalHealthSection(markdown) {
  return String(markdown || '').replace(/\n## Operational Source Health[\s\S]*$/u, '').trimEnd();
}

function renderOperationalHealthSection(health) {
  const lines = [
    '## Operational Source Health',
    '',
    '| Signal | Value |',
    '|---|---|',
    `| Workload state | ${health.overall.workloadState} |`,
    `| Freshness state | ${health.overall.freshnessState} |`,
    `| Actionability | ${health.overall.actionabilityState} |`,
    `| Healthy sources | ${health.overall.healthySources} |`,
    `| Stale sources | ${health.overall.staleSources} |`,
    `| Missing sources | ${health.overall.missingSources} |`,
    `| Unknown sources | ${health.overall.unknownSources} |`,
    '',
    '### Sources',
    '',
    '| Source | Loaded | Freshness | Age (min) | Max Age (min) | Timestamp | Required when active |',
    '|---|---|---|---:|---:|---|---|',
  ];

  for (const source of Object.values(health.sources)) {
    lines.push(`| ${source.label} | ${source.loaded ? 'yes' : 'no'} | ${source.freshnessState} | ${source.ageMinutes ?? 'n/a'} | ${source.maxAgeMinutes} | ${source.timestamp || 'n/a'} | ${source.requiredWhenActive ? 'yes' : 'no'} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const ts = new Date().toISOString();
  const nowMs = parseMs(ts);
  const cfg = {
    phase39Script: path.resolve(process.cwd(), 'scripts/phase39-observability-backend-operational-oncall.mjs'),
    backendStoreFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json')),
    backendReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json')),
    backendDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-backend.md')),
    backendAuditFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-audit.jsonl')),
    backendAnalyticsFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-analytics.json')),
    requireOperationalReport: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT', false),
    stateMaxAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_MAX_AGE_MIN', 30)),
    snapshotMaxAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_MAX_AGE_MIN', 30)),
    reportMaxAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_MAX_AGE_MIN', 60)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS', false),
  };

  const phase39Run = await runNode(cfg.phase39Script, process.env);
  if ((phase39Run.status ?? 1) !== 0) {
    if (phase39Run.stdout.trim()) process.stdout.write(phase39Run.stdout);
    if (phase39Run.stderr.trim()) process.stderr.write(phase39Run.stderr);
    throw new Error(`phase39 backend baseline failed with status=${phase39Run.status}`);
  }

  const [baseStore, baseReport, prevAnalytics, baseDashboard] = await Promise.all([
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.backendReportFile, null),
    readJson(cfg.backendAnalyticsFile, { entries: [] }),
    fs.readFile(cfg.backendDashboardFile, 'utf-8').catch(() => ''),
  ]);
  if (!baseStore || !baseReport) throw new Error('phase40 backend prerequisites missing after phase39 run');

  const baselineGeneratedAt = String(baseStore.generatedAt || '');
  const previousEntries = safeArray(prevAnalytics?.entries);
  const sanitizedPrevEntries = previousEntries.length > 0
    && String(previousEntries[previousEntries.length - 1]?.timestamp || '') === baselineGeneratedAt
    ? previousEntries.slice(0, -1)
    : previousEntries;

  const providerMeta = baseReport?.operationalProvider || baseReport?.inputs?.operationalProvider || baseStore?.operationalProvider || baseStore?.oncall?.operationalProvider || null;
  const operationalStateFile = String(baseReport?.config?.operationalStateFile || baseStore?.oncall?.operationalStateFile || '').trim();
  const snapshotFile = String(baseReport?.config?.snapshotFile || baseStore?.oncall?.snapshotFile || '').trim();
  const fullcycleReportFile = String(baseReport?.config?.fullcycleReportFile || baseStore?.oncall?.fullcycleReportFile || '').trim();
  const requireOperationalSource = Boolean(baseReport?.config?.requireOperationalSource);
  const requireSnapshot = Boolean(baseReport?.config?.requireSnapshot);
  const maxAnalyticsEntries = Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES', Number(baseReport?.config?.maxAnalyticsEntries || 400)));

  const shouldReadLegacyFiles = !providerMeta?.sources;
  const [operationalState, snapshot, fullcycleReport] = shouldReadLegacyFiles
    ? await Promise.all([
      readJson(operationalStateFile, null),
      readJson(snapshotFile, null),
      readJson(fullcycleReportFile, null),
    ])
    : [null, null, null];
  const providerSources = providerMeta?.sources || {};

  const incidents = safeArray(baseStore.incidents);
  const alerts = safeArray(baseStore.alerts);
  const openIncidents = incidents.filter((item) => normalizeStatus(item?.status, 'unknown') !== 'resolved');
  const activeAlerts = alerts.filter((item) => normalizeStatus(item?.status, 'unknown') !== 'resolved');
  const activeRecords = [...openIncidents, ...activeAlerts];
  const hasActiveRecords = activeRecords.length > 0;

  const sources = [
    buildSourceStatus({
      key: 'incidentAutomation',
      label: 'Incident automation state',
      file: String(providerSources?.incidentAutomation?.file || operationalStateFile).trim(),
      loaded: typeof providerSources?.incidentAutomation?.loaded === 'boolean' ? providerSources.incidentAutomation.loaded : undefined,
      timestamp: providerSources?.incidentAutomation?.timestamp || null,
      payload: operationalState,
      timestampKeys: ['updatedAt', 'generatedAt', 'timestamp'],
      maxAgeMinutes: cfg.stateMaxAgeMinutes,
      requiredWhenActive: requireOperationalSource,
      nowMs,
    }),
    buildSourceStatus({
      key: 'itsmSnapshot',
      label: 'ITSM snapshot',
      file: String(providerSources?.itsmSnapshot?.file || snapshotFile).trim(),
      loaded: typeof providerSources?.itsmSnapshot?.loaded === 'boolean' ? providerSources.itsmSnapshot.loaded : undefined,
      timestamp: providerSources?.itsmSnapshot?.timestamp || null,
      payload: snapshot,
      timestampKeys: ['generatedAt', 'updatedAt', 'timestamp'],
      maxAgeMinutes: cfg.snapshotMaxAgeMinutes,
      requiredWhenActive: requireSnapshot,
      nowMs,
    }),
    buildSourceStatus({
      key: 'fullcycleReport',
      label: 'Fullcycle report',
      file: String(providerSources?.fullcycleReport?.file || fullcycleReportFile).trim(),
      loaded: typeof providerSources?.fullcycleReport?.loaded === 'boolean' ? providerSources.fullcycleReport.loaded : undefined,
      timestamp: providerSources?.fullcycleReport?.timestamp || null,
      payload: fullcycleReport,
      timestampKeys: ['generatedAt', 'updatedAt', 'timestamp'],
      maxAgeMinutes: cfg.reportMaxAgeMinutes,
      requiredWhenActive: cfg.requireOperationalReport,
      nowMs,
    }),
  ];

  const health = summarizeOperationalSources(sources, activeRecords.length);
  const phase40ManagedCodes = new Set([
    'operational_state_missing',
    'operational_state_stale',
    'operational_state_timestamp_missing',
    'operational_snapshot_missing',
    'operational_snapshot_stale',
    'operational_snapshot_timestamp_missing',
    'operational_fullcycle_report_missing',
    'operational_fullcycle_report_stale',
    'operational_fullcycle_report_timestamp_missing',
    'operational_sources_idle_gap',
  ]);
  const baseViolations = safeArray(baseReport.violations).filter((item) => !phase40ManagedCodes.has(String(item?.code || '')));
  const freshnessViolations = buildSourceViolations(sources, hasActiveRecords);
  const violations = [...baseViolations, ...freshnessViolations];

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0 ? (cfg.enforceTargets ? 'fail' : 'warn') : String(baseReport.status || 'pass').toLowerCase();

  const summary = {
    ...baseStore.summary,
    operationalWorkloadState: health.overall.workloadState,
    operationalFreshnessState: health.overall.freshnessState,
    operationalActionabilityState: health.overall.actionabilityState,
    operationalHealthySources: health.overall.healthySources,
    operationalStaleSources: health.overall.staleSources,
    operationalMissingSources: health.overall.missingSources,
    operationalUnknownSources: health.overall.unknownSources,
  };

  const teams = safeArray(baseStore.teams);
  const currentAnalytics = {
    ...prevAnalytics.current,
    operationalSources: health,
    operationalProvider: providerMeta
      ? {
        mode: providerMeta.mode,
        contractLoaded: providerMeta.contractLoaded,
        contractVersion: providerMeta.contractVersion,
        contractSchema: providerMeta.contractSchema,
      }
      : null,
  };
  const analyticsEntry = {
    timestamp: ts,
    environment: String(prevAnalytics?.current?.environment || baseStore?.summary?.environment || 'unknown'),
    openIncidents: openIncidents.length,
    activeAlerts: activeAlerts.length,
    ownerCoveragePct: Number(prevAnalytics?.current?.ownerCoveragePct ?? summary.ownerCoveragePct ?? 0),
    unassignedOwners: Number(prevAnalytics?.current?.unassignedOwners ?? summary.unassignedOwners ?? 0),
    breachedEscalations: Number(prevAnalytics?.current?.breachedEscalations ?? summary.breachedEscalations ?? 0),
    teams: teams.map((item) => ({
      team: item.team,
      openIncidents: item.openIncidents,
      activeAlerts: item.activeAlerts,
      pendingEscalations: item.pendingEscalations,
      ownerCount: item.ownerCount,
    })),
    severity: prevAnalytics?.current?.severity || null,
    operationalSources: {
      workloadState: health.overall.workloadState,
      freshnessState: health.overall.freshnessState,
      actionabilityState: health.overall.actionabilityState,
      healthySources: health.overall.healthySources,
      staleSources: health.overall.staleSources,
      missingSources: health.overall.missingSources,
      unknownSources: health.overall.unknownSources,
    },
    operationalProvider: providerMeta
      ? {
        mode: providerMeta.mode,
        contractLoaded: providerMeta.contractLoaded,
        contractVersion: providerMeta.contractVersion,
      }
      : null,
  };
  const analytics = {
    ...prevAnalytics,
    generatedAt: ts,
    current: currentAnalytics,
    entries: [...sanitizedPrevEntries, analyticsEntry].slice(-maxAnalyticsEntries),
  };

  const store = {
    ...baseStore,
    version: 4,
    generatedAt: ts,
    status,
    summary,
    analytics: {
      ...(baseStore.analytics || {}),
      current: currentAnalytics,
      historyPoints: analytics.entries.length,
    },
    operationalProvider: providerMeta,
    operationalSources: health,
    oncall: {
      ...(baseStore.oncall || {}),
      freshnessTracked: true,
      workloadState: health.overall.workloadState,
      freshnessState: health.overall.freshnessState,
      actionabilityState: health.overall.actionabilityState,
      operationalProvider: providerMeta,
    },
  };

  const report = {
    ...baseReport,
    generatedAt: ts,
    status,
    summary: {
      ...(baseReport.summary || {}),
      ...summary,
    },
    analytics: {
      ...(baseReport.analytics || {}),
      current: currentAnalytics,
      totalEntries: analytics.entries.length,
      file: cfg.backendAnalyticsFile,
    },
    config: {
      ...(baseReport.config || {}),
      requireOperationalReport: cfg.requireOperationalReport,
      operationalStateMaxAgeMinutes: cfg.stateMaxAgeMinutes,
      operationalSnapshotMaxAgeMinutes: cfg.snapshotMaxAgeMinutes,
      operationalReportMaxAgeMinutes: cfg.reportMaxAgeMinutes,
      operationalContractFile: providerMeta?.contractFile || null,
      operationalProviderMode: providerMeta?.mode || null,
      sourceMode: 'operational_source_health',
    },
    inputs: {
      ...(baseReport.inputs || {}),
      operationalSources: {
        incidentAutomation: sources[0],
        itsmSnapshot: sources[1],
        fullcycleReport: sources[2],
      },
      operationalProvider: providerMeta,
    },
    operationalProvider: providerMeta,
    operationalSources: health,
    violations,
  };

  const dashboardBase = stripOperationalHealthSection(baseDashboard);
  const dashboard = `${dashboardBase}\n\n${renderOperationalHealthSection(health)}`;

  await writeJson(cfg.backendStoreFile, store);
  await writeJson(cfg.backendReportFile, report);
  await writeJson(cfg.backendAnalyticsFile, analytics);
  await writeText(cfg.backendDashboardFile, `${dashboard.trimEnd()}\n`);
  await appendLine(cfg.backendAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase40-observability-operational-source-health',
    status,
    summary,
    operationalSources: health,
    violations,
  }));

  console.log(`Observability backend store: ${cfg.backendStoreFile}`);
  console.log(`Observability backend report: ${cfg.backendReportFile}`);
  console.log(`Observability backend analytics: ${cfg.backendAnalyticsFile}`);
  console.log(`Observability backend dashboard: ${cfg.backendDashboardFile}`);
  console.log(`[OBS-BACKEND-OPS-HEALTH] status=${status} workload=${health.overall.workloadState} freshness=${health.overall.freshnessState} action=${health.overall.actionabilityState} coverage=${summary.ownerCoveragePct}% active=${activeRecords.length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[OBS-BACKEND-OPS-HEALTH] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase40 operational source health failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
