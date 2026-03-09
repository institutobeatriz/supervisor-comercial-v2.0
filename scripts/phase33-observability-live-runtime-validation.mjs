import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = process.cwd();

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function envInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function envList(name, fallback = []) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

let cachedWebSocketCtor = typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : null;

async function resolveWebSocketCtor() {
  if (cachedWebSocketCtor) return cachedWebSocketCtor;
  try {
    const wsModule = await import('ws');
    cachedWebSocketCtor = wsModule.WebSocket || wsModule.default || null;
  } catch {}

  if (!cachedWebSocketCtor) {
    throw new Error('WebSocket unavailable (install dependency "ws" or use a Node runtime with global WebSocket)');
  }

  return cachedWebSocketCtor;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function writeText(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, payload, 'utf-8');
}

async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

function runCommand(command, args, env, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
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

function normalizeBrowserPath() {
  const explicit = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_PATH', '');
  const candidates = [
    explicit,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates;
}

function resolveBrowserArgs() {
  const explicit = envList('FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_ARGS');
  if (explicit.length > 0) return explicit;

  if (process.platform === 'linux' || envBool('CI', false) || envBool('GITHUB_ACTIONS', false)) {
    return ['--no-sandbox', '--disable-dev-shm-usage'];
  }

  return [];
}

async function findBrowserPath() {
  for (const candidate of normalizeBrowserPath()) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10_000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchText(url, options);
  let data = null;
  try {
    data = JSON.parse(response.text);
  } catch {}
  return { ...response, data };
}

async function waitForHttp(url, expectedStatuses, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetchJson(url, { timeoutMs: 5_000 });
      if (expectedStatuses.includes(response.status)) return response;
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }
  throw lastError || new Error(`timeout waiting for ${url}`);
}

async function prepareFixtures(fixturesDir) {
  await ensureDir(fixturesDir);

  const files = {
    incidentsFile: path.resolve(fixturesDir, 'incidents.json'),
    operationsReportFile: path.resolve(fixturesDir, 'operations-report.json'),
    alertReportFile: path.resolve(fixturesDir, 'alert-report.json'),
    alertStateFile: path.resolve(fixturesDir, 'alert-state.json'),
    apiSlaHistoryFile: path.resolve(fixturesDir, 'api-sla-history.json'),
    streamStateFile: path.resolve(fixturesDir, 'stream-state.json'),
    streamReportFile: path.resolve(fixturesDir, 'stream-report.json'),
    streamEventsFile: path.resolve(fixturesDir, 'stream-events.jsonl'),
    backendStoreFile: path.resolve(fixturesDir, 'backend-store.json'),
    backendReportFile: path.resolve(fixturesDir, 'backend-report.json'),
    backendDashboardFile: path.resolve(fixturesDir, 'backend-dashboard.md'),
    backendAuditFile: path.resolve(fixturesDir, 'backend-audit.jsonl'),
    backendAnalyticsFile: path.resolve(fixturesDir, 'backend-analytics.json'),
    routeMatrixFile: path.resolve(fixturesDir, 'route-matrix.json'),
    rotationFile: path.resolve(fixturesDir, 'rotation.json'),
    calendarFile: path.resolve(fixturesDir, 'calendar.json'),
    incidentAutomationStateFile: path.resolve(fixturesDir, 'incident-automation-state.json'),
    itsmSnapshotFile: path.resolve(fixturesDir, 'itsm-snapshot.json'),
    fullcycleReportFile: path.resolve(fixturesDir, 'fullcycle-report.json'),
    observabilityStoreFile: path.resolve(fixturesDir, 'observability-store.json'),
    observabilityReportFile: path.resolve(fixturesDir, 'observability-report.json'),
    observabilityFeedFile: path.resolve(fixturesDir, 'observability-feed.json'),
    observabilityDashboardFile: path.resolve(fixturesDir, 'observability-dashboard.html'),
    observabilityApiPayloadFile: path.resolve(fixturesDir, 'observability-api-payload.json'),
    observabilityArchiveFile: path.resolve(fixturesDir, 'observability-archive.jsonl'),
    observabilityAuditFile: path.resolve(fixturesDir, 'observability-audit.jsonl'),
    compatReportFile: path.resolve(fixturesDir, 'compat-report.json'),
    compatDashboardFile: path.resolve(fixturesDir, 'compat-dashboard.md'),
    compatAuditFile: path.resolve(fixturesDir, 'compat-audit.jsonl'),
    panelReportFile: path.resolve(fixturesDir, 'panel-report.json'),
    panelDashboardFile: path.resolve(fixturesDir, 'panel-dashboard.html'),
    panelAuditFile: path.resolve(fixturesDir, 'panel-audit.jsonl'),
  };

  for (const filePath of Object.values(files)) {
    await fs.rm(filePath, { force: true });
  }

  await writeJson(files.routeMatrixFile, {
    version: 1,
    defaultTeam: 'comercial-ops',
    severity: {
      critical: { team: 'platform-oncall', channels: ['paging', 'itsm'], escalateAfterMinutes: 10 },
      warning: { team: 'comercial-ops', channels: ['slack'], escalateAfterMinutes: 30 },
      info: { team: 'comercial-ops', channels: ['dashboard'], escalateAfterMinutes: 120 },
    },
    sources: {
      api_sla: { team: 'platform-api', channels: ['slack', 'webhook'], escalateAfterMinutes: 15 },
      connectors_runtime: { team: 'integrations', channels: ['slack', 'webhook'], escalateAfterMinutes: 20 },
    },
  });
  await writeJson(files.incidentsFile, {
    version: 1,
    activeIncidentId: 'inc-open-1',
    incidents: [
      {
        id: 'inc-open-1',
        status: 'open',
        startedAt: '2026-03-02T14:00:00-03:00',
        detectedAt: '2026-03-02T14:05:00-03:00',
        severity: 'critical',
        maxSeverity: 'critical',
        violations: [{ connector: 'jira', code: 'timeout_rate', blocking: true, message: 'timeouts above target' }],
        alertEvents: [{ timestamp: '2026-03-02T14:10:00-03:00', attempts: [{ target: 'slack', ok: true }] }],
      },
    ],
  });
  await writeJson(files.incidentAutomationStateFile, {
    version: 1,
    updatedAt: '2026-03-03T10:05:00-03:00',
    incidents: {
      'inc-open-1': {
        owner: 'ops-integrations-primary',
        ownerAssignedAt: '2026-03-03T10:01:00-03:00',
        updatedAt: '2026-03-03T10:05:00-03:00',
        paging: {
          externalId: 'PD-inc-open-1',
        },
      },
    },
  });
  await writeJson(files.itsmSnapshotFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    paging: [
      {
        externalId: 'PD-inc-open-1',
        incidentId: 'inc-open-1',
        status: 'triggered',
        owner: 'snapshot-integrations-primary',
      },
    ],
    tickets: [],
  });
  await writeJson(files.fullcycleReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    status: 'pass',
    summary: {
      ownerCoveragePct: 100,
    },
  });
  await writeJson(files.operationsReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    summary: { environment: 'drill' },
    postmortems: [],
  });
  await writeJson(files.alertReportFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    status: 'pass',
    violations: [
      { source: 'connectors_runtime', code: 'latency_above_target', severity: 'warning', blocking: true, message: 'latency above target' },
    ],
    dispatch: {
      openedForDispatch: [{ source: 'connectors_runtime', code: 'latency_above_target', message: 'latency above target' }],
      resolvedForDispatch: [],
      deliveries: [{ channel: 'slack', attempted: true, ok: true, status: 200 }],
    },
  });
  await writeJson(files.alertStateFile, {
    version: 1,
    generatedAt: '2026-03-03T10:05:00-03:00',
    lastDispatchAt: '2026-03-03T10:05:00-03:00',
    openIssueKeys: ['connectors_runtime::latency_above_target'],
    lastIssueSentAt: { 'connectors_runtime::latency_above_target': '2026-03-03T10:05:00-03:00' },
  });
  await writeJson(files.apiSlaHistoryFile, {
    generatedAt: '2026-03-03T10:05:00-03:00',
    history: [
      { timestamp: '2026-03-03T09:50:00-03:00', environment: 'drill', status: 'pass', availabilityPct: 99.8, worstLatencyMs: 180, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: '2026-03-03T10:05:00-03:00', environment: 'drill', status: 'pass', availabilityPct: 99.6, worstLatencyMs: 250, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
    ],
  });
  await writeJson(files.streamStateFile, { generatedAt: '2026-03-03T10:05:00-03:00', status: 'pass', cursor: 12 });
  await writeJson(files.streamReportFile, { generatedAt: '2026-03-03T10:05:00-03:00', status: 'pass', summary: { cursor: 12 } });
  await fs.writeFile(files.streamEventsFile, [
    JSON.stringify({ id: 'evt-1', cursor: 11, timestamp: '2026-03-03T10:04:00-03:00', source: 'connectors_runtime', environment: 'drill', severity: 'warning', status: 'open', type: 'alert_opened', message: 'api latency above target' }),
    JSON.stringify({ id: 'evt-2', cursor: 12, timestamp: '2026-03-03T10:05:00-03:00', source: 'connectors_runtime', environment: 'drill', severity: 'critical', status: 'open', type: 'incident_detected', message: 'jira timeout rate breach' }),
  ].join('\n') + '\n', 'utf-8');

  return files;
}

