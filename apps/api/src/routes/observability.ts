/**
 * Rotas internas de Observabilidade de Conectores (Fase 25)
 * Productizacao: endpoint interno + RBAC + historico/arquivo
 */

import { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';

type AccessLevel = 'operator' | 'executive';

async function readJson(filePath: string, fallback: unknown = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function envRoles(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getProvidedRole(request: any): string {
  const fromHeader = request.headers['x-observability-role'] || request.headers['x-role'];
  const fromQuery = request.query?.role;
  return String(fromHeader || fromQuery || 'operator').trim().toLowerCase();
}

function verifyAdminKey(request: any, reply: any): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  const isDev = process.env.NODE_ENV === 'development';
  if (!adminKey) {
    if (isDev) return true;
    reply.code(503).send({ error: 'ADMIN_API_KEY not configured' });
    return false;
  }
  const providedKey = request.headers['x-admin-key'] || request.query?.adminKey;
  if (providedKey !== adminKey) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function verifyRole(request: any, reply: any, level: AccessLevel): boolean {
  const rbacEnabled = String(process.env.OBSERVABILITY_RBAC_ENABLED || 'true').toLowerCase() !== 'false';
  if (!rbacEnabled) return true;

  const operatorRoles = envRoles('OBSERVABILITY_RBAC_OPERATOR_ROLES', ['operator', 'executive', 'admin']);
  const executiveRoles = envRoles('OBSERVABILITY_RBAC_EXECUTIVE_ROLES', ['executive', 'admin']);
  const role = getProvidedRole(request);
  const allowed = level === 'executive' ? executiveRoles : operatorRoles;

  if (!allowed.includes(role)) {
    reply.code(403).send({
      error: 'Forbidden',
      requiredRole: level,
      providedRole: role || 'unknown',
    });
    return false;
  }
  return true;
}

function resolvePath(name: string, fallbackRelative: string): string {
  const val = process.env[name];
  if (val && val.trim()) return val;
  return path.resolve(process.cwd(), fallbackRelative);
}

async function readArchiveLines(filePath: string, limit: number) {
  if (!(await fileExists(filePath))) return [];
  const raw = await fs.readFile(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const selected = lines.slice(-Math.max(1, limit));
  const parsed = [];
  for (const line of selected) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      parsed.push({ parseError: true, raw: line.slice(0, 500) });
    }
  }
  return parsed;
}

async function readJsonLines(filePath: string, limit: number) {
  if (!(await fileExists(filePath))) return [];
  const raw = await fs.readFile(filePath, 'utf-8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = lines.slice(-Math.max(1, limit));
  const parsed = [];
  for (const line of selected) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      parsed.push({ parseError: true, raw: line.slice(0, 500) });
    }
  }
  return parsed;
}

function queryBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const val = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(val)) return true;
  if (['0', 'false', 'no', 'off'].includes(val)) return false;
  return fallback;
}

function queryInt(value: unknown, fallback: number, min: number, max: number) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function queryList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function queryMatch(value: unknown, filters: string[]) {
  if (filters.length === 0) return true;
  return filters.includes(String(value || '').trim().toLowerCase());
}

