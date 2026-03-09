import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CI_API_URL || 'http://127.0.0.1:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const ENFORCE_SHAPE = String(process.env.CI_API_SMOKE_ENFORCE_SHAPE || 'true').toLowerCase() !== 'false';
const FAIL_ON_CONTRACT = String(process.env.CI_API_SMOKE_FAIL_ON_CONTRACT || 'true').toLowerCase() !== 'false';
const REPORT_FILE = process.env.CI_API_SMOKE_REPORT_FILE || '';

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toPreview(value) {
  return String(value || '').slice(0, 180).replace(/\s+/g, ' ');
}

function pushIf(errors, condition, message) {
  if (!condition) errors.push(message);
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validatorsFor(check) {
  return check.validators || [];
}

function validateJsonObject(payload, requiredKeys) {
  const errors = [];
  pushIf(errors, isObject(payload), 'payload must be an object');
  for (const key of requiredKeys) {
    pushIf(errors, payload && Object.prototype.hasOwnProperty.call(payload, key), `missing key ${key}`);
  }
  return errors;
}

function validateStrictHtmlShell({ response, text, requiredAssets = [], requiredMarkers = [], requiredTemplates = [] }) {
  const errors = [];
  const csp = response?.headers?.get('content-security-policy') || '';

  pushIf(errors, text.includes('<html'), 'html tag expected');
  pushIf(errors, /observability/i.test(text), 'observability marker expected');
  pushIf(errors, !/<style[\s>]/i.test(text), 'inline style tag must be absent');
  pushIf(errors, !/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), 'inline script tag must be absent');
  pushIf(errors, csp.includes("style-src 'self'"), "csp must restrict style-src to 'self'");
  pushIf(errors, csp.includes("script-src 'self'"), "csp must restrict script-src to 'self'");
  pushIf(errors, !csp.includes("'unsafe-inline'"), "csp must not include 'unsafe-inline'");

  for (const asset of requiredAssets) {
    pushIf(errors, text.includes(asset), `asset reference missing: ${asset}`);
  }
  for (const marker of requiredMarkers) {
    pushIf(errors, text.includes(marker), `marker missing: ${marker}`);
  }
  for (const templateId of requiredTemplates) {
    pushIf(errors, text.includes(`id="${templateId}"`), `template missing: ${templateId}`);
  }

  return errors;
}