function buildValidationEnv(files, reportFile, dashboardFile, auditFile, apiBase) {
  return {
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: files.incidentsFile,
    FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE: files.operationsReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE: files.alertReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE: files.alertStateFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: files.apiSlaHistoryFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: files.streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: files.streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE: files.streamEventsFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: files.backendStoreFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE: files.backendReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE: files.backendDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE: files.backendAuditFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE: files.backendAnalyticsFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE: files.routeMatrixFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE: files.rotationFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE: files.calendarFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE: files.incidentAutomationStateFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE: files.itsmSnapshotFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE: files.fullcycleReportFile,
    INCIDENT_AUTOMATION_STATE_FILE: files.incidentAutomationStateFile,
    ITSM_SNAPSHOT_FILE: files.itsmSnapshotFile,
    FULLCYCLE_REPORT_FILE: files.fullcycleReportFile,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS: '5',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER: 'false',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT: 'true',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT: '100',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES: '10',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE: files.observabilityStoreFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: files.observabilityReportFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE: files.observabilityFeedFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE: files.observabilityDashboardFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE: files.observabilityApiPayloadFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE: files.observabilityArchiveFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE: files.observabilityAuditFile,
    FULLCYCLE_CONNECTOR_OBS_COMPAT_REPORT_FILE: files.compatReportFile,
    FULLCYCLE_CONNECTOR_OBS_COMPAT_DASHBOARD_FILE: files.compatDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_COMPAT_AUDIT_FILE: files.compatAuditFile,
    FULLCYCLE_CONNECTOR_OBS_COMPAT_SKIP_BACKEND_BOOT: 'true',
    FULLCYCLE_CONNECTOR_OBS_COMPAT_REQUIRE_LEGACY_READY: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE: auditFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE: apiBase,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_AUTO_CONNECT: 'false',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REFRESH_MS: '10000',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS: '2',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '1',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN: '1000000',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN: '1000000',
  };
}

