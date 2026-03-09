import fs from 'node:fs/promises';
import path from 'node:path';
import { escapeHtmlJson, publishHtmlAssets } from './observability-html-assets.mjs';

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

function nowIso() {
  return new Date().toISOString();
}

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return round((part / total) * 100, 2);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeFileName(value) {
  return String(value || 'incident')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolvePostmortemPath(dir, incidentId) {
  return path.resolve(dir, `${sanitizeFileName(incidentId)}.md`);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getLatestSnapshotsByEnvironment(history) {
  const envMap = new Map();
  for (const item of history) {
    const env = String(item?.environment || 'unknown').trim() || 'unknown';
    const currentTs = parseMs(item?.timestamp);
    if (!envMap.has(env)) {
      envMap.set(env, item);
      continue;
    }
    const existing = envMap.get(env);
    const existingTs = parseMs(existing?.timestamp);
    if (Number.isFinite(currentTs) && (!Number.isFinite(existingTs) || currentTs >= existingTs)) {
      envMap.set(env, item);
    }
  }
  return envMap;
}

function normalizeConnector(itemRaw) {
  const item = itemRaw && typeof itemRaw === 'object' ? itemRaw : {};
  const key = String(item.key || '').trim();
  if (!key) return null;
  return {
    key,
    provider: String(item.provider || 'unknown').trim() || 'unknown',
    channel: String(item.channel || 'unknown').trim() || 'unknown',
    successRatePct: num(item.successRatePct),
    timeoutRatePct: num(item.timeoutRatePct),
    httpErrorRatePct: num(item.httpErrorRatePct),
    latencyWorstP95Ms: num(item.latencyWorstP95Ms),
    contractErrors: num(item.contractErrors) ?? 0,
  };
}

function buildEnvironmentOverview(history) {
  const latestByEnv = getLatestSnapshotsByEnvironment(history);
  const rows = [];
  for (const [environment, snapshot] of latestByEnv.entries()) {
    const connectors = safeArray(snapshot?.connectors)
      .map(normalizeConnector)
      .filter(Boolean);
    rows.push({
      environment,
      timestamp: snapshot?.timestamp || null,
      runtimeStatus: String(snapshot?.runtimeStatus || 'unknown').toLowerCase(),
      readinessStatus: String(snapshot?.readinessStatus || 'unknown').toLowerCase(),
      activeIncidentId: String(snapshot?.activeIncidentId || '').trim() || null,
      connectorsCount: connectors.length,
    });
  }
  rows.sort((a, b) => a.environment.localeCompare(b.environment));
  return rows;
}

function buildConnectorMatrix(history) {
  const latestByEnv = getLatestSnapshotsByEnvironment(history);
  const matrix = new Map();

  for (const [environment, snapshot] of latestByEnv.entries()) {
    const connectors = safeArray(snapshot?.connectors)
      .map(normalizeConnector)
      .filter(Boolean);

    for (const connector of connectors) {
      if (!matrix.has(connector.key)) {
        matrix.set(connector.key, {
          key: connector.key,
          provider: connector.provider,
          channel: connector.channel,
          byEnvironment: {},
        });
      }
      const row = matrix.get(connector.key);
      row.provider = connector.provider || row.provider;
      row.channel = connector.channel || row.channel;
      row.byEnvironment[environment] = {
        successRatePct: connector.successRatePct,
        timeoutRatePct: connector.timeoutRatePct,
        httpErrorRatePct: connector.httpErrorRatePct,
        latencyWorstP95Ms: connector.latencyWorstP95Ms,
        contractErrors: connector.contractErrors,
      };
    }
  }

  return [...matrix.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function buildConnectorTrendByEnvironment(history, trendWindowPoints) {
  const envs = new Set(history.map((item) => String(item?.environment || 'unknown').trim() || 'unknown'));
  const results = {};

  for (const env of envs) {
    const envHistory = history
      .filter((item) => String(item?.environment || '').trim() === env)
      .slice(-Math.max(1, trendWindowPoints));

    if (envHistory.length === 0) {
      results[env] = [];
      continue;
    }

    const startMap = new Map(
      safeArray(envHistory[0]?.connectors)
        .map(normalizeConnector)
        .filter(Boolean)
        .map((item) => [item.key, item]),
    );
    const endMap = new Map(
      safeArray(envHistory[envHistory.length - 1]?.connectors)
        .map(normalizeConnector)
        .filter(Boolean)
        .map((item) => [item.key, item]),
    );

    const keys = new Set([...startMap.keys(), ...endMap.keys()]);
    const rows = [];
    for (const key of keys) {
      const start = startMap.get(key) || null;
      const end = endMap.get(key) || null;
      const current = end || start || {};
      rows.push({
        key,
        provider: current.provider || 'unknown',
        channel: current.channel || 'unknown',
        successRatePct: num(current.successRatePct),
        timeoutRatePct: num(current.timeoutRatePct),
        httpErrorRatePct: num(current.httpErrorRatePct),
        latencyWorstP95Ms: num(current.latencyWorstP95Ms),
        contractErrors: num(current.contractErrors) ?? 0,
        deltaSuccessRatePct: Number.isFinite(num(start?.successRatePct)) && Number.isFinite(num(end?.successRatePct))
          ? round(num(end.successRatePct) - num(start.successRatePct), 2)
          : null,
        deltaTimeoutRatePct: Number.isFinite(num(start?.timeoutRatePct)) && Number.isFinite(num(end?.timeoutRatePct))
          ? round(num(end.timeoutRatePct) - num(start.timeoutRatePct), 2)
          : null,
        deltaHttpErrorRatePct: Number.isFinite(num(start?.httpErrorRatePct)) && Number.isFinite(num(end?.httpErrorRatePct))
          ? round(num(end.httpErrorRatePct) - num(start.httpErrorRatePct), 2)
          : null,
        deltaLatencyWorstP95Ms: Number.isFinite(num(start?.latencyWorstP95Ms)) && Number.isFinite(num(end?.latencyWorstP95Ms))
          ? round(num(end.latencyWorstP95Ms) - num(start.latencyWorstP95Ms), 2)
          : null,
      });
    }
    rows.sort((a, b) => a.key.localeCompare(b.key));
    results[env] = rows;
  }

  return results;
}

async function buildIncidentCorrelations({ incidents, postmortemDir, postmortemSlaHours, nowMs }) {
  const correlations = [];
  for (const incident of incidents) {
    const incidentId = String(incident?.id || '').trim();
    if (!incidentId) continue;

    const status = String(incident?.status || 'unknown').toLowerCase();
    const severity = String(incident?.maxSeverity || incident?.severity || 'warning').toLowerCase();
    const postmortemPath = resolvePostmortemPath(postmortemDir, incidentId);
    const postmortemExists = await fileExists(postmortemPath);

    const resolvedAtMs = parseMs(incident?.resolvedAt);
    const detectedAtMs = parseMs(incident?.detectedAt);
    const startedAtMs = parseMs(incident?.startedAt);
    const baselineMs = Number.isFinite(resolvedAtMs)
      ? resolvedAtMs
      : (Number.isFinite(detectedAtMs) ? detectedAtMs : startedAtMs);
    const ageHours = Number.isFinite(baselineMs) ? round((nowMs - baselineMs) / 3_600_000, 2) : null;
    const slaBreached = status === 'resolved'
      && !postmortemExists
      && Number.isFinite(ageHours)
      && ageHours > postmortemSlaHours;

    correlations.push({
      incidentId,
      status,
      severity,
      startedAt: incident?.startedAt || null,
      detectedAt: incident?.detectedAt || null,
      resolvedAt: incident?.resolvedAt || null,
      postmortemPath: postmortemExists ? postmortemPath : null,
      postmortemExists,
      postmortemLinkRequired: status === 'resolved',
      ageHours,
      postmortemSlaHours,
      postmortemSlaBreached: slaBreached,
    });
  }
  correlations.sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  return correlations;
}

function countOpenCriticalIncidents(correlations) {
  return correlations.filter((item) => item.status === 'open' && item.severity === 'critical').length;
}

function buildSummary({
  environmentOverview,
  connectorMatrix,
  correlations,
  operationsStatus,
  historyPoints,
  historyEnvironments,
}) {
  const resolved = correlations.filter((item) => item.status === 'resolved');
  const linked = resolved.filter((item) => item.postmortemExists);
  const unresolvedLink = resolved.filter((item) => !item.postmortemExists);
  const linkCoveragePct = resolved.length > 0 ? pct(linked.length, resolved.length) : 100;
  return {
    operationsStatus,
    historyPoints,
    environmentsTracked: historyEnvironments,
    environmentsLatest: environmentOverview.length,
    connectorsTracked: connectorMatrix.length,
    incidentsTotal: correlations.length,
    incidentsResolved: resolved.length,
    incidentsResolvedWithPostmortem: linked.length,
    incidentsResolvedWithoutPostmortem: unresolvedLink.length,
    postmortemLinkCoveragePct: linkCoveragePct,
    openCriticalIncidents: countOpenCriticalIncidents(correlations),
    postmortemSlaBreaches: correlations.filter((item) => item.postmortemSlaBreached).length,
  };
}

function renderHtmlDashboard({ generatedAt, summary, environmentOverview, connectorMatrix, trendByEnvironment, correlations, status, violations }) {
  const data = {
    generatedAt,
    summary,
    environmentOverview,
    connectorMatrix,
    trendByEnvironment,
    correlations,
    status,
    violations,
  };
  const safeData = escapeHtmlJson(data);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connector Observability Console</title>
  <link rel="stylesheet" href="./assets/fullcycle-connectors-observability.css" />
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Connector Observability Console</h1>
      <div class="meta">Generated at <strong>${generatedAt}</strong> | Status <strong class="status-${status}">${String(status).toUpperCase()}</strong></div>
    </section>

    <section class="cards">
      <article class="card"><div class="label">Environments</div><div class="value">${summary.environmentsLatest}</div></article>
      <article class="card"><div class="label">Connectors</div><div class="value">${summary.connectorsTracked}</div></article>
      <article class="card"><div class="label">Resolved Incidents</div><div class="value">${summary.incidentsResolved}</div></article>
      <article class="card"><div class="label">Postmortem Link Coverage</div><div class="value">${summary.postmortemLinkCoveragePct ?? 'n/a'}%</div></article>
      <article class="card"><div class="label">Open Critical</div><div class="value">${summary.openCriticalIncidents}</div></article>
      <article class="card"><div class="label">SLA Breaches</div><div class="value">${summary.postmortemSlaBreaches}</div></article>
    </section>

    <section class="section">
      <h2>Environment Overview</h2>
      <table id="env-table"></table>
    </section>

    <section class="section">
      <h2>Connector Matrix</h2>
      <div class="toolbar">
        <label for="env-filter">Environment:</label>
        <select id="env-filter"></select>
      </div>
      <table id="connector-table"></table>
    </section>

    <section class="section">
      <h2>Incident to Postmortem Correlation</h2>
      <table id="corr-table"></table>
    </section>

    <section class="section">
      <h2>Violations</h2>
      <ul id="violations" class="vlist"></ul>
    </section>
  </div>

  <template id="connector-observability-data">${safeData}</template>
  <script src="./assets/fullcycle-connectors-observability.js"></script>
</body>
</html>`;
}

async function main() {
  const ts = nowIso();
  const nowMs = parseMs(ts);

  const cfg = {
    timeseriesFile: process.env.FULLCYCLE_CONNECTOR_TIMESERIES_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-timeseries.json'),
    operationsReportFile: process.env.FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-operations-report.json'),
    incidentsFile: process.env.FULLCYCLE_CONNECTOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-incidents.json'),
    postmortemDir: process.env.FULLCYCLE_CONNECTOR_POSTMORTEM_DIR || path.resolve(process.cwd(), 'docs/postmortems/connectors'),
    observabilityStoreFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-store.json'),
    observabilityReportFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-report.json'),
    observabilityFeedFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.json'),
    observabilityDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.html'),
    observabilityAuditFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-audit.jsonl'),
    observabilityHistoryMaxEntries: Math.max(20, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_HISTORY_MAX_ENTRIES', 720)),
    trendWindowPoints: Math.max(2, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_TREND_WINDOW_POINTS', 60)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBSERVABILITY_ENFORCE_TARGETS', false),
    requireOperationsPass: envBool('FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_OPERATIONS_PASS', true),
    requireMultiEnvironment: envBool('FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_MULTI_ENV', true),
    minEnvironments: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_MIN_ENVIRONMENTS', 3)),
    requirePostmortemLink: envBool('FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_POSTMORTEM_LINK', true),
    postmortemSlaHours: Math.max(1, envFloat('FULLCYCLE_CONNECTOR_OBSERVABILITY_POSTMORTEM_SLA_HOURS', 24)),
    maxOpenCriticalIncidents: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_MAX_OPEN_CRITICAL_INCIDENTS', 0)),
  };

  const timeseriesState = await readJson(cfg.timeseriesFile, { history: [] });
  const operationsReport = await readJson(cfg.operationsReportFile, { status: 'unknown' });
  const incidentsState = await readJson(cfg.incidentsFile, { incidents: [] });
  const observabilityStore = await readJson(cfg.observabilityStoreFile, { version: 1, history: [] });

  const history = safeArray(timeseriesState?.history);
  const incidents = safeArray(incidentsState?.incidents);

  const environmentOverview = buildEnvironmentOverview(history);
  const connectorMatrix = buildConnectorMatrix(history);
  const trendByEnvironment = buildConnectorTrendByEnvironment(history, cfg.trendWindowPoints);
  const correlations = await buildIncidentCorrelations({
    incidents,
    postmortemDir: cfg.postmortemDir,
    postmortemSlaHours: cfg.postmortemSlaHours,
    nowMs,
  });

  const operationsStatus = String(operationsReport?.status || 'unknown').toLowerCase();
  const summary = buildSummary({
    environmentOverview,
    connectorMatrix,
    correlations,
    operationsStatus,
    historyPoints: history.length,
    historyEnvironments: new Set(history.map((item) => String(item?.environment || 'unknown').trim() || 'unknown')).size,
  });

  const violations = [];
  if (history.length === 0) {
    violations.push({
      code: 'timeseries_missing',
      blocking: true,
      message: `timeseries history is empty (${cfg.timeseriesFile})`,
    });
  }
  if (cfg.requireOperationsPass && operationsStatus !== 'pass') {
    violations.push({
      code: 'operations_report_not_pass',
      blocking: true,
      message: `operations status is ${operationsStatus}, expected pass`,
    });
  }
  if (cfg.requireMultiEnvironment && summary.environmentsTracked < cfg.minEnvironments) {
    violations.push({
      code: 'multi_environment_insufficient',
      blocking: true,
      message: `tracked environments ${summary.environmentsTracked} < ${cfg.minEnvironments}`,
    });
  }
  if (cfg.requirePostmortemLink && summary.postmortemSlaBreaches > 0) {
    violations.push({
      code: 'postmortem_link_sla_breach',
      blocking: true,
      message: `${summary.postmortemSlaBreaches} resolved incidents without postmortem link after ${cfg.postmortemSlaHours}h`,
    });
  }
  if (summary.openCriticalIncidents > cfg.maxOpenCriticalIncidents) {
    violations.push({
      code: 'open_critical_incidents_above_limit',
      blocking: true,
      message: `open critical incidents ${summary.openCriticalIncidents} > ${cfg.maxOpenCriticalIncidents}`,
    });
  }

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const report = {
    generatedAt: ts,
    status,
    summary: {
      ...summary,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
    },
    config: cfg,
    environmentOverview,
    connectorMatrix,
    trendByEnvironment,
    correlations,
    violations,
  };

  const feed = {
    generatedAt: ts,
    status,
    summary: report.summary,
    environmentOverview,
    connectorMatrix,
    trendByEnvironment,
    correlations,
    violations,
  };

  const storeHistory = safeArray(observabilityStore?.history);
  storeHistory.push({
    timestamp: ts,
    status,
    summary: report.summary,
  });
  const trimmedStoreHistory = storeHistory.slice(-cfg.observabilityHistoryMaxEntries);

  const store = {
    version: 1,
    generatedAt: ts,
    lastStatus: status,
    history: trimmedStoreHistory,
  };

  await writeJson(cfg.observabilityStoreFile, store);
  await writeJson(cfg.observabilityReportFile, report);
  await writeJson(cfg.observabilityFeedFile, feed);
  await writeText(
    cfg.observabilityDashboardFile,
    renderHtmlDashboard({
      generatedAt: ts,
      summary: report.summary,
      environmentOverview,
      connectorMatrix,
      trendByEnvironment,
      correlations,
      status,
      violations,
    }),
  );
  await publishHtmlAssets({
    htmlFile: cfg.observabilityDashboardFile,
    assets: [
      {
        sourceFile: 'scripts/assets/fullcycle-connectors-observability.css',
        fileName: 'fullcycle-connectors-observability.css',
      },
      {
        sourceFile: 'scripts/assets/fullcycle-connectors-observability.js',
        fileName: 'fullcycle-connectors-observability.js',
      },
    ],
  });

  const auditEntry = {
    timestamp: ts,
    source: 'phase24-observability-layer',
    status,
    summary: report.summary,
    violations,
    reportFile: cfg.observabilityReportFile,
    feedFile: cfg.observabilityFeedFile,
    dashboardFile: cfg.observabilityDashboardFile,
  };
  await appendLine(cfg.observabilityAuditFile, JSON.stringify(auditEntry));

  console.log(`Connector observability report: ${cfg.observabilityReportFile}`);
  console.log(`Connector observability feed: ${cfg.observabilityFeedFile}`);
  console.log(`Connector observability dashboard: ${cfg.observabilityDashboardFile}`);
  console.log(`Connector observability store: ${cfg.observabilityStoreFile}`);
  console.log(`Connector observability audit: ${cfg.observabilityAuditFile}`);
  console.log(`[CONNECTOR-OBS] status=${status} envs=${summary.environmentsTracked} connectors=${summary.connectorsTracked} violations=${violations.length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[CONNECTOR-OBS] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase24 observability layer failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});