const checks = [
  {
    name: 'health',
    path: '/health',
    statuses: [200],
    kind: 'json',
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['status', 'database', 'timestamp']);
        pushIf(errors, data?.status === 'healthy', 'status must be healthy');
        return errors;
      },
    ],
  },
  {
    name: 'ready',
    path: '/ready',
    statuses: [200],
    kind: 'json',
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['status', 'database', 'timestamp']);
        pushIf(errors, data?.status === 'ready', 'status must be ready');
        return errors;
      },
    ],
  },
  { name: 'kpis', path: '/api/dashboard/kpis', statuses: [200] },
  { name: 'funnel', path: '/api/dashboard/funnel', statuses: [200] },
  { name: 'pipeline_weighted', path: '/api/dashboard/pipeline-weighted', statuses: [200] },
  { name: 'products_comparison', path: '/api/dashboard/products/comparison', statuses: [200] },
  { name: 'loss_stats', path: '/api/dashboard/loss-stats', statuses: [200] },
  { name: 'conversations', path: '/api/conversations?limit=1', statuses: [200] },
  { name: 'alerts', path: '/api/alerts', statuses: [200] },
  { name: 'metrics_usage', path: '/api/metrics/usage?days=2', statuses: [200] },
  {
    name: 'observability_summary',
    path: '/api/observability/connectors/summary',
    statuses: [200],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['source', 'role', 'payload']);
        pushIf(errors, isObject(data?.payload), 'payload must be object');
        return errors;
      },
    ],
  },
  {
    name: 'observability_feed',
    path: '/api/observability/connectors/feed',
    statuses: [200],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'feed']);
        pushIf(errors, isObject(data?.feed), 'feed must be object');
        return errors;
      },
    ],
  },
  {
    name: 'observability_history',
    path: '/api/observability/connectors/history?limit=1',
    statuses: [200],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'totalEntries']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.totalEntries), 'totalEntries must be numeric');
        return errors;
      },
    ],
  },
  {
    name: 'observability_archive',
    path: '/api/observability/connectors/archive?limit=1',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'returned']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.returned), 'returned must be numeric');
        return errors;
      },
    ],
  },
  {
    name: 'observability_dashboard',
    path: '/api/observability/connectors/dashboard',
    statuses: [200],
    kind: 'html',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ response, text }) => validateStrictHtmlShell({
        response,
        text,
        requiredAssets: [
          './assets/fullcycle-connectors-observability-compat.css',
        ],
        requiredMarkers: [
          'Observability Connectors Executive Dashboard',
          'Backend Dashboard Snapshot',
        ],
      }),
    ],
  },
  {
    name: 'observability_dashboard_asset_css',
    path: '/api/observability/connectors/assets/fullcycle-connectors-observability-compat.css',
    statuses: [200],
    kind: 'text',
    validators: [
      ({ text, contentType }) => {
        const errors = [];
        pushIf(errors, String(contentType || '').includes('text/css'), 'content-type must be text/css');
        pushIf(errors, text.includes('.hero'), 'dashboard css marker expected');
        pushIf(errors, text.includes('.grid'), 'dashboard layout marker expected');
        return errors;
      },
    ],
  },
  {
    name: 'observability_stream_once',
    path: '/api/observability/connectors/stream?once=true&limit=5',
    statuses: [200, 503],
    kind: 'sse',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ text, contentType }) => {
        const errors = [];
        pushIf(errors, String(contentType || '').includes('text/event-stream'), 'content-type must be text/event-stream');
        pushIf(errors, text.includes('event: snapshot'), 'snapshot event expected');
        return errors;
      },
    ],
  },
  {
    name: 'observability_api_sla_summary',
    path: '/api/observability/connectors/api-sla/summary',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'generatedAt', 'historyPoints', 'latest']);
        pushIf(errors, Number.isFinite(data?.historyPoints), 'historyPoints must be numeric');
        pushIf(errors, data?.latest === null || isObject(data?.latest), 'latest must be object or null');
        return errors;
      },
    ],
  },
  {
    name: 'observability_api_sla_history',
    path: '/api/observability/connectors/api-sla/history?limit=1',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'totalEntries']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.totalEntries), 'totalEntries must be numeric');
        return errors;
      },
    ],
  },
  {
    name: 'observability_incidents_summary',
    path: '/api/observability/connectors/incidents/summary',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'summary', 'teams']);
        pushIf(errors, isObject(data?.summary), 'summary must be object');
        pushIf(errors, Array.isArray(data?.teams), 'teams must be array');
        return errors;
      },
    ],
  },
  {
    name: 'observability_incidents',
    path: '/api/observability/connectors/incidents?limit=1',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'totalEntries', 'returned']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.totalEntries), 'totalEntries must be numeric');
        pushIf(errors, Number.isFinite(data?.returned), 'returned must be numeric');
        return errors;
      },
    ],
  },
  {
    name: 'observability_incidents_filtered',
    path: '/api/observability/connectors/incidents?limit=1&team=comercial-ops&severity=critical',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['entries', 'totalEntries', 'returned']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        return errors;
      },
    ],
  },
  {
    name: 'observability_alerts_summary',
    path: '/api/observability/connectors/alerts/summary',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'summary', 'teams']);
        pushIf(errors, isObject(data?.summary), 'summary must be object');
        pushIf(errors, Array.isArray(data?.teams), 'teams must be array');
        return errors;
      },
    ],
  },
  {
    name: 'observability_alerts',
    path: '/api/observability/connectors/alerts?limit=1',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'totalEntries', 'returned']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.totalEntries), 'totalEntries must be numeric');
        pushIf(errors, Number.isFinite(data?.returned), 'returned must be numeric');
        return errors;
      },
    ],
  },
  {
    name: 'observability_alerts_filtered',
    path: '/api/observability/connectors/alerts?limit=1&source=api_sla&status=open',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['entries', 'totalEntries', 'returned']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        return errors;
      },
    ],
  },
  {
    name: 'observability_backend_summary',
    path: '/api/observability/connectors/backend/summary',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'status', 'summary', 'operationalSources', 'analytics']);
        pushIf(errors, isObject(data?.summary), 'summary must be object');
        pushIf(errors, data?.operationalSources === null || isObject(data?.operationalSources), 'operationalSources must be object or null');
        pushIf(errors, isObject(data?.analytics), 'analytics must be object');
        return errors;
      },
    ],
  },
  {
    name: 'observability_backend_report',
    path: '/api/observability/connectors/backend/report',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'report']);
        pushIf(errors, isObject(data?.report), 'report must be object');
        pushIf(errors, data?.report?.operationalSources === null || isObject(data?.report?.operationalSources), 'report.operationalSources must be object or null');
        return errors;
      },
    ],
  },
  {
    name: 'observability_backend_analytics',
    path: '/api/observability/connectors/backend/analytics?limit=1',
    statuses: [200, 503],
    kind: 'json',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ data }) => {
        const errors = validateJsonObject(data, ['role', 'entries', 'totalEntries', 'current']);
        pushIf(errors, Array.isArray(data?.entries), 'entries must be array');
        pushIf(errors, Number.isFinite(data?.totalEntries), 'totalEntries must be numeric');
        pushIf(errors, data?.current === null || isObject(data?.current), 'current must be object or null');
        pushIf(errors, data?.current?.operationalSources === null || isObject(data?.current?.operationalSources), 'current.operationalSources must be object or null');
        return errors;
      },
    ],
  },
  {
    name: 'observability_realtime_panel',
    path: '/api/observability/connectors/realtime/panel',
    statuses: [200, 503],
    kind: 'html',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'operator',
    },
    validators: [
      ({ response, text }) => validateStrictHtmlShell({
        response,
        text,
        requiredAssets: [
          './assets/fullcycle-connectors-observability-ops-panel.css',
          './assets/fullcycle-connectors-observability-ops-panel.js',
        ],
        requiredMarkers: [
          'Observability Backend Ops Panel',
          'activityLog',
          'incidentsMeta',
        ],
        requiredTemplates: ['phase31-panel-data'],
      }),
    ],
  },
  {
    name: 'observability_realtime_panel_asset_css',
    path: '/api/observability/connectors/realtime/assets/fullcycle-connectors-observability-ops-panel.css',
    statuses: [200],
    kind: 'text',
    validators: [
      ({ text, contentType }) => {
        const errors = [];
        pushIf(errors, String(contentType || '').includes('text/css'), 'content-type must be text/css');
        pushIf(errors, text.includes('.hero-meta'), 'panel css marker expected');
        return errors;
      },
    ],
  },
  {
    name: 'observability_realtime_panel_asset_js',
    path: '/api/observability/connectors/realtime/assets/fullcycle-connectors-observability-ops-panel.js',
    statuses: [200],
    kind: 'text',
    validators: [
      ({ text, contentType }) => {
        const errors = [];
        pushIf(errors, String(contentType || '').includes('javascript'), 'content-type must be javascript');
        pushIf(errors, text.includes('readPanelData'), 'panel js bootstrap expected');
        pushIf(errors, text.includes('Connect SSE'), 'panel js should retain UI strings');
        return errors;
      },
    ],
  },
  {
    name: 'observability_backend_dashboard',
    path: '/api/observability/connectors/backend/dashboard',
    statuses: [200, 503],
    kind: 'text',
    headers: {
      'x-admin-key': ADMIN_KEY,
      'x-observability-role': 'executive',
    },
    validators: [
      ({ text }) => {
        const errors = [];
        pushIf(errors, text.trim().length > 20, 'dashboard markdown must not be empty');
        return errors;
      },
    ],
  },
];

