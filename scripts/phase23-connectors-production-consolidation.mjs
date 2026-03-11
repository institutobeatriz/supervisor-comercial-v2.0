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

function nowIso() {
  return new Date().toISOString();
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function sanitizeFileName(value) {
  return String(value || 'connector-incident')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeRuntimeConnectors(runtimeReport) {
  const connectors = Array.isArray(runtimeReport?.connectors) ? runtimeReport.connectors : [];
  return connectors
    .map((item) => ({
      key: String(item?.key || '').trim(),
      provider: String(item?.provider || '').trim() || 'unknown',
      channel: String(item?.channel || '').trim() || 'unknown',
      runsSeen: num(item?.runsSeen) ?? 0,
      successRatePct: num(item?.successRatePct),
      timeoutRatePct: num(item?.timeoutRatePct),
      httpErrorRatePct: num(item?.httpErrorRatePct),
      latencyWorstP95Ms: num(item?.latencyWorstP95Ms),
      contractErrors: num(item?.contractErrors) ?? 0,
    }))
    .filter((item) => item.key);
}

function buildEnvironmentSummary(history) {
  const envMap = new Map();
  for (const item of history) {
    const env = String(item?.environment || 'unknown').trim() || 'unknown';
    if (!envMap.has(env)) {
      envMap.set(env, {
        environment: env,
        runs: 0,
        lastSnapshotAt: null,
        runtimeStatus: 'unknown',
        readinessStatus: 'unknown',
        activeIncident: false,
        connectors: new Set(),
      });
    }
    const acc = envMap.get(env);
    acc.runs += 1;
    const candidateMs = parseMs(item?.timestamp);
    const currentMs = parseMs(acc.lastSnapshotAt);
    if (Number.isFinite(candidateMs) && (!Number.isFinite(currentMs) || candidateMs >= currentMs)) {
      acc.lastSnapshotAt = item?.timestamp || null;
      acc.runtimeStatus = String(item?.runtimeStatus || 'unknown');
      acc.readinessStatus = String(item?.readinessStatus || 'unknown');
      acc.activeIncident = Boolean(item?.activeIncidentId);
    }
    const connectors = Array.isArray(item?.connectors) ? item.connectors : [];
    for (const connector of connectors) {
      if (connector?.key) acc.connectors.add(String(connector.key));
    }
  }

  return [...envMap.values()]
    .map((item) => ({
      environment: item.environment,
      runs: item.runs,
      lastSnapshotAt: item.lastSnapshotAt,
      runtimeStatus: item.runtimeStatus,
      readinessStatus: item.readinessStatus,
      activeIncident: item.activeIncident,
      connectors: item.connectors.size,
    }))
    .sort((a, b) => a.environment.localeCompare(b.environment));
}

function connectorMapFromSnapshot(snapshot) {
  const connectors = Array.isArray(snapshot?.connectors) ? snapshot.connectors : [];
  const map = new Map();
  for (const connector of connectors) {
    const key = String(connector?.key || '').trim();
    if (key) map.set(key, connector);
  }
  return map;
}

function buildCurrentEnvironmentTrend(history, environment, trendWindowPoints) {
  const envHistory = history.filter((item) => item.environment === environment).slice(-Math.max(1, trendWindowPoints));
  if (envHistory.length === 0) return [];

  const first = connectorMapFromSnapshot(envHistory[0]);
  const last = connectorMapFromSnapshot(envHistory[envHistory.length - 1]);
  const keys = new Set([...first.keys(), ...last.keys()]);
  const rows = [];

  for (const key of keys) {
    const start = first.get(key) || null;
    const end = last.get(key) || null;
    const current = end || start || {};
    const successStart = num(start?.successRatePct);
    const successEnd = num(end?.successRatePct);
    const timeoutStart = num(start?.timeoutRatePct);
    const timeoutEnd = num(end?.timeoutRatePct);
    const httpStart = num(start?.httpErrorRatePct);
    const httpEnd = num(end?.httpErrorRatePct);
    const p95Start = num(start?.latencyWorstP95Ms);
    const p95End = num(end?.latencyWorstP95Ms);

    rows.push({
      key,
      provider: String(current.provider || 'unknown'),
      channel: String(current.channel || 'unknown'),
      successRatePct: num(current.successRatePct),
      timeoutRatePct: num(current.timeoutRatePct),
      httpErrorRatePct: num(current.httpErrorRatePct),
      latencyWorstP95Ms: num(current.latencyWorstP95Ms),
      contractErrors: num(current.contractErrors) ?? 0,
      deltaSuccessRatePct: Number.isFinite(successStart) && Number.isFinite(successEnd) ? round(successEnd - successStart, 2) : null,
      deltaTimeoutRatePct: Number.isFinite(timeoutStart) && Number.isFinite(timeoutEnd) ? round(timeoutEnd - timeoutStart, 2) : null,
      deltaHttpErrorRatePct: Number.isFinite(httpStart) && Number.isFinite(httpEnd) ? round(httpEnd - httpStart, 2) : null,
      deltaLatencyWorstP95Ms: Number.isFinite(p95Start) && Number.isFinite(p95End) ? round(p95End - p95Start, 2) : null,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

function buildConnectorPostmortemMarkdown(incident, sourceFile, environment) {
  const ts = nowIso();
  const id = String(incident?.id || 'connector-incident');
  const status = String(incident?.status || 'unknown');
  const severity = String(incident?.maxSeverity || incident?.severity || 'warning');
  const violations = Array.isArray(incident?.violations) ? incident.violations : [];

  const lines = [];
  lines.push(`# Connector Postmortem - ${id}`);
  lines.push('');
  lines.push('## Metadata');
  lines.push(`- generated_at: ${ts}`);
  lines.push(`- source_incidents_file: ${sourceFile}`);
  lines.push(`- environment: ${environment}`);
  lines.push(`- incident_id: ${id}`);
  lines.push(`- status: ${status}`);
  lines.push(`- severity: ${severity}`);
  lines.push(`- started_at: ${incident?.startedAt || 'n/a'}`);
  lines.push(`- detected_at: ${incident?.detectedAt || 'n/a'}`);
  lines.push(`- resolved_at: ${incident?.resolvedAt || 'n/a'}`);
  lines.push('');
  lines.push('## Trigger Summary');
  if (violations.length === 0) {
    lines.push('- none');
  } else {
    for (const item of violations) {
      lines.push(`- ${item?.connector || 'global'} ${item?.code || 'unknown'}: ${item?.message || 'n/a'}`);
    }
  }
  lines.push('');
  lines.push('## Impact');
  lines.push('- Customer impact: [fill]');
  lines.push('- Business impact: [fill]');
  lines.push('');
  lines.push('## Root Cause');
  lines.push('- Hypothesis: [fill]');
  lines.push('- Confirmed cause: [fill]');
  lines.push('');
  lines.push('## Corrective and Preventive Actions');
  lines.push('1. [fill]');
  lines.push('2. [fill]');
  lines.push('');
  lines.push('## Executive Signoff');
  lines.push('- [ ] Tech lead reviewed');
  lines.push('- [ ] Ops reviewed');
  lines.push('- [ ] Preventive action tracked');
  lines.push('');

  return lines.join('\n');
}

function toSnapshotConnectors(connectors) {
  return connectors.map((item) => ({
    key: item.key,
    provider: item.provider,
    channel: item.channel,
    runsSeen: item.runsSeen,
    successRatePct: item.successRatePct,
    timeoutRatePct: item.timeoutRatePct,
    httpErrorRatePct: item.httpErrorRatePct,
    latencyWorstP95Ms: item.latencyWorstP95Ms,
    contractErrors: item.contractErrors,
  }));
}

async function main() {
  const ts = nowIso();
  const environment = String(process.env.FULLCYCLE_CONNECTOR_ENVIRONMENT || process.env.NODE_ENV || 'development').trim().toLowerCase() || 'development';

  const cfg = {
    environment,
    runtimeReportFile: process.env.FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-runtime-report.json'),
    readinessReportFile: process.env.FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-readiness-report.json'),
    incidentsFile: process.env.FULLCYCLE_CONNECTOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-incidents.json'),
    timeseriesFile: process.env.FULLCYCLE_CONNECTOR_TIMESERIES_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-timeseries.json'),
    reportFile: process.env.FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-operations-report.json'),
    dashboardFile: process.env.FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-operations.md'),
    postmortemDir: process.env.FULLCYCLE_CONNECTOR_POSTMORTEM_DIR || path.resolve(process.cwd(), 'docs/postmortems/connectors'),
    auditFile: process.env.FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-executive-audit-trail.jsonl'),
    timeseriesMaxPoints: Math.max(10, envInt('FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS', 720)),
    trendWindowPoints: Math.max(2, envInt('FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS', 30)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS', false),
    requireRuntimePass: envBool('FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS', true),
    requireReadinessPass: envBool('FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS', true),
    requireNoActiveIncident: envBool('FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT', true),
    postmortemRequiredForResolved: envBool('FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED', true),
    postmortemMinCoveragePct: Math.max(0, Math.min(100, envFloat('FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT', 90))),
    postmortemAutoCreate: envBool('FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE', true),
    postmortemIncludeOpen: envBool('FULLCYCLE_CONNECTOR_POSTMORTEM_INCLUDE_OPEN', false),
  };

  const runtimeReport = await readJson(cfg.runtimeReportFile, { status: 'unknown', connectors: [] });
  const readinessReport = await readJson(cfg.readinessReportFile, { status: 'unknown', connectors: [] });
  const incidentsState = await readJson(cfg.incidentsFile, { activeIncidentId: null, incidents: [] });
  const timeseriesState = await readJson(cfg.timeseriesFile, { version: 1, history: [] });

  const runtimeStatus = String(runtimeReport?.status || 'unknown').toLowerCase();
  const readinessStatus = String(readinessReport?.status || 'unknown').toLowerCase();
  const activeIncidentId = String(incidentsState?.activeIncidentId || '').trim() || null;
  const runtimeConnectors = normalizeRuntimeConnectors(runtimeReport);

  const history = Array.isArray(timeseriesState?.history) ? timeseriesState.history : [];
  history.push({
    timestamp: ts,
    environment: cfg.environment,
    runtimeStatus,
    readinessStatus,
    activeIncidentId,
    connectors: toSnapshotConnectors(runtimeConnectors),
  });
  const trimmedHistory = history.slice(-cfg.timeseriesMaxPoints);

  await writeJson(cfg.timeseriesFile, {
    version: 1,
    generatedAt: ts,
    history: trimmedHistory,
  });

  const incidents = Array.isArray(incidentsState?.incidents) ? incidentsState.incidents : [];
  const postmortems = [];
  let generatedPostmortems = 0;

  for (const incident of incidents) {
    const incidentId = String(incident?.id || '').trim();
    if (!incidentId) continue;
    const status = String(incident?.status || 'unknown').toLowerCase();
    const filePath = path.resolve(cfg.postmortemDir, `${sanitizeFileName(incidentId)}.md`);
    let exists = await fileExists(filePath);
    let generated = false;

    const canGenerate = cfg.postmortemAutoCreate && (status === 'resolved' || cfg.postmortemIncludeOpen);
    if (!exists && canGenerate) {
      const markdown = buildConnectorPostmortemMarkdown(incident, cfg.incidentsFile, cfg.environment);
      await writeText(filePath, markdown);
      exists = true;
      generated = true;
      generatedPostmortems += 1;
    }

    postmortems.push({
      incidentId,
      status,
      maxSeverity: String(incident?.maxSeverity || incident?.severity || 'warning'),
      filePath: exists ? filePath : null,
      exists,
      generated,
      startedAt: incident?.startedAt || null,
      detectedAt: incident?.detectedAt || null,
      resolvedAt: incident?.resolvedAt || null,
    });
  }

  const resolvedIncidents = postmortems.filter((item) => item.status === 'resolved');
  const resolvedWithPostmortem = resolvedIncidents.filter((item) => item.exists);
  const postmortemCoveragePct = resolvedIncidents.length > 0
    ? pct(resolvedWithPostmortem.length, resolvedIncidents.length)
    : 100;

  const environmentSummary = buildEnvironmentSummary(trimmedHistory);
  const trendRows = buildCurrentEnvironmentTrend(trimmedHistory, cfg.environment, cfg.trendWindowPoints);

  const violations = [];
  if (cfg.requireRuntimePass && runtimeStatus !== 'pass') {
    violations.push({
      code: 'runtime_not_pass',
      blocking: true,
      message: `runtime status is ${runtimeStatus}, expected pass`,
    });
  }
  if (cfg.requireReadinessPass && readinessStatus !== 'pass') {
    violations.push({
      code: 'readiness_not_pass',
      blocking: true,
      message: `readiness status is ${readinessStatus}, expected pass`,
    });
  }
  if (cfg.requireNoActiveIncident && activeIncidentId) {
    violations.push({
      code: 'active_connector_incident',
      blocking: true,
      message: `active incident present: ${activeIncidentId}`,
    });
  }
  if (cfg.postmortemRequiredForResolved && postmortemCoveragePct < cfg.postmortemMinCoveragePct) {
    violations.push({
      code: 'postmortem_coverage_below_target',
      blocking: true,
      message: `postmortem coverage ${postmortemCoveragePct}% < ${cfg.postmortemMinCoveragePct}%`,
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
      environment: cfg.environment,
      runtimeStatus,
      readinessStatus,
      activeIncidentId,
      timeseriesPoints: trimmedHistory.length,
      environmentsTracked: environmentSummary.length,
      connectorsInRuntime: runtimeConnectors.length,
      connectorIncidentsTotal: postmortems.length,
      connectorIncidentsOpen: postmortems.filter((item) => item.status === 'open').length,
      connectorIncidentsResolved: resolvedIncidents.length,
      postmortemCoveragePct,
      generatedPostmortems,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
    },
    config: {
      runtimeReportFile: cfg.runtimeReportFile,
      readinessReportFile: cfg.readinessReportFile,
      incidentsFile: cfg.incidentsFile,
      timeseriesFile: cfg.timeseriesFile,
      reportFile: cfg.reportFile,
      dashboardFile: cfg.dashboardFile,
      postmortemDir: cfg.postmortemDir,
      auditFile: cfg.auditFile,
      timeseriesMaxPoints: cfg.timeseriesMaxPoints,
      trendWindowPoints: cfg.trendWindowPoints,
      enforceTargets: cfg.enforceTargets,
      requireRuntimePass: cfg.requireRuntimePass,
      requireReadinessPass: cfg.requireReadinessPass,
      requireNoActiveIncident: cfg.requireNoActiveIncident,
      postmortemRequiredForResolved: cfg.postmortemRequiredForResolved,
      postmortemMinCoveragePct: cfg.postmortemMinCoveragePct,
      postmortemAutoCreate: cfg.postmortemAutoCreate,
      postmortemIncludeOpen: cfg.postmortemIncludeOpen,
    },
    environmentSummary,
    trendRows,
    postmortems,
    violations,
  };

  await writeJson(cfg.reportFile, report);

  const auditEntry = {
    timestamp: ts,
    source: 'phase23-connectors-production-consolidation',
    environment: cfg.environment,
    status,
    runtimeStatus,
    readinessStatus,
    activeIncidentId,
    postmortemCoveragePct,
    generatedPostmortems,
    violations,
    reportFile: cfg.reportFile,
  };
  await appendLine(cfg.auditFile, JSON.stringify(auditEntry));

  const md = [];
  md.push('# Fullcycle Connectors Operations');
  md.push('');
  md.push(`- Generated at: ${ts}`);
  md.push(`- Environment: ${cfg.environment}`);
  md.push(`- Status: ${status.toUpperCase()}`);
  md.push(`- Runtime status: ${runtimeStatus}`);
  md.push(`- Readiness status: ${readinessStatus}`);
  md.push(`- Active connector incident: ${activeIncidentId || 'none'}`);
  md.push(`- Postmortem coverage (resolved): ${postmortemCoveragePct}%`);
  md.push(`- Generated postmortems in run: ${generatedPostmortems}`);
  md.push('');

  md.push('## Environment Segmentation');
  md.push('');
  md.push('| Environment | Runs | Last snapshot | Runtime | Readiness | Active incident | Connectors |');
  md.push('|---|---|---|---|---|---|---|');
  if (environmentSummary.length === 0) {
    md.push('| - | 0 | n/a | n/a | n/a | no | 0 |');
  } else {
    for (const item of environmentSummary) {
      md.push(`| ${item.environment} | ${item.runs} | ${item.lastSnapshotAt || 'n/a'} | ${item.runtimeStatus} | ${item.readinessStatus} | ${item.activeIncident ? 'yes' : 'no'} | ${item.connectors} |`);
    }
  }
  md.push('');

  md.push(`## Current Environment Trend (${cfg.environment})`);
  md.push('');
  md.push('| Connector | Success | Timeout | HTTP error | Worst p95 (ms) | Contract errors | Delta success | Delta timeout | Delta http | Delta p95 |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  if (trendRows.length === 0) {
    md.push('| - | n/a | n/a | n/a | n/a | 0 | n/a | n/a | n/a | n/a |');
  } else {
    for (const item of trendRows) {
      md.push(`| ${item.key} | ${item.successRatePct ?? 'n/a'}% | ${item.timeoutRatePct ?? 'n/a'}% | ${item.httpErrorRatePct ?? 'n/a'}% | ${item.latencyWorstP95Ms ?? 'n/a'} | ${item.contractErrors} | ${item.deltaSuccessRatePct ?? 'n/a'} | ${item.deltaTimeoutRatePct ?? 'n/a'} | ${item.deltaHttpErrorRatePct ?? 'n/a'} | ${item.deltaLatencyWorstP95Ms ?? 'n/a'} |`);
    }
  }
  md.push('');

  md.push('## Connector Incident Postmortems');
  md.push('');
  md.push('| Incident | Status | Severity | Postmortem | Generated now |');
  md.push('|---|---|---|---|---|');
  if (postmortems.length === 0) {
    md.push('| - | - | - | - | - |');
  } else {
    for (const item of postmortems) {
      md.push(`| ${item.incidentId} | ${item.status} | ${item.maxSeverity} | ${item.exists ? 'yes' : 'no'} | ${item.generated ? 'yes' : 'no'} |`);
    }
  }
  md.push('');

  md.push('## Violations');
  md.push('');
  if (violations.length === 0) {
    md.push('- none');
  } else {
    for (const item of violations) {
      md.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
    }
  }
  md.push('');

  await writeText(cfg.dashboardFile, md.join('\n'));

  console.log(`Connector operations report: ${cfg.reportFile}`);
  console.log(`Connector operations dashboard: ${cfg.dashboardFile}`);
  console.log(`Connector operations timeseries: ${cfg.timeseriesFile}`);
  console.log(`Connector executive audit trail: ${cfg.auditFile}`);
  console.log(`[CONNECTOR-OPS] status=${status} env=${cfg.environment} violations=${violations.length} postmortemCoverage=${postmortemCoveragePct}%`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[CONNECTOR-OPS] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase23 connector operations failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