async function bootObservabilityArtifacts(env) {
  const backendRun = await runCommand('node', ['scripts/phase39-observability-backend-operational-oncall.mjs'], env);
  if ((backendRun.status ?? 1) !== 0) {
    throw new Error(`phase39 backend run failed: ${backendRun.stderr || backendRun.stdout}`.trim());
  }

  const compatRun = await runCommand('node', ['scripts/phase35-observability-legacy-convergence.mjs'], env);
  if ((compatRun.status ?? 1) !== 0) {
    throw new Error(`phase35 compatibility run failed: ${compatRun.stderr || compatRun.stdout}`.trim());
  }

  const panelRun = await runCommand('node', ['scripts/phase31-observability-panel-backend-integration.mjs'], env);
  if ((panelRun.status ?? 1) !== 0) {
    throw new Error(`phase31 panel run failed: ${panelRun.stderr || panelRun.stdout}`.trim());
  }

  return { backendRun, compatRun, panelRun };
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function summarizeSmokeOutput(output) {
  const lines = String(output || '').split(/\r?\n/);
  return {
    okChecks: lines.filter((line) => line.includes('[OK]')).length,
    failChecks: lines.filter((line) => line.includes('[FAIL]')).length,
    lines: lines.filter(Boolean).slice(-40),
  };
}

async function runSmoke(apiBase, adminKey, smokeReportFile) {
  const result = await runCommand('node', ['scripts/ci-api-smoke.mjs'], {
    CI_API_URL: apiBase,
    ADMIN_API_KEY: adminKey,
    CI_API_SMOKE_ENFORCE_SHAPE: 'true',
    CI_API_SMOKE_FAIL_ON_CONTRACT: 'true',
    CI_API_SMOKE_REPORT_FILE: smokeReportFile,
  });
  const report = await readJson(smokeReportFile, null);
  return {
    ...result,
    report,
    summary: report?.summary || summarizeSmokeOutput(`${result.stdout}\n${result.stderr}`),
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function ensureDockerReady(timeoutMs) {
  const version = await runCommand('docker', ['version'], {});
  if ((version.status ?? 1) === 0 && version.stdout.includes('Server:')) {
    return;
  }

  if (process.platform === 'win32') {
    const desktop = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
    try {
      await fs.access(desktop);
      const child = spawn(desktop, [], {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {}
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const retry = await runCommand('docker', ['version'], {});
    if ((retry.status ?? 1) === 0 && retry.stdout.includes('Server:')) return;
    await sleep(2_000);
  }

  throw new Error('docker engine unavailable for phase33 live validation');
}

async function waitForContainer(commandArgs, matcher, timeoutMs) {
  const startedAt = Date.now();
  let lastOutput = '';
  while (Date.now() - startedAt < timeoutMs) {
    const result = await runCommand('docker', commandArgs, {});
    lastOutput = `${result.stdout}\n${result.stderr}`.trim();
    if ((result.status ?? 1) === 0 && matcher(lastOutput)) return;
    await sleep(2_000);
  }
  throw new Error(`container readiness timeout for docker ${commandArgs.join(' ')} :: ${lastOutput}`);
}

async function startDockerInfra({ postgresPort, redisPort, timeoutMs }) {
  const postgresName = 'phase33-observability-postgres';
  const redisName = 'phase33-observability-redis';

  await runCommand('docker', ['rm', '-f', postgresName, redisName], {});

  const pgRun = await runCommand('docker', [
    'run', '-d', '--rm',
    '--name', postgresName,
    '-e', 'POSTGRES_USER=app',
    '-e', 'POSTGRES_PASSWORD=app',
    '-e', 'POSTGRES_DB=sales_supervisor',
    '-p', `${postgresPort}:5432`,
    'pgvector/pgvector:pg16',
  ], {});
  if ((pgRun.status ?? 1) !== 0) {
    throw new Error(`docker postgres failed: ${pgRun.stderr || pgRun.stdout}`.trim());
  }

  const redisRun = await runCommand('docker', [
    'run', '-d', '--rm',
    '--name', redisName,
    '-p', `${redisPort}:6379`,
    'redis:7-alpine',
    'redis-server', '--appendonly', 'yes', '--maxmemory', '256mb', '--maxmemory-policy', 'noeviction',
  ], {});
  if ((redisRun.status ?? 1) !== 0) {
    await runCommand('docker', ['rm', '-f', postgresName], {});
    throw new Error(`docker redis failed: ${redisRun.stderr || redisRun.stdout}`.trim());
  }

  await waitForContainer(['exec', postgresName, 'pg_isready', '-U', 'app', '-d', 'sales_supervisor'], (output) => output.includes('accepting connections'), timeoutMs);
  await waitForContainer(['exec', redisName, 'redis-cli', 'ping'], (output) => output.includes('PONG'), timeoutMs);

  return {
    postgresName,
    redisName,
    databaseUrl: `postgresql://app:app@127.0.0.1:${postgresPort}/sales_supervisor`,
    redisUrl: `redis://127.0.0.1:${redisPort}`,
    async stop() {
      await runCommand('docker', ['rm', '-f', postgresName, redisName], {});
    },
  };
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.seq = 0;
    this.pending = new Map();
    this.events = {
      console: [],
      exceptions: [],
      logEntries: [],
      loadFired: [],
    };
  }

  async connect() {
    const opened = createDeferred();
    const WebSocketCtor = await resolveWebSocketCtor();
    this.socket = new WebSocketCtor(this.wsUrl);

    const handleMessage = (message) => {
      const rawData = message?.data ?? message;
      const payload = JSON.parse(Buffer.isBuffer(rawData) ? rawData.toString('utf-8') : String(rawData));
      if (payload.id && this.pending.has(payload.id)) {
        const pending = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) pending.reject(new Error(payload.error.message || 'cdp error'));
        else pending.resolve(payload.result);
        return;
      }
      this.handleEvent(payload);
    };

    if (typeof this.socket.addEventListener === 'function') {
      this.socket.addEventListener('open', () => opened.resolve());
      this.socket.addEventListener('error', (event) => opened.reject(new Error(`cdp websocket error: ${event.message || event.error?.message || 'unknown'}`)));
      this.socket.addEventListener('message', handleMessage);
    } else {
      this.socket.on('open', () => opened.resolve());
      this.socket.on('error', (error) => opened.reject(new Error(`cdp websocket error: ${error?.message || 'unknown'}`)));
      this.socket.on('message', handleMessage);
    }

    await opened.promise;
  }

  handleEvent(payload) {
    if (payload.method === 'Runtime.consoleAPICalled') this.events.console.push(payload.params);
    if (payload.method === 'Runtime.exceptionThrown') this.events.exceptions.push(payload.params);
    if (payload.method === 'Log.entryAdded') this.events.logEntries.push(payload.params);
    if (payload.method === 'Page.loadEventFired') this.events.loadFired.push(payload.params);
  }
  async send(method, params = {}) {
    const id = ++this.seq;
    const deferred = createDeferred();
    this.pending.set(id, deferred);
    this.socket.send(JSON.stringify({ id, method, params }));
    return deferred.promise;
  }

  async close() {
    if (!this.socket) return;
    this.socket.close();
    await sleep(200);
  }
}

async function waitForBrowserDebug(port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetchJson(`http://127.0.0.1:${port}/json/version`, { timeoutMs: 2_000 });
      if (response.status === 200 && response.data?.Browser) return response.data;
    } catch {}
    await sleep(500);
  }
  throw new Error(`browser remote debugging unavailable on port ${port}`);
}

async function getFirstPageTarget(port) {
  const response = await fetchJson(`http://127.0.0.1:${port}/json/list`, { timeoutMs: 5_000 });
  const target = safeArray(response.data).find((item) => item?.type === 'page' && item?.webSocketDebuggerUrl);
  if (!target) throw new Error('no page target found in browser');
  return target;
}

async function waitForExpression(cdp, expression, timeoutMs) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    lastValue = result?.result?.value ?? null;
    if (lastValue && lastValue.ok) return lastValue;
    await sleep(500);
  }
  throw new Error(`expression timeout: ${JSON.stringify(lastValue)}`);
}

