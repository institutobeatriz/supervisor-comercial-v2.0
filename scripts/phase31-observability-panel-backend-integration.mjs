import fs from 'node:fs/promises';
import path from 'node:path';
import { publishHtmlAssets } from './observability-html-assets.mjs';

const envBool = (k, d) => {
  const v = process.env[k];
  return v ? ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()) : d;
};
const envInt = (k, d) => {
  const v = parseInt(process.env[k] || '', 10);
  return Number.isFinite(v) ? v : d;
};
const parseMs = (v) => {
  const n = Date.parse(String(v || ''));
  return Number.isFinite(n) ? n : NaN;
};
const ageMin = (v, nowMs) => {
  const ts = parseMs(v);
  return Number.isFinite(ts) ? Math.round(((nowMs - ts) / 60000) * 100) / 100 : null;
};
const sev = (v) => {
  const s = String(v || '').toLowerCase();
  if (['critical', 'error', 'fail', 'fatal'].includes(s)) return 'critical';
  if (['warning', 'warn', 'degraded'].includes(s)) return 'warning';
  return 'info';
};
const existsNum = (v) => Number.isFinite(Number(v));

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

async function appendJsonl(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

async function renderHtml(data) {
  const safe = JSON.stringify(data).replace(/</g, '\\u003c');
  const templatePath = path.resolve(process.cwd(), 'scripts/phase31-observability-panel-backend-template.html');
  const template = await fs.readFile(templatePath, 'utf-8');
  return template.replace('__PHASE31_PANEL_DATA__', safe);
}

async function main() {
  const ts = new Date().toISOString();
  const nowMs = Date.now();
  const cfg = {
    streamStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-state.json'),
    streamReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    alertReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-report.json'),
    apiSlaHistoryFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-sla-history.json'),
    backendStoreFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json'),
    backendReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json'),
    panelReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-panel-report.json'),
    panelDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-ops-panel.html'),
    panelAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-panel-audit.jsonl'),
    apiBaseDefault: (process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE || process.env.FULLCYCLE_CONNECTOR_OBS_API_BASE || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    defaultEnv: String(process.env.FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT || process.env.FULLCYCLE_CONNECTOR_ENVIRONMENT || 'unknown').toLowerCase(),
    autoConnect: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_AUTO_CONNECT', true),
    refreshMs: Math.max(5000, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_REFRESH_MS', 30000)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS', false),
    requireStreamPass: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS', true),
    requireAlertingPass: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS', true),
    requireApiSlaHistory: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY', true),
    requireBackendStore: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE', true),
    requireBackendPass: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS', true),
    requireTeamRouting: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING', true),
    minSlaPoints: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS', 5)),
    minTeams: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS', 1)),
    maxStreamAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN', 240)),
    maxSlaAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN', 240)),
  };

  const [streamState, streamReport, alertReport, slaPayload, backendStore, backendReport] = await Promise.all([
    readJson(cfg.streamStateFile, null),
    readJson(cfg.streamReportFile, null),
    readJson(cfg.alertReportFile, null),
    readJson(cfg.apiSlaHistoryFile, null),
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.backendReportFile, null),
  ]);

  const slaHistory = (Array.isArray(slaPayload?.history) ? slaPayload.history : []).map((x) => ({
    timestamp: x?.timestamp || x?.generatedAt || null,
    environment: String(x?.environment || cfg.defaultEnv || 'unknown').toLowerCase(),
    status: String(x?.status || 'unknown').toLowerCase(),
    availabilityPct: existsNum(x?.availabilityPct) ? Number(x.availabilityPct) : null,
    worstLatencyMs: existsNum(x?.worstLatencyMs) ? Number(x.worstLatencyMs) : null,
    observedPayloadAgeMinutes: existsNum(x?.observedPayloadAgeMinutes) ? Number(x.observedPayloadAgeMinutes) : null,
    blockingViolations: existsNum(x?.blockingViolations) ? Number(x.blockingViolations) : null,
  }));
  const teams = Array.isArray(backendStore?.teams) ? backendStore.teams : [];
  const incidents = Array.isArray(backendStore?.incidents) ? backendStore.incidents : [];
  const alerts = Array.isArray(backendStore?.alerts) ? backendStore.alerts : [];
  const openIncidents = incidents.filter((x) => String(x?.status || '').toLowerCase() !== 'resolved');
  const activeAlerts = alerts.filter((x) => String(x?.status || '').toLowerCase() !== 'resolved');
  const streamStatus = String(streamReport?.status || streamState?.status || 'unknown').toLowerCase();
  const backendStatus = String(backendReport?.status || backendStore?.status || 'unknown').toLowerCase();
  const alertStatus = String(alertReport?.status || 'unknown').toLowerCase();
  const streamAgeMinutes = ageMin(streamReport?.generatedAt || streamState?.generatedAt, nowMs);
  const slaAgeMinutes = ageMin(slaHistory[slaHistory.length - 1]?.timestamp, nowMs);
  const operationalSources = backendReport?.operationalSources || backendStore?.operationalSources || null;
  const operationalProvider = backendReport?.operationalProvider || backendStore?.operationalProvider || backendStore?.oncall?.operationalProvider || null;
  const unassignedRecords = [
    ...openIncidents.filter((x) => !String(x?.ownerTeam || x?.routing?.team || '').trim() || String(x?.ownerTeam || x?.routing?.team || '').toLowerCase() === 'unassigned').map((x) => `incident:${x?.id || 'unknown'}`),
    ...activeAlerts.filter((x) => !String(x?.ownerTeam || x?.routing?.team || '').trim() || String(x?.ownerTeam || x?.routing?.team || '').toLowerCase() === 'unassigned').map((x) => `alert:${x?.key || 'unknown'}`),
  ];

  const violations = [];
  if (cfg.requireBackendStore && !backendStore) violations.push({ code: 'backend_store_missing', blocking: true, message: `missing ${cfg.backendStoreFile}` });
  if (!backendReport) violations.push({ code: 'backend_report_missing', blocking: true, message: `missing ${cfg.backendReportFile}` });
  if (cfg.requireBackendPass && backendStatus !== 'pass') violations.push({ code: 'backend_not_pass', blocking: true, message: `backend status=${backendStatus}` });
  if (cfg.requireStreamPass && streamStatus !== 'pass') violations.push({ code: 'stream_not_pass', blocking: true, message: `stream status=${streamStatus}` });
  if (cfg.requireAlertingPass && alertStatus !== 'pass') violations.push({ code: 'alerting_not_pass', blocking: true, message: `alerting status=${alertStatus}` });
  if (cfg.requireApiSlaHistory && !slaPayload) violations.push({ code: 'api_sla_missing', blocking: true, message: `missing ${cfg.apiSlaHistoryFile}` });
  if (slaHistory.length < cfg.minSlaPoints) violations.push({ code: 'api_sla_insufficient_points', blocking: true, message: `sla points=${slaHistory.length} expected>=${cfg.minSlaPoints}` });
  if (teams.length < cfg.minTeams) violations.push({ code: 'backend_teams_insufficient', blocking: true, message: `teams=${teams.length} expected>=${cfg.minTeams}` });
  if (cfg.requireTeamRouting && unassignedRecords.length > 0) violations.push({ code: 'team_routing_missing', blocking: true, message: `unassigned records: ${unassignedRecords.join(', ')}` });
  if (Number.isFinite(streamAgeMinutes) && streamAgeMinutes > cfg.maxStreamAgeMinutes) violations.push({ code: 'stream_stale', blocking: true, message: `stream age=${streamAgeMinutes}min max=${cfg.maxStreamAgeMinutes}` });
  if (Number.isFinite(slaAgeMinutes) && slaAgeMinutes > cfg.maxSlaAgeMinutes) violations.push({ code: 'api_sla_stale', blocking: true, message: `sla age=${slaAgeMinutes}min max=${cfg.maxSlaAgeMinutes}` });

  const blocking = violations.filter((x) => x.blocking);
  const status = blocking.length > 0 ? (cfg.enforceTargets ? 'fail' : 'warn') : 'pass';
  const summary = {
    defaultEnvironment: cfg.defaultEnv,
    backendStatus,
    streamStatus,
    alertingStatus: alertStatus,
    streamCursor: existsNum(streamState?.cursor) ? Number(streamState.cursor) : null,
    teams: teams.length,
    incidents: incidents.length,
    openIncidents: openIncidents.length,
    openCriticalIncidents: openIncidents.filter((x) => sev(x?.severity) === 'critical').length,
    alerts: alerts.length,
    activeAlerts: activeAlerts.length,
    activeCriticalAlerts: activeAlerts.filter((x) => sev(x?.severity) === 'critical').length,
    operationalWorkloadState: operationalSources?.overall?.workloadState || 'unknown',
    operationalFreshnessState: operationalSources?.overall?.freshnessState || 'unknown',
    operationalActionabilityState: operationalSources?.overall?.actionabilityState || 'unknown',
    operationalHealthySources: operationalSources?.overall?.healthySources ?? null,
    operationalStaleSources: operationalSources?.overall?.staleSources ?? null,
    operationalMissingSources: operationalSources?.overall?.missingSources ?? null,
    streamAgeMinutes,
    slaPoints: slaHistory.length,
    slaAgeMinutes,
    violations: violations.length,
    blockingViolations: blocking.length,
  };

  const report = { generatedAt: ts, status, summary, config: cfg, violations };
  await writeJson(cfg.panelReportFile, report);
  await writeText(cfg.panelDashboardFile, await renderHtml({
    generatedAt: ts,
    status,
    summary,
    operationalSources,
    operationalProvider,
    api: { baseDefault: cfg.apiBaseDefault, defaultRole: 'operator', defaultLimit: Math.min(500, Math.max(50, Math.max(incidents.length, alerts.length, 200))) },
    ui: { autoConnect: cfg.autoConnect, refreshMs: cfg.refreshMs },
  }));
  await publishHtmlAssets({
    htmlFile: cfg.panelDashboardFile,
    assets: [
      {
        sourceFile: 'scripts/assets/fullcycle-connectors-observability-ops-panel.css',
        fileName: 'fullcycle-connectors-observability-ops-panel.css',
      },
      {
        sourceFile: 'scripts/assets/fullcycle-connectors-observability-ops-panel.js',
        fileName: 'fullcycle-connectors-observability-ops-panel.js',
      },
    ],
  });
  await appendJsonl(cfg.panelAuditFile, { timestamp: ts, source: 'phase31-observability-panel-backend-integration', status, summary, violations, panelReportFile: cfg.panelReportFile, panelDashboardFile: cfg.panelDashboardFile });

  console.log(`Observability panel report: ${cfg.panelReportFile}`);
  console.log(`Observability panel dashboard: ${cfg.panelDashboardFile}`);
  console.log(`Observability panel audit: ${cfg.panelAuditFile}`);
  console.log(`[OBS-PANEL-BACKEND] status=${status} teams=${teams.length} incidents=${incidents.length} alerts=${alerts.length} slaPoints=${slaHistory.length} violations=${violations.length}`);
  if (status === 'fail') {
    for (const item of blocking) console.error(`[OBS-PANEL-BACKEND] ${item.code}: ${item.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase31 observability panel integration failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