function sortByRecent<T extends Record<string, any>>(entries: T[], keys: string[]): T[] {
  return [...entries].sort((a, b) => {
    const aMs = keys
      .map((key) => Date.parse(String(a?.[key] || '')))
      .find((item) => Number.isFinite(item));
    const bMs = keys
      .map((key) => Date.parse(String(b?.[key] || '')))
      .find((item) => Number.isFinite(item));
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
}

function filterRecords(entries: any[], query: Record<string, unknown>, kind: 'incident' | 'alert') {
  const statuses = queryList(query.status);
  const severities = queryList(query.severity);
  const teams = queryList(query.team);
  const sources = queryList(query.source);
  const environments = queryList(query.environment);
  const search = String(query.q || '').trim().toLowerCase();

  return entries.filter((item) => {
    const team = item?.ownerTeam || item?.routing?.team || '';
    const haystack = [
      item?.id,
      item?.key,
      item?.source,
      item?.code,
      item?.message,
      item?.environment,
      team,
      ...(kind === 'incident' ? (Array.isArray(item?.connectors) ? item.connectors : []) : []),
    ]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');

    return queryMatch(item?.status, statuses)
      && queryMatch(item?.severity, severities)
      && queryMatch(team, teams)
      && queryMatch(item?.source, sources)
      && queryMatch(item?.environment, environments)
      && (!search || haystack.includes(search));
  });
}

function writeSse(raw: any, event: string, data: unknown, id?: string | null) {
  if (id) raw.write(`id: ${id}\n`);
  raw.write(`event: ${event}\n`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const line of payload.split('\n')) {
    raw.write(`data: ${line}\n`);
  }
  raw.write('\n');
}

function applyDashboardHtmlHeaders(reply: any) {
  reply.header(
    'content-security-policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self' http: https: ws: wss:",
    ].join('; '),
  );
}

function getStaticAssetType(assetName: string): string | null {
  if (assetName.endsWith('.css')) return 'text/css; charset=utf-8';
  if (assetName.endsWith('.js')) return 'application/javascript; charset=utf-8';
  return null;
}

async function serveDashboardAsset(reply: any, htmlFile: string, assetName: string, allowedAssets: string[]) {
  const safeName = path.basename(String(assetName || '').trim());
  if (!safeName || safeName !== assetName || !allowedAssets.includes(safeName)) {
    return reply.code(404).send({ error: 'Asset not found', asset: assetName });
  }

  const assetType = getStaticAssetType(safeName);
  if (!assetType) {
    return reply.code(404).send({ error: 'Unsupported asset type', asset: safeName });
  }

  const assetFile = path.resolve(path.dirname(htmlFile), 'assets', safeName);
  if (!(await fileExists(assetFile))) {
    return reply.code(503).send({ error: 'Asset unavailable', asset: safeName, file: assetFile });
  }

  reply.header('cache-control', 'no-store');
  reply.header('x-content-type-options', 'nosniff');
  return reply.type(assetType).send(await fs.readFile(assetFile, 'utf-8'));
}

export const observabilityRoutes: FastifyPluginAsync = async (fastify) => {
  const cfg = {
    apiPayloadFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE', 'logs/monitoring/fullcycle-connector-observability-api-payload.json'),
    reportFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE', 'logs/monitoring/fullcycle-connector-observability-report.json'),
    feedFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE', 'docs/fullcycle-connectors-observability.json'),
    dashboardFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE', 'docs/fullcycle-connectors-observability.html'),
    storeFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE', 'logs/monitoring/fullcycle-connector-observability-store.json'),
    archiveFile: resolvePath('FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE', 'logs/monitoring/fullcycle-connector-observability-archive.jsonl'),
    apiSlaHistoryFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE', 'logs/monitoring/fullcycle-connector-observability-api-sla-history.json'),
    panelDashboardFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE', 'docs/fullcycle-connectors-observability-ops-panel.html'),
    alertingReportFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE', 'logs/monitoring/fullcycle-connector-observability-alerting-report.json'),
    backendStoreFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE', 'logs/monitoring/fullcycle-connector-observability-backend-store.json'),
    backendReportFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE', 'logs/monitoring/fullcycle-connector-observability-backend-report.json'),
    backendDashboardFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE', 'docs/fullcycle-connectors-observability-backend.md'),
    backendAnalyticsFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE', 'logs/monitoring/fullcycle-connector-observability-backend-analytics.json'),
    streamStateFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE', 'logs/monitoring/fullcycle-connector-observability-stream-state.json'),
    streamEventsFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE', 'logs/monitoring/fullcycle-connector-observability-stream-events.jsonl'),
    streamReportFile: resolvePath('FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE', 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    streamDefaultLimit: queryInt(process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_DEFAULT_LIMIT, 100, 1, 1000),
    streamPollMs: queryInt(process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_POLL_MS, 5000, 1000, 60000),
    streamHeartbeatMs: queryInt(process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_HEARTBEAT_MS, 15000, 1000, 120000),
  };

  async function requireAccess(request: any, reply: any, level: AccessLevel) {
    if (!verifyAdminKey(request, reply)) return false;
    if (!verifyRole(request, reply, level)) return false;
    return true;
  }

  // Summary estável para o dashboard interno
  fastify.get('/observability/connectors/summary', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    const payloadExists = await fileExists(cfg.apiPayloadFile);
    if (payloadExists) {
      const payload = await readJson(cfg.apiPayloadFile);
      return {
        source: 'api_payload',
        role: getProvidedRole(request),
        payload,
      };
    }

    const reportExists = await fileExists(cfg.reportFile);
    const feedExists = await fileExists(cfg.feedFile);
    if (!reportExists || !feedExists) {
      return reply.code(503).send({
        error: 'Observability payload unavailable',
        missing: {
          report: !reportExists,
          feed: !feedExists,
          apiPayload: !payloadExists,
        },
      });
    }

    const [report, feed] = await Promise.all([
      readJson(cfg.reportFile),
      readJson(cfg.feedFile),
    ]);

    return {
      source: 'fallback_report_feed',
      role: getProvidedRole(request),
      payload: {
        generatedAt: new Date().toISOString(),
        status: String(report?.status || feed?.status || 'unknown').toLowerCase(),
        summary: {
          ...(report?.summary || {}),
          ...(feed?.summary || {}),
        },
      },
    };
  });

  // Feed JSON completo para integrações internas
  fastify.get('/observability/connectors/feed', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    if (!(await fileExists(cfg.feedFile))) {
      return reply.code(503).send({ error: 'Observability feed unavailable', file: cfg.feedFile });
    }
    const feed = await readJson(cfg.feedFile);
    return {
      role: getProvidedRole(request),
      feed,
    };
  });

  // Histórico do store central (RBAC executivo)
  fastify.get('/observability/connectors/history', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    const limit = Math.max(1, Math.min(1000, parseInt((request.query as any)?.limit || '100', 10)));
    if (!(await fileExists(cfg.storeFile))) {
      return reply.code(503).send({ error: 'Observability store unavailable', file: cfg.storeFile });
    }
    const store = await readJson(cfg.storeFile);
    const history = Array.isArray(store?.history) ? store.history : [];
    return {
      role: getProvidedRole(request),
      generatedAt: store?.generatedAt || null,
      entries: history.slice(-limit),
      totalEntries: history.length,
    };
  });

  // Archive de histórico podado (RBAC executivo)
  fastify.get('/observability/connectors/archive', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    const limit = Math.max(1, Math.min(1000, parseInt((request.query as any)?.limit || '100', 10)));
    const entries = await readArchiveLines(cfg.archiveFile, limit);
    return {
      role: getProvidedRole(request),
      file: cfg.archiveFile,
      entries,
      returned: entries.length,
    };
  });

  // Dashboard HTML servido pela API interna (RBAC executivo)
  fastify.get('/observability/connectors/dashboard', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    if (!(await fileExists(cfg.dashboardFile))) {
      return reply.code(503).send({ error: 'Observability dashboard unavailable', file: cfg.dashboardFile });
    }
    const html = await fs.readFile(cfg.dashboardFile, 'utf-8');
    applyDashboardHtmlHeaders(reply);
    return reply.type('text/html').send(html);
  });

  fastify.get('/observability/connectors/assets/:asset', async (request: any, reply) => serveDashboardAsset(
    reply,
    cfg.dashboardFile,
    String(request.params?.asset || ''),
    [
      'fullcycle-connectors-observability-compat.css',
      'fullcycle-connectors-observability.css',
      'fullcycle-connectors-observability.js',
    ],
  ));

  // Sumario de SLA historico da API interna (operator+)
  fastify.get('/observability/connectors/api-sla/summary', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    const hasSlaHistory = await fileExists(cfg.apiSlaHistoryFile);
    const hasAlertingReport = await fileExists(cfg.alertingReportFile);
    if (!hasSlaHistory && !hasAlertingReport) {
      return reply.code(503).send({
        error: 'Observability API SLA unavailable',
        missing: {
          apiSlaHistory: !hasSlaHistory,
          alertingReport: !hasAlertingReport,
        },
      });
    }

    const [historyPayload, alertingReport] = await Promise.all([
      readJson(cfg.apiSlaHistoryFile, { history: [] }),
      readJson(cfg.alertingReportFile, null),
    ]);
    const entries = Array.isArray(historyPayload?.history) ? historyPayload.history : [];
    const latest = entries.length > 0 ? entries[entries.length - 1] : null;

    return {
      role: getProvidedRole(request),
      generatedAt: new Date().toISOString(),
      historyPoints: entries.length,
      latest,
      alerting: alertingReport
        ? {
          status: alertingReport.status || 'unknown',
          summary: alertingReport.summary || {},
        }
        : null,
    };
  });

  // Historico de SLA da API interna (executive+)
  fastify.get('/observability/connectors/api-sla/history', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    const limit = Math.max(1, Math.min(2000, parseInt((request.query as any)?.limit || '200', 10)));
    if (!(await fileExists(cfg.apiSlaHistoryFile))) {
      return reply.code(503).send({ error: 'Observability API SLA history unavailable', file: cfg.apiSlaHistoryFile });
    }
    const payload = await readJson(cfg.apiSlaHistoryFile, { history: [] });
    const entries = Array.isArray(payload?.history) ? payload.history : [];
    return {
      role: getProvidedRole(request),
      generatedAt: payload?.generatedAt || null,
      entries: entries.slice(-limit),
      totalEntries: entries.length,
    };
  });

  // Sumario consolidado de incidents do backend dedicado (operator+)
  fastify.get('/observability/connectors/incidents/summary', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    if (!(await fileExists(cfg.backendStoreFile))) {
      return reply.code(503).send({
        error: 'Observability backend incidents unavailable',
        file: cfg.backendStoreFile,
      });
    }
    const store = await readJson(cfg.backendStoreFile, {});
    const incidents = Array.isArray(store?.incidents) ? store.incidents : [];
    const open = incidents.filter((item: any) => item?.status !== 'resolved');
    return {
      role: getProvidedRole(request),
      generatedAt: store?.generatedAt || null,
      status: store?.status || 'unknown',
      summary: {
        totalEntries: incidents.length,
        openEntries: open.length,
        resolvedEntries: incidents.length - open.length,
        criticalOpenEntries: open.filter((item: any) => item?.severity === 'critical').length,
        teamsTracked: Array.isArray(store?.teams) ? store.teams.length : 0,
      },
      teams: Array.isArray(store?.teams) ? store.teams : [],
    };
  });

  // Lista filtravel de incidents consolidados (operator+)
  fastify.get('/observability/connectors/incidents', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    const limit = queryInt((request.query as any)?.limit, 100, 1, 1000);
    if (!(await fileExists(cfg.backendStoreFile))) {
      return reply.code(503).send({
        error: 'Observability backend incidents unavailable',
        file: cfg.backendStoreFile,
      });
    }
    const store = await readJson(cfg.backendStoreFile, {});
    const incidents = Array.isArray(store?.incidents) ? store.incidents : [];
    const filtered = filterRecords(incidents, (request.query as any) || {}, 'incident');
    const sorted = sortByRecent(filtered, ['lastSeenAt', 'resolvedAt', 'startedAt']);
    return {
      role: getProvidedRole(request),
      generatedAt: store?.generatedAt || null,
      status: store?.status || 'unknown',
      entries: sorted.slice(0, limit),
      totalEntries: incidents.length,
      returned: Math.min(sorted.length, limit),
    };
  });

  // Sumario consolidado de alerts do backend dedicado (operator+)
  fastify.get('/observability/connectors/alerts/summary', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    if (!(await fileExists(cfg.backendStoreFile))) {
      return reply.code(503).send({
        error: 'Observability backend alerts unavailable',
        file: cfg.backendStoreFile,
      });
    }
    const store = await readJson(cfg.backendStoreFile, {});
    const alerts = Array.isArray(store?.alerts) ? store.alerts : [];
    const active = alerts.filter((item: any) => item?.status !== 'resolved');
    return {
      role: getProvidedRole(request),
      generatedAt: store?.generatedAt || null,
      status: store?.status || 'unknown',
      summary: {
        totalEntries: alerts.length,
        activeEntries: active.length,
        resolvedEntries: alerts.length - active.length,
        criticalActiveEntries: active.filter((item: any) => item?.severity === 'critical').length,
        teamsTracked: Array.isArray(store?.teams) ? store.teams.length : 0,
      },
      teams: Array.isArray(store?.teams) ? store.teams : [],
    };
  });

  // Lista filtravel de alerts consolidados (operator+)
  fastify.get('/observability/connectors/alerts', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    const limit = queryInt((request.query as any)?.limit, 100, 1, 1000);
    if (!(await fileExists(cfg.backendStoreFile))) {
      return reply.code(503).send({
        error: 'Observability backend alerts unavailable',
        file: cfg.backendStoreFile,
      });
    }
    const store = await readJson(cfg.backendStoreFile, {});
    const alerts = Array.isArray(store?.alerts) ? store.alerts : [];
    const filtered = filterRecords(alerts, (request.query as any) || {}, 'alert');
    const sorted = sortByRecent(filtered, ['lastSeenAt', 'resolvedAt', 'openedAt']);
    return {
      role: getProvidedRole(request),
      generatedAt: store?.generatedAt || null,
      status: store?.status || 'unknown',
      entries: sorted.slice(0, limit),
      totalEntries: alerts.length,
      returned: Math.min(sorted.length, limit),
    };
  });

  // Relatorio consolidado do backend dedicado (executive+)
  fastify.get('/observability/connectors/backend/report', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    if (!(await fileExists(cfg.backendReportFile))) {
      return reply.code(503).send({
        error: 'Observability backend report unavailable',
        file: cfg.backendReportFile,
      });
    }
    const report = await readJson(cfg.backendReportFile, {});
    return {
      role: getProvidedRole(request),
      report,
    };
  });

  // Analytics historico do backend dedicado (executive+)
  fastify.get('/observability/connectors/backend/analytics', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    const limit = queryInt((request.query as any)?.limit, 200, 1, 2000);
    if (!(await fileExists(cfg.backendAnalyticsFile))) {
      return reply.code(503).send({
        error: 'Observability backend analytics unavailable',
        file: cfg.backendAnalyticsFile,
      });
    }
    const analytics = await readJson(cfg.backendAnalyticsFile, {});
    const entries = Array.isArray(analytics?.entries) ? analytics.entries : [];
    return {
      role: getProvidedRole(request),
      generatedAt: analytics?.generatedAt || null,
      version: analytics?.version || null,
      current: analytics?.current || null,
      entries: entries.slice(-limit),
      totalEntries: entries.length,
    };
  });

  // Dashboard markdown do backend dedicado (executive+)
  fastify.get('/observability/connectors/backend/dashboard', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'executive'))) return;
    if (!(await fileExists(cfg.backendDashboardFile))) {
      return reply.code(503).send({
        error: 'Observability backend dashboard unavailable',
        file: cfg.backendDashboardFile,
      });
    }
    const markdown = await fs.readFile(cfg.backendDashboardFile, 'utf-8');
    return reply.type('text/markdown').send(markdown);
  });

  // Painel operacional interativo de observabilidade realtime (operator+)
  fastify.get('/observability/connectors/realtime/panel', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;
    if (!(await fileExists(cfg.panelDashboardFile))) {
      return reply.code(503).send({
        error: 'Observability realtime panel unavailable',
        file: cfg.panelDashboardFile,
      });
    }
    const html = await fs.readFile(cfg.panelDashboardFile, 'utf-8');
    applyDashboardHtmlHeaders(reply);
    return reply.type('text/html').send(html);
  });

  fastify.get('/observability/connectors/realtime/assets/:asset', async (request: any, reply) => serveDashboardAsset(
    reply,
    cfg.panelDashboardFile,
    String(request.params?.asset || ''),
    [
      'fullcycle-connectors-observability-ops-panel.css',
      'fullcycle-connectors-observability-ops-panel.js',
    ],
  ));

  // Stream SSE interno para monitoramento executivo/operacional em tempo real
  fastify.get('/observability/connectors/stream', async (request, reply) => {
    if (!(await requireAccess(request, reply, 'operator'))) return;

    const query = (request.query as Record<string, unknown>) || {};
    const once = queryBool(query.once, false);
    const limit = queryInt(query.limit, cfg.streamDefaultLimit, 1, 1000);
    const pollMs = queryInt(query.pollMs, cfg.streamPollMs, 1000, 60000);
    const heartbeatMs = queryInt(query.heartbeatMs, cfg.streamHeartbeatMs, 1000, 120000);

    const hasState = await fileExists(cfg.streamStateFile);
    const hasEvents = await fileExists(cfg.streamEventsFile);
    const hasReport = await fileExists(cfg.streamReportFile);
    if (!hasState && !hasEvents && !hasReport) {
      return reply.code(503).send({
        error: 'Observability realtime stream unavailable',
        missing: {
          streamState: !hasState,
          streamEvents: !hasEvents,
          streamReport: !hasReport,
        },
      });
    }

    if (typeof (reply as any).hijack === 'function') {
      (reply as any).hijack();
    }

    const raw = reply.raw;
    raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    raw.setHeader('cache-control', 'no-cache, no-transform');
    raw.setHeader('connection', 'keep-alive');
    raw.setHeader('x-accel-buffering', 'no');
    if (typeof raw.flushHeaders === 'function') raw.flushHeaders();

    const state = await readJson(cfg.streamStateFile, null);
    const report = await readJson(cfg.streamReportFile, null);
    const events = await readJsonLines(cfg.streamEventsFile, limit);

    const snapshot = {
      role: getProvidedRole(request),
      generatedAt: new Date().toISOString(),
      state,
      report: report ? { status: report.status, summary: report.summary, generatedAt: report.generatedAt } : null,
      eventsRetained: events.length,
    };
    writeSse(raw, 'snapshot', snapshot, 'snapshot-0');

    let lastCursor = Number(state?.cursor || 0) - events.length;
    for (const item of events) {
      const cursor = Number(item?.cursor || 0);
      if (cursor > lastCursor) lastCursor = cursor;
      writeSse(raw, 'event', item, String(item?.id || `event-${cursor}`));
    }

    if (once) {
      writeSse(raw, 'end', { once: true, lastCursor }, `end-${lastCursor}`);
      raw.end();
      return;
    }

    const pollTimer = setInterval(async () => {
      if (raw.writableEnded || raw.destroyed) return;
      try {
        const nextState = await readJson(cfg.streamStateFile, null);
        const nextEvents = await readJsonLines(cfg.streamEventsFile, limit);
        for (const item of nextEvents) {
          const cursor = Number(item?.cursor || 0);
          if (!Number.isFinite(cursor) || cursor <= lastCursor) continue;
          lastCursor = cursor;
          writeSse(raw, 'event', item, String(item?.id || `event-${cursor}`));
        }
        if (nextState?.cursor && Number(nextState.cursor) > lastCursor) {
          writeSse(raw, 'cursor', { cursor: Number(nextState.cursor) }, `cursor-${nextState.cursor}`);
        }
      } catch (error) {
        writeSse(raw, 'error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }, pollMs);

    const heartbeatTimer = setInterval(() => {
      if (raw.writableEnded || raw.destroyed) return;
      writeSse(raw, 'heartbeat', { ts: new Date().toISOString(), cursor: lastCursor });
    }, heartbeatMs);

    const cleanup = () => {
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      if (!raw.writableEnded) raw.end();
    };

    raw.on('close', cleanup);
    raw.on('error', cleanup);
  });
};

export default observabilityRoutes;
