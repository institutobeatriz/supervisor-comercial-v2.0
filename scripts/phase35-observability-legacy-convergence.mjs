import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { publishHtmlAssets } from './observability-html-assets.mjs';

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

function normalizeStatus(value, fallback = 'unknown') {
  const raw = String(value || fallback).trim().toLowerCase();
  if (['pass', 'warn', 'fail', 'ok', 'open', 'resolved', 'unknown'].includes(raw)) return raw;
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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

function mapAnalyticsHistory(entries, fallbackStatus, fallbackGeneratedAt) {
  return safeArray(entries)
    .map((entry) => ({
      timestamp: String(entry?.timestamp || fallbackGeneratedAt || '').trim(),
      status: normalizeStatus(fallbackStatus),
      summary: {
        environment: entry?.environment || null,
        openIncidents: Number(entry?.openIncidents || 0),
        activeAlerts: Number(entry?.activeAlerts || 0),
        ownerCoveragePct: Number.isFinite(Number(entry?.ownerCoveragePct)) ? Number(entry.ownerCoveragePct) : null,
        unassignedOwners: Number.isFinite(Number(entry?.unassignedOwners)) ? Number(entry.unassignedOwners) : null,
        breachedEscalations: Number.isFinite(Number(entry?.breachedEscalations)) ? Number(entry.breachedEscalations) : null,
        teamsTracked: safeArray(entry?.teams).length,
        criticalOpenIncidents: Number(entry?.severity?.incidents?.criticalOpen || 0),
        criticalActiveAlerts: Number(entry?.severity?.alerts?.criticalActive || 0),
      },
    }))
    .filter((entry) => entry.timestamp);
}

function buildLegacyStore(ts, backendStore, backendReport, backendAnalytics) {
  const history = mapAnalyticsHistory(
    backendAnalytics?.entries,
    backendReport?.status || backendStore?.status || 'unknown',
    backendAnalytics?.generatedAt || backendStore?.generatedAt || ts,
  );

  return {
    version: 2,
    generatedAt: ts,
    lastStatus: normalizeStatus(backendReport?.status || backendStore?.status || 'unknown'),
    source: 'backend_first_compat',
    history,
  };
}

function buildLegacyReport(ts, backendStore, backendReport, backendAnalytics, legacyStore) {
  return {
    generatedAt: ts,
    status: normalizeStatus(backendReport?.status || backendStore?.status || 'unknown'),
    source: 'backend_first_compat',
    summary: {
      ...(backendReport?.summary && typeof backendReport.summary === 'object' ? backendReport.summary : {}),
      environment: backendReport?.summary?.environment || backendStore?.summary?.environment || null,
      teamsTracked: safeArray(backendStore?.teams).length,
      incidentsTracked: safeArray(backendStore?.incidents).length,
      alertsTracked: safeArray(backendStore?.alerts).length,
      historyPoints: safeArray(legacyStore?.history).length,
      ownerCoveragePct: backendAnalytics?.current?.ownerCoveragePct ?? backendStore?.summary?.ownerCoveragePct ?? null,
      unassignedOwners: backendAnalytics?.current?.unassignedOwners ?? backendStore?.summary?.unassignedOwners ?? null,
      breachedEscalations: backendAnalytics?.current?.breachedEscalations ?? backendStore?.summary?.breachedEscalations ?? null,
      compatibilityMode: 'materialized_from_backend_first',
    },
    backend: {
      reportStatus: normalizeStatus(backendReport?.status || backendStore?.status || 'unknown'),
      analyticsStatus: backendAnalytics?.current ? 'available' : 'missing',
    },
  };
}

function buildLegacyFeed(ts, legacyReport, backendStore, backendReport, backendAnalytics) {
  return {
    generatedAt: ts,
    status: normalizeStatus(legacyReport?.status || 'unknown'),
    source: 'backend_first_compat',
    summary: {
      ...(legacyReport?.summary || {}),
    },
    teams: safeArray(backendStore?.teams),
    incidents: safeArray(backendStore?.incidents),
    alerts: safeArray(backendStore?.alerts),
    analytics: {
      current: backendAnalytics?.current || null,
      totalEntries: safeArray(backendAnalytics?.entries).length,
    },
    links: {
      backendReportGeneratedAt: backendReport?.generatedAt || null,
      backendStoreGeneratedAt: backendStore?.generatedAt || null,
    },
  };
}

function buildApiPayload(ts, legacyReport, legacyFeed, legacyStore, cfg) {
  return {
    generatedAt: ts,
    status: normalizeStatus(legacyReport?.status || 'unknown'),
    productization: {
      summary: {
        compatibilityMode: 'materialized_from_backend_first',
        historyRetained: safeArray(legacyStore?.history).length,
        historyArchived: 0,
        observabilityReportFile: cfg.observabilityReportFile,
        observabilityFeedFile: cfg.observabilityFeedFile,
        observabilityDashboardFile: cfg.observabilityDashboardFile,
        observabilityStoreFile: cfg.observabilityStoreFile,
        observabilityArchiveFile: cfg.observabilityArchiveFile,
      },
    },
    observability: {
      reportStatus: normalizeStatus(legacyReport?.status || 'unknown'),
      feedStatus: normalizeStatus(legacyFeed?.status || 'unknown'),
      summary: legacyReport?.summary || {},
    },
    history: {
      retainedEntries: safeArray(legacyStore?.history).length,
      archiveEntriesWritten: 0,
      retentionDays: null,
      retentionMaxEntries: safeArray(legacyStore?.history).length,
      latest: safeArray(legacyStore?.history).length > 0 ? legacyStore.history[legacyStore.history.length - 1] : null,
    },
    links: {
      observabilityReportFile: cfg.observabilityReportFile,
      observabilityFeedFile: cfg.observabilityFeedFile,
      observabilityDashboardFile: cfg.observabilityDashboardFile,
      observabilityStoreFile: cfg.observabilityStoreFile,
      observabilityArchiveFile: cfg.observabilityArchiveFile,
    },
  };
}

function renderDashboard(ts, legacyReport, legacyFeed, backendStore, backendDashboardMarkdown) {
  const teams = safeArray(backendStore?.teams);
  const incidents = safeArray(backendStore?.incidents);
  const alerts = safeArray(backendStore?.alerts);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Observability Connectors Executive Dashboard</title>
  <link rel="stylesheet" href="./assets/fullcycle-connectors-observability-compat.css" />
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Observability Connectors Executive Dashboard</h1>
      <div class="meta">Generated at <strong>${escapeHtml(ts)}</strong> | Source <strong>backend_first_compat</strong></div>
    </section>

    <section class="grid">
      <article class="card"><div class="label">Status</div><div class="value">${escapeHtml(String(legacyReport?.status || 'unknown').toUpperCase())}</div></article>
      <article class="card"><div class="label">Teams</div><div class="value">${teams.length}</div></article>
      <article class="card"><div class="label">Incidents</div><div class="value">${incidents.length}</div></article>
      <article class="card"><div class="label">Alerts</div><div class="value">${alerts.length}</div></article>
    </section>

    <section class="section">
      <h2>Observability Summary</h2>
      <pre>${escapeHtml(JSON.stringify(legacyFeed?.summary || {}, null, 2))}</pre>
    </section>

    <section class="section">
      <h2>Team Routing</h2>
      <table>
        <thead>
          <tr><th>Team</th><th>Open incidents</th><th>Active alerts</th><th>Pending escalations</th><th>Owners</th></tr>
        </thead>
        <tbody>
          ${teams.length === 0
            ? '<tr><td colspan="5">No team data available</td></tr>'
            : teams.map((team) => `<tr><td>${escapeHtml(team.team)}</td><td>${team.openIncidents}</td><td>${team.activeAlerts}</td><td>${team.pendingEscalations}</td><td>${escapeHtml(safeArray(team.owners).join(', ') || 'n/a')}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Backend Dashboard Snapshot</h2>
      <pre>${escapeHtml(backendDashboardMarkdown || 'backend dashboard unavailable')}</pre>
    </section>
  </div>
</body>
</html>`;
}

async function main() {
  const ts = new Date().toISOString();
  const cfg = {
    phase40Script: path.resolve(process.cwd(), 'scripts/phase40-observability-operational-source-health.mjs'),
    skipBackendBoot: envBool('FULLCYCLE_CONNECTOR_OBS_COMPAT_SKIP_BACKEND_BOOT', false),
    backendStoreFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json')),
    backendReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json')),
    backendDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-backend.md')),
    backendAnalyticsFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-analytics.json')),
    observabilityStoreFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-store.json')),
    observabilityReportFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-report.json')),
    observabilityFeedFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.json')),
    observabilityDashboardFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.html')),
    observabilityApiPayloadFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-payload.json')),
    observabilityArchiveFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-archive.jsonl')),
    observabilityAuditFile: envString('FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-audit.jsonl')),
    compatReportFile: envString('FULLCYCLE_CONNECTOR_OBS_COMPAT_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-compat-report.json')),
    compatDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_COMPAT_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-compat.md')),
    compatAuditFile: envString('FULLCYCLE_CONNECTOR_OBS_COMPAT_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-compat-audit.jsonl')),
    historyLimit: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_COMPAT_HISTORY_LIMIT', 400)),
    requireLegacy200Ready: envBool('FULLCYCLE_CONNECTOR_OBS_COMPAT_REQUIRE_LEGACY_READY', true),
  };

  let backendRun = null;
  if (!cfg.skipBackendBoot) {
    const backendEnv = { ...process.env };
    if (!Object.prototype.hasOwnProperty.call(process.env, 'FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE')) {
      backendEnv.FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE = 'false';
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, 'FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT')) {
      backendEnv.FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT = 'false';
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, 'FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT')) {
      backendEnv.FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT = 'false';
    }

    backendRun = await runNode(cfg.phase40Script, backendEnv);
    if ((backendRun.status ?? 1) !== 0) {
      if (backendRun.stdout.trim()) process.stdout.write(backendRun.stdout);
      if (backendRun.stderr.trim()) process.stderr.write(backendRun.stderr);
      throw new Error(`phase40 backend run failed with status=${backendRun.status}`);
    }
  }

  const [backendStore, backendReport, backendAnalytics, backendDashboardExists] = await Promise.all([
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.backendReportFile, null),
    readJson(cfg.backendAnalyticsFile, null),
    fileExists(cfg.backendDashboardFile),
  ]);
  const backendDashboardMarkdown = backendDashboardExists
    ? await fs.readFile(cfg.backendDashboardFile, 'utf-8')
    : '';

  const violations = [];
  if (!backendStore) {
    violations.push({ code: 'backend_store_missing', blocking: true, message: `backend store missing at ${cfg.backendStoreFile}` });
  }
  if (!backendReport) {
    violations.push({ code: 'backend_report_missing', blocking: true, message: `backend report missing at ${cfg.backendReportFile}` });
  }
  if (!backendAnalytics) {
    violations.push({ code: 'backend_analytics_missing', blocking: true, message: `backend analytics missing at ${cfg.backendAnalyticsFile}` });
  }
  if (!backendDashboardExists) {
    violations.push({ code: 'backend_dashboard_missing', blocking: true, message: `backend dashboard missing at ${cfg.backendDashboardFile}` });
  }

  const blockingPreconditions = violations.filter((item) => item.blocking);
  if (blockingPreconditions.length > 0) {
    const failure = {
      generatedAt: ts,
      status: 'fail',
      summary: {
        compatibilityMode: 'materialized_from_backend_first',
        message: 'backend-first prerequisites unavailable',
      },
      config: cfg,
      violations,
    };
    await writeJson(cfg.compatReportFile, failure);
    await appendLine(cfg.compatAuditFile, JSON.stringify({
      timestamp: ts,
      source: 'phase35-observability-legacy-convergence',
      status: 'fail',
      summary: failure.summary,
      violations,
    }));
    for (const item of blockingPreconditions) {
      console.error(`[OBS-COMPAT] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }

  const legacyStore = buildLegacyStore(ts, backendStore, backendReport, backendAnalytics);
  legacyStore.history = legacyStore.history.slice(-cfg.historyLimit);
  const legacyReport = buildLegacyReport(ts, backendStore, backendReport, backendAnalytics, legacyStore);
  const legacyFeed = buildLegacyFeed(ts, legacyReport, backendStore, backendReport, backendAnalytics);
  const apiPayload = buildApiPayload(ts, legacyReport, legacyFeed, legacyStore, cfg);
  const dashboardHtml = renderDashboard(ts, legacyReport, legacyFeed, backendStore, backendDashboardMarkdown);

  await writeJson(cfg.observabilityStoreFile, legacyStore);
  await writeJson(cfg.observabilityReportFile, legacyReport);
  await writeJson(cfg.observabilityFeedFile, legacyFeed);
  await writeJson(cfg.observabilityApiPayloadFile, apiPayload);
  await writeText(cfg.observabilityDashboardFile, dashboardHtml);
  await publishHtmlAssets({
    htmlFile: cfg.observabilityDashboardFile,
    assets: [
      {
        sourceFile: 'scripts/assets/fullcycle-connectors-observability-compat.css',
        fileName: 'fullcycle-connectors-observability-compat.css',
      },
    ],
  });
  await appendLine(cfg.observabilityAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase35-observability-legacy-convergence',
    status: legacyReport.status,
    summary: legacyReport.summary,
    compatibilityMode: 'materialized_from_backend_first',
  }));

  const generatedFiles = [
    cfg.observabilityStoreFile,
    cfg.observabilityReportFile,
    cfg.observabilityFeedFile,
    cfg.observabilityApiPayloadFile,
    cfg.observabilityDashboardFile,
  ];
  for (const filePath of generatedFiles) {
    if (!(await fileExists(filePath))) {
      violations.push({
        code: 'compat_output_missing',
        blocking: true,
        message: `expected generated file missing at ${filePath}`,
      });
    }
  }

  const status = violations.some((item) => item.blocking) ? 'fail' : 'pass';
  const compatReport = {
    generatedAt: ts,
    status,
    summary: {
      compatibilityMode: 'materialized_from_backend_first',
      backendStatus: normalizeStatus(backendReport?.status || backendStore?.status || 'unknown'),
      legacyStatus: legacyReport.status,
      teamsTracked: safeArray(backendStore?.teams).length,
      incidentsTracked: safeArray(backendStore?.incidents).length,
      alertsTracked: safeArray(backendStore?.alerts).length,
      historyPoints: safeArray(legacyStore?.history).length,
      generatedFiles: generatedFiles.length,
      backendBootedInRun: !cfg.skipBackendBoot,
    },
    config: cfg,
    files: {
      backendStoreFile: cfg.backendStoreFile,
      backendReportFile: cfg.backendReportFile,
      backendDashboardFile: cfg.backendDashboardFile,
      backendAnalyticsFile: cfg.backendAnalyticsFile,
      observabilityStoreFile: cfg.observabilityStoreFile,
      observabilityReportFile: cfg.observabilityReportFile,
      observabilityFeedFile: cfg.observabilityFeedFile,
      observabilityApiPayloadFile: cfg.observabilityApiPayloadFile,
      observabilityDashboardFile: cfg.observabilityDashboardFile,
    },
    backendRun,
    violations,
  };

  const compatDashboard = [
    '# Fullcycle Connectors Observability Compatibility',
    '',
    `- Generated at: ${ts}`,
    `- Status: ${status.toUpperCase()}`,
    `- Compatibility mode: materialized_from_backend_first`,
    `- Backend status: ${compatReport.summary.backendStatus}`,
    `- Legacy status: ${compatReport.summary.legacyStatus}`,
    '',
    '## Files generated',
    `- Store: ${cfg.observabilityStoreFile}`,
    `- Report: ${cfg.observabilityReportFile}`,
    `- Feed: ${cfg.observabilityFeedFile}`,
    `- API payload: ${cfg.observabilityApiPayloadFile}`,
    `- Dashboard: ${cfg.observabilityDashboardFile}`,
    '',
    '## Summary',
    `- Teams tracked: ${compatReport.summary.teamsTracked}`,
    `- Incidents tracked: ${compatReport.summary.incidentsTracked}`,
    `- Alerts tracked: ${compatReport.summary.alertsTracked}`,
    `- History points: ${compatReport.summary.historyPoints}`,
    '',
    '## Violations',
    ...(violations.length === 0
      ? ['- none']
      : violations.map((item) => `- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`)),
    '',
  ].join('\n');

  await writeJson(cfg.compatReportFile, compatReport);
  await writeText(cfg.compatDashboardFile, compatDashboard);
  await appendLine(cfg.compatAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase35-observability-legacy-convergence',
    status,
    summary: compatReport.summary,
    violations,
  }));

  console.log(`Observability compatibility report: ${cfg.compatReportFile}`);
  console.log(`Observability compatibility dashboard: ${cfg.compatDashboardFile}`);
  console.log(`[OBS-COMPAT] status=${status} teams=${compatReport.summary.teamsTracked} incidents=${compatReport.summary.incidentsTracked} alerts=${compatReport.summary.alertsTracked} history=${compatReport.summary.historyPoints}`);

  if (status === 'fail') {
    for (const item of violations.filter((entry) => entry.blocking)) {
      console.error(`[OBS-COMPAT] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase35 compatibility failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});