async function fetchWithTimeout(url, headers = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function writeReport(payload) {
  if (!REPORT_FILE) return;
  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function run() {
  let failures = 0;
  let contractFailures = 0;
  let validatedContractChecks = 0;
  const reportChecks = [];

  for (const check of checks) {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}${check.path}`, check.headers || {});
      const text = await response.text();
      const data = parseJsonSafe(text);
      const statusOk = check.statuses.includes(response.status);
      const contentType = response.headers.get('content-type') || '';
      const bodyPreview = toPreview(text);
      const entry = {
        name: check.name,
        path: check.path,
        status: response.status,
        expectedStatuses: check.statuses,
        statusOk,
        contentType,
        bodyPreview,
        contractEvaluated: false,
        contractOk: true,
        contractErrors: [],
      };

      if (!statusOk) {
        failures += 1;
        entry.contractOk = false;
        entry.contractErrors.push(`unexpected status ${response.status}`);
        console.error(`[FAIL] ${check.name} status=${response.status} expected=${check.statuses.join(',')} body=${bodyPreview}`);
        reportChecks.push(entry);
        continue;
      }

      if (ENFORCE_SHAPE && response.status === 200 && validatorsFor(check).length > 0) {
        entry.contractEvaluated = true;
        validatedContractChecks += 1;
        const errors = [];
        for (const validator of validatorsFor(check)) {
          errors.push(...validator({ response, text, data, contentType }));
        }
        entry.contractErrors = errors;
        entry.contractOk = errors.length === 0;
        if (errors.length > 0) {
          contractFailures += 1;
          console.error(`[FAIL] ${check.name} contract=${errors.join(' | ')} body=${bodyPreview}`);
          if (FAIL_ON_CONTRACT) failures += 1;
        } else {
          console.log(`[OK] ${check.name} status=${response.status} contract=ok`);
        }
      } else {
        console.log(`[OK] ${check.name} status=${response.status}`);
      }

      reportChecks.push(entry);
    } catch (error) {
      failures += 1;
      contractFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      reportChecks.push({
        name: check.name,
        path: check.path,
        status: null,
        expectedStatuses: check.statuses,
        statusOk: false,
        contentType: '',
        bodyPreview: '',
        contractEvaluated: false,
        contractOk: false,
        contractErrors: [message],
      });
      console.error(`[FAIL] ${check.name} error=${message}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary: {
      okChecks: reportChecks.filter((item) => item.statusOk && item.contractOk).length,
      failChecks: failures,
      validatedContractChecks,
      contractFailChecks: contractFailures,
      enforceShape: ENFORCE_SHAPE,
      failOnContract: FAIL_ON_CONTRACT,
    },
    checks: reportChecks,
  };

  await writeReport(report);

  if (failures > 0) {
    console.error(`Smoke checks failed: ${failures}`);
    process.exit(1);
  }

  console.log('All smoke checks passed');
}

run().catch((error) => {
  console.error(`Unexpected failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