async function launchBrowserAndValidate({ browserPath, browserPort, browserArgs, pageUrl, baseUrl, adminKey, screenshotFile, domFile, logFile, timeoutMs, minTeams }) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phase33-browser-'));
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${browserPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    ...safeArray(browserArgs),
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browserStdout = '';
  let browserStderr = '';
  browser.stdout.on('data', (chunk) => { browserStdout += chunk.toString(); });
  browser.stderr.on('data', (chunk) => { browserStderr += chunk.toString(); });

  const version = await waitForBrowserDebug(browserPort, timeoutMs);
  const target = await getFirstPageTarget(browserPort);
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  let lastDom = '';
  let lastScreenshotData = '';
  try {
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.navigate', { url: pageUrl });

    await waitForExpression(cdp, `(() => ({
      ok: !!document.getElementById('adminKey')
        && !!document.getElementById('refresh')
        && !!document.getElementById('connect')
        && !!document.getElementById('activityLog')
        && String(document.getElementById('activityLog')?.textContent || '').includes('panel booted without embedded local payload'),
      readyState: document.readyState,
      hasAdminKey: !!document.getElementById('adminKey'),
      hasRefresh: !!document.getElementById('refresh'),
      hasConnect: !!document.getElementById('connect'),
      activityLog: String(document.getElementById('activityLog')?.textContent || ''),
      href: location.href,
      title: document.title
    }))()`, timeoutMs);
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        document.getElementById('apiBase').value = ${JSON.stringify(baseUrl)};
        document.getElementById('adminKey').value = ${JSON.stringify(adminKey)};
        document.getElementById('role').value = 'executive';
        document.getElementById('limit').value = '200';
        document.getElementById('period').value = 'all';
        document.getElementById('refresh').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.getElementById('connect').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const panelState = await waitForExpression(cdp, `(() => {
      const text = (id) => String(document.getElementById(id)?.textContent || '').trim();
      const log = String(document.getElementById('activityLog')?.textContent || '');
      const incidents = text('incidentsMeta');
      const alerts = text('alertsMeta');
      const sla = text('slaMeta');
      const conn = text('connState');
      const teams = document.querySelectorAll('#teamList .team-chip').length;
      const hasRefreshOk = log.includes('backend refresh ok');
      const hasSseConnected = log.includes('sse connected');
      return {
        ok: incidents !== 'waiting' && alerts !== 'waiting' && sla !== 'waiting' && conn === 'connected' && teams >= ${Math.max(0, Number(minTeams || 0))} && hasRefreshOk && hasSseConnected,
        incidentsMeta: incidents,
        alertsMeta: alerts,
        slaMeta: sla,
        connState: conn,
        teams,
        logTail: log.split('\\n').filter(Boolean).slice(-10)
      };
    })()`, timeoutMs);

    const domResult = await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
      awaitPromise: true,
    });
    lastDom = String(domResult?.result?.value || '');
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
    });
    lastScreenshotData = String(screenshot?.data || '');

    await writeText(domFile, lastDom);
    await ensureDir(path.dirname(screenshotFile));
    await fs.writeFile(screenshotFile, Buffer.from(lastScreenshotData, 'base64'));
    await writeText(logFile, [browserStdout, browserStderr].filter(Boolean).join('\n'));

    return {
      browserVersion: version.Browser,
      websocketUrl: target.webSocketDebuggerUrl,
      panelState,
      consoleEvents: cdp.events.console,
      exceptions: cdp.events.exceptions,
      logEntries: cdp.events.logEntries,
    };
  } catch (error) {
    try {
      const domResult = await cdp.send('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
        awaitPromise: true,
      });
      lastDom = String(domResult?.result?.value || lastDom || '');
    } catch {}

    try {
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
      });
      lastScreenshotData = String(screenshot?.data || lastScreenshotData || '');
    } catch {}

    if (lastDom) {
      await writeText(domFile, lastDom).catch(() => {});
    }
    if (lastScreenshotData) {
      await ensureDir(path.dirname(screenshotFile)).catch(() => {});
      await fs.writeFile(screenshotFile, Buffer.from(lastScreenshotData, 'base64')).catch(() => {});
    }
    await writeText(logFile, [browserStdout, browserStderr].filter(Boolean).join('\n')).catch(() => {});

    const exceptionMessages = cdp.events.exceptions
      .map((item) => item?.exceptionDetails?.text || item?.exceptionDetails?.exception?.description || 'runtime exception')
      .filter(Boolean)
      .slice(-5);
    const logMessages = cdp.events.logEntries
      .map((item) => item?.entry?.text || item?.entry?.source || 'log entry')
      .filter(Boolean)
      .slice(-5);
    const consoleMessages = cdp.events.console
      .map((item) => safeArray(item?.args).map((arg) => arg?.value ?? arg?.description ?? '').filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(-5);
    const suffix = JSON.stringify({
      exceptions: exceptionMessages,
      logEntries: logMessages,
      console: consoleMessages,
      browserLogFile: logFile,
      domFile,
      screenshotFile,
    });
    throw new Error(`${error instanceof Error ? error.message : String(error)} :: ${suffix}`);
  } finally {
    await cdp.close().catch(() => {});
    if (!browser.killed) browser.kill('SIGTERM');
    await sleep(300);
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function startApiServer({ port, host, adminKey, env, apiLogFile, timeoutMs }) {
  await ensureDir(path.dirname(apiLogFile));
  const logHandle = await fs.open(apiLogFile, 'w');
  const child = spawn('node', ['apps/api/dist/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      API_HOST: host,
      NODE_ENV: 'production',
      ADMIN_API_KEY: adminKey,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logHandle.appendFile(chunk).catch(() => {}); });
  child.stderr.on('data', (chunk) => { logHandle.appendFile(chunk).catch(() => {}); });

  const baseUrl = `http://${host}:${port}`;
  try {
    const health = await waitForHttp(`${baseUrl}/health`, [200], timeoutMs);
    const ready = await waitForHttp(`${baseUrl}/ready`, [200], timeoutMs);
    return {
      child,
      baseUrl,
      health: health.data,
      ready: ready.data,
      async stop() {
        if (!child.killed) child.kill('SIGTERM');
        await sleep(500);
        await logHandle.close();
      },
    };
  } catch (error) {
    if (!child.killed) child.kill('SIGTERM');
    await sleep(500);
    await logHandle.close();
    throw error;
  }
}

async function main() {
  const ts = new Date().toISOString();
  const artifactsDir = path.resolve(ROOT, envString('FULLCYCLE_CONNECTOR_OBS_LIVE_OUTPUT_DIR', 'logs/monitoring/phase33-live'));
  await fs.rm(artifactsDir, { recursive: true, force: true });
  await ensureDir(artifactsDir);
  const fixturesDir = path.resolve(artifactsDir, 'fixtures');
  const reportFile = path.resolve(artifactsDir, 'live-validation-report.json');
  const auditFile = path.resolve(artifactsDir, 'live-validation-audit.jsonl');
  const browserDomFile = path.resolve(artifactsDir, 'panel-dom.html');
  const browserScreenshotFile = path.resolve(artifactsDir, 'panel-screenshot.png');
  const browserLogFile = path.resolve(artifactsDir, 'browser.log');
  const apiLogFile = path.resolve(artifactsDir, 'api.log');
  const smokeReportFile = path.resolve(artifactsDir, 'smoke-report.json');
  const panelReportFile = path.resolve(artifactsDir, 'panel-report.json');
  const panelDashboardFile = path.resolve(artifactsDir, 'panel-dashboard.html');
  const panelAuditFile = path.resolve(artifactsDir, 'panel-audit.jsonl');
  const browserPort = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_DEBUG_PORT', 9223);
  const apiPort = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_API_PORT', 3100);
  const host = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_API_HOST', '127.0.0.1');
  const apiAdminKey = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_ADMIN_API_KEY', 'phase33-admin-key');
  const timeoutMs = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_TIMEOUT_MS', 120_000);
  const dockerTimeoutMs = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_TIMEOUT_MS', 180_000);
  const dockerEnabled = envBool('FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA', true);
  const dockerPgPort = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_PG_PORT', 15432);
  const dockerRedisPort = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_REDIS_PORT', 16379);
  const runtimeProfile = envString(
    'FULLCYCLE_CONNECTOR_OBS_LIVE_RUNTIME_PROFILE',
    envBool('CI', false) || envBool('GITHUB_ACTIONS', false) ? 'ci' : 'desktop',
  );
  const browserArgs = resolveBrowserArgs();
  const expectedPanelMinTeams = envInt('FULLCYCLE_CONNECTOR_OBS_LIVE_EXPECTED_PANEL_MIN_TEAMS', 1);
  const apiBase = `http://${host}:${apiPort}`;

  const violations = [];
  let apiServer = null;
  let infra = null;
  try {
    const browserPath = await findBrowserPath();
    if (!browserPath) {
      throw new Error('browser not found (set FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_PATH or install Edge/Chrome)');
    }

    if (dockerEnabled) {
      await ensureDockerReady(dockerTimeoutMs);
      infra = await startDockerInfra({
        postgresPort: dockerPgPort,
        redisPort: dockerRedisPort,
        timeoutMs: dockerTimeoutMs,
      });
    }

    const databaseUrl = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_DATABASE_URL', infra?.databaseUrl || 'postgresql://app:app@127.0.0.1:5432/sales_supervisor');
    const redisUrl = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_REDIS_URL', infra?.redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    const files = await prepareFixtures(fixturesDir);
    const validationEnv = buildValidationEnv(files, panelReportFile, panelDashboardFile, panelAuditFile, apiBase);

    const artifactRun = await bootObservabilityArtifacts(validationEnv);
    const compatReport = await readJson(files.compatReportFile, null);
    apiServer = await startApiServer({
      port: apiPort,
      host,
      adminKey: apiAdminKey,
      env: { ...validationEnv, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl },
      apiLogFile,
      timeoutMs,
    });

    const smoke = await runSmoke(apiServer.baseUrl, apiAdminKey, smokeReportFile);
    if ((smoke.status ?? 1) !== 0) {
      violations.push({
        code: 'live_api_smoke_failed',
        blocking: true,
        message: `ci-api-smoke failed with status=${smoke.status}`,
      });
    }
    if ((smoke.report?.summary?.contractFailChecks || 0) > 0) {
      violations.push({
        code: 'live_api_smoke_contract_failed',
        blocking: true,
        message: `ci-api-smoke found ${smoke.report.summary.contractFailChecks} contract failures`,
      });
    }
    if (compatReport?.status !== 'pass') {
      violations.push({
        code: 'legacy_compatibility_not_ready',
        blocking: true,
        message: `phase35 compatibility status=${compatReport?.status || 'unknown'}`,
      });
    }

    const browser = await launchBrowserAndValidate({
      browserPath,
      browserPort,
      browserArgs,
      pageUrl: `${apiServer.baseUrl}/api/observability/connectors/realtime/panel?role=operator&adminKey=${encodeURIComponent(apiAdminKey)}`,
      baseUrl: apiServer.baseUrl,
      adminKey: apiAdminKey,
      screenshotFile: browserScreenshotFile,
      domFile: browserDomFile,
      logFile: browserLogFile,
      timeoutMs,
      minTeams: expectedPanelMinTeams,
    });

    if (safeArray(browser.exceptions).length > 0) {
      violations.push({
        code: 'panel_runtime_exception',
        blocking: true,
        message: `browser runtime exceptions observed: ${browser.exceptions.length}`,
      });
    }

    const bootstrapAuthNoise = safeArray(browser.logEntries).filter((item) => {
      const entry = item?.entry || {};
      const text = String(entry.text || '');
      const url = String(entry.url || '');
      return entry.source === 'network'
        && text.includes('401')
        && /\/api\/observability\/connectors\/(incidents\/summary|incidents\?|alerts\/summary|alerts\?|api-sla\/summary)/.test(url);
    }).length;
    if (bootstrapAuthNoise > 0) {
      violations.push({
        code: 'panel_bootstrap_auth_noise',
        blocking: true,
        message: `panel emitted ${bootstrapAuthNoise} unauthorized bootstrap requests before authenticated refresh`,
      });
    }

    const panelState = browser.panelState || {};
    if (panelState.connState !== 'connected') {
      violations.push({
        code: 'panel_sse_not_connected',
        blocking: true,
        message: `panel connection state=${panelState.connState || 'unknown'}`,
      });
    }
    if (!String(panelState.incidentsMeta || '').includes('visible')) {
      violations.push({
        code: 'panel_incidents_not_loaded',
        blocking: true,
        message: `incidents meta=${panelState.incidentsMeta || 'unknown'}`,
      });
    }
    if (!String(panelState.alertsMeta || '').includes('visible')) {
      violations.push({
        code: 'panel_alerts_not_loaded',
        blocking: true,
        message: `alerts meta=${panelState.alertsMeta || 'unknown'}`,
      });
    }
    if (!String(panelState.slaMeta || '').includes('points')) {
      violations.push({
        code: 'panel_sla_not_loaded',
        blocking: true,
        message: `sla meta=${panelState.slaMeta || 'unknown'}`,
      });
    }

    const analytics = await fetchJson(`${apiServer.baseUrl}/api/observability/connectors/backend/analytics?limit=5`, {
      headers: {
        'x-admin-key': apiAdminKey,
        'x-observability-role': 'executive',
      },
      timeoutMs: 10_000,
    });
    if (analytics.status !== 200) {
      violations.push({
        code: 'backend_analytics_endpoint_failed',
        blocking: true,
        message: `backend analytics status=${analytics.status}`,
      });
    }

    const blockingViolations = violations.filter((item) => item.blocking);
    const status = blockingViolations.length > 0 ? 'fail' : 'pass';
    const report = {
      generatedAt: ts,
      status,
      summary: {
        apiBase: apiServer.baseUrl,
        runtimeProfile,
        browserPath,
        browserArgs,
        dockerInfra: dockerEnabled ? 'enabled' : 'disabled',
        infraMode: dockerEnabled ? 'docker-bootstrap' : 'external-services',
        dockerPgPort: dockerEnabled ? dockerPgPort : null,
        dockerRedisPort: dockerEnabled ? dockerRedisPort : null,
        databaseUrl,
        smokeOkChecks: smoke.summary.okChecks,
        smokeFailChecks: smoke.summary.failChecks,
        smokeValidatedContractChecks: smoke.summary.validatedContractChecks || 0,
        smokeContractFailChecks: smoke.summary.contractFailChecks || 0,
        legacyCompatStatus: compatReport?.status || 'unknown',
        legacyCompatMode: compatReport?.summary?.compatibilityMode || 'unknown',
        browserConsoleErrors: safeArray(browser.consoleEvents).length,
        browserExceptions: safeArray(browser.exceptions).length,
        browserBootstrapAuthNoise: bootstrapAuthNoise,
        panelConnection: panelState.connState || 'unknown',
        incidentsMeta: panelState.incidentsMeta || 'unknown',
        alertsMeta: panelState.alertsMeta || 'unknown',
        slaMeta: panelState.slaMeta || 'unknown',
        trackedTeams: panelState.teams || 0,
        analyticsStatus: analytics.status,
        analyticsEntries: analytics.data?.totalEntries || 0,
        analyticsCoveragePct: analytics.data?.current?.ownerCoveragePct ?? null,
      },
      api: {
        health: apiServer.health,
        ready: apiServer.ready,
        logFile: apiLogFile,
      },
      commands: {
        backend: 'node scripts/phase39-observability-backend-operational-oncall.mjs',
        compat: 'node scripts/phase35-observability-legacy-convergence.mjs',
        panel: 'node scripts/phase31-observability-panel-backend-integration.mjs',
        smoke: 'node scripts/ci-api-smoke.mjs',
      },
      runs: {
        backend: artifactRun.backendRun,
        compat: artifactRun.compatRun,
        panel: artifactRun.panelRun,
        smoke,
      },
      browser: {
        screenshotFile: browserScreenshotFile,
        domFile: browserDomFile,
        browserLogFile,
        panelState,
        consoleEvents: browser.consoleEvents,
        exceptions: browser.exceptions,
        logEntries: browser.logEntries,
      },
      analyticsEndpoint: {
        status: analytics.status,
        payload: analytics.data,
      },
      artifacts: {
        fixturesDir,
        reportFile,
        auditFile,
        smokeReportFile,
        panelReportFile,
        panelDashboardFile,
        panelAuditFile,
        compatReportFile: files.compatReportFile,
        compatDashboardFile: files.compatDashboardFile,
        compatAuditFile: files.compatAuditFile,
        observabilityStoreFile: files.observabilityStoreFile,
        observabilityReportFile: files.observabilityReportFile,
        observabilityFeedFile: files.observabilityFeedFile,
        observabilityDashboardFile: files.observabilityDashboardFile,
        observabilityApiPayloadFile: files.observabilityApiPayloadFile,
        observabilityAuditFile: files.observabilityAuditFile,
      },
      violations,
    };

    await writeJson(reportFile, report);
    await appendJsonl(auditFile, {
      timestamp: ts,
      source: 'phase33-observability-live-runtime-validation',
      status,
      summary: report.summary,
      violations,
    });

    console.log(`Observability live validation report: ${reportFile}`);
    console.log(`Observability live validation screenshot: ${browserScreenshotFile}`);
    console.log(`Observability live validation panel DOM: ${browserDomFile}`);
    console.log(`[OBS-LIVE] status=${status} smokeOk=${report.summary.smokeOkChecks} browserConn=${report.summary.panelConnection} analytics=${report.summary.analyticsStatus}`);

    if (status === 'fail') {
      for (const item of blockingViolations) {
        console.error(`[OBS-LIVE] ${item.code}: ${item.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    const failure = {
      generatedAt: ts,
      status: 'fail',
      summary: {
        message: error instanceof Error ? error.message : String(error),
        runtimeProfile,
      },
      violations: [
        {
          code: 'phase33_runtime_validation_failed',
          blocking: true,
          message: error instanceof Error ? error.stack || error.message : String(error),
        },
      ],
    };
    await writeJson(reportFile, failure);
    await appendJsonl(auditFile, {
      timestamp: ts,
      source: 'phase33-observability-live-runtime-validation',
      status: 'fail',
      summary: failure.summary,
      violations: failure.violations,
    });
    console.error(`Unexpected phase33 live validation failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  } finally {
    if (apiServer) {
      await apiServer.stop().catch(() => {});
    }
    if (infra) {
      await infra.stop().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(`Unexpected phase33 fatal failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
