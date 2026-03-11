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

function nowIso() {
  return new Date().toISOString();
}

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
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

async function appendLines(filePath, lines) {
  if (!lines.length) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${lines.join('\n')}\n`, 'utf-8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeHistory(historyRaw) {
  const history = Array.isArray(historyRaw) ? historyRaw : [];
  return history
    .map((item) => ({
      timestamp: String(item?.timestamp || ''),
      status: String(item?.status || 'unknown').toLowerCase(),
      summary: item?.summary && typeof item.summary === 'object' ? item.summary : {},
    }))
    .filter((item) => item.timestamp)
    .sort((a, b) => parseMs(a.timestamp) - parseMs(b.timestamp));
}

function tail(arr, limit) {
  if (!Array.isArray(arr) || arr.length <= limit) return arr;
  return arr.slice(arr.length - limit);
}

function buildApiPayload({
  generatedAt,
  productizationStatus,
  productizationSummary,
  observabilityReport,
  observabilityFeed,
  retainedHistory,
  archive,
}) {
  const reportSummary = observabilityReport?.summary && typeof observabilityReport.summary === 'object'
    ? observabilityReport.summary
    : {};
  const feedSummary = observabilityFeed?.summary && typeof observabilityFeed.summary === 'object'
    ? observabilityFeed.summary
    : {};

  return {
    generatedAt,
    status: productizationStatus,
    productization: {
      summary: productizationSummary,
    },
    observability: {
      reportStatus: String(observabilityReport?.status || 'unknown').toLowerCase(),
      feedStatus: String(observabilityFeed?.status || 'unknown').toLowerCase(),
      summary: {
        ...reportSummary,
        ...feedSummary,
      },
    },
    history: {
      retainedEntries: retainedHistory.length,
      archiveEntriesWritten: archive.entriesWritten,
      retentionDays: productizationSummary.retentionDays,
      retentionMaxEntries: productizationSummary.retentionMaxEntries,
      latest: retainedHistory.length > 0 ? retainedHistory[retainedHistory.length - 1] : null,
    },
    links: {
      observabilityReportFile: productizationSummary.observabilityReportFile,
      observabilityFeedFile: productizationSummary.observabilityFeedFile,
      observabilityDashboardFile: productizationSummary.observabilityDashboardFile,
      observabilityStoreFile: productizationSummary.observabilityStoreFile,
      observabilityArchiveFile: productizationSummary.observabilityArchiveFile,
    },
  };
}

async function main() {
  const ts = nowIso();
  const nowMs = parseMs(ts);
  const cfg = {
    observabilityStoreFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-store.json'),
    observabilityReportFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-report.json'),
    observabilityFeedFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.json'),
    observabilityDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability.html'),
    observabilityArchiveFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-archive.jsonl'),
    observabilityApiPayloadFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-payload.json'),
    productizationReportFile: process.env.FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-productization-report.json'),
    productizationDashboardFile: process.env.FULLCYCLE_CONNECTOR_PRODUCTIZATION_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-productization.md'),
    productizationAuditFile: process.env.FULLCYCLE_CONNECTOR_PRODUCTIZATION_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-productization-audit.jsonl'),
    retentionDays: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_DAYS', 30)),
    retentionMaxEntries: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_MAX_ENTRIES', 1440)),
    apiHistoryLimit: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBSERVABILITY_API_HISTORY_LIMIT', 200)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_ENFORCE_TARGETS', false),
    requireObservabilityPass: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_OBSERVABILITY_PASS', true),
    requireFeed: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_FEED', true),
    requireDashboard: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_DASHBOARD', true),
    requireApiPayload: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_API_PAYLOAD', true),
    requireRetainedHistory: envBool('FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_HISTORY_AFTER_RETENTION', true),
  };

  const storeState = await readJson(cfg.observabilityStoreFile, { history: [] });
  const observabilityReport = await readJson(cfg.observabilityReportFile, null);
  const observabilityFeed = await readJson(cfg.observabilityFeedFile, null);
  const dashboardExists = await fileExists(cfg.observabilityDashboardFile);

  const history = normalizeHistory(storeState?.history);
  const cutoffMs = nowMs - (cfg.retentionDays * 24 * 60 * 60 * 1000);
  const retainedByAge = history.filter((item) => {
    const t = parseMs(item.timestamp);
    return Number.isFinite(t) && t >= cutoffMs;
  });
  const retainedHistory = tail(retainedByAge, cfg.retentionMaxEntries);
  const retainedSet = new Set(retainedHistory.map((item) => `${item.timestamp}:${item.status}:${JSON.stringify(item.summary || {})}`));

  const archivedEntries = history.filter((item) => !retainedSet.has(`${item.timestamp}:${item.status}:${JSON.stringify(item.summary || {})}`));
  await appendLines(
    cfg.observabilityArchiveFile,
    archivedEntries.map((item) => JSON.stringify({ archivedAt: ts, ...item })),
  );

  const trimmedStore = {
    version: 1,
    generatedAt: ts,
    lastStatus: retainedHistory.length > 0 ? retainedHistory[retainedHistory.length - 1].status : 'unknown',
    history: retainedHistory,
  };
  await writeJson(cfg.observabilityStoreFile, trimmedStore);

  const productizationSummary = {
    generatedAt: ts,
    observabilityStoreFile: cfg.observabilityStoreFile,
    observabilityReportFile: cfg.observabilityReportFile,
    observabilityFeedFile: cfg.observabilityFeedFile,
    observabilityDashboardFile: cfg.observabilityDashboardFile,
    observabilityArchiveFile: cfg.observabilityArchiveFile,
    observabilityApiPayloadFile: cfg.observabilityApiPayloadFile,
    retentionDays: cfg.retentionDays,
    retentionMaxEntries: cfg.retentionMaxEntries,
    historyOriginal: history.length,
    historyRetained: retainedHistory.length,
    historyArchived: archivedEntries.length,
    archiveEntriesWritten: archivedEntries.length,
    reportStatus: String(observabilityReport?.status || 'unknown').toLowerCase(),
    feedStatus: String(observabilityFeed?.status || 'unknown').toLowerCase(),
    dashboardExists,
  };

  const violations = [];
  if (cfg.requireObservabilityPass && productizationSummary.reportStatus !== 'pass') {
    violations.push({
      code: 'observability_report_not_pass',
      blocking: true,
      message: `observability report status is ${productizationSummary.reportStatus}, expected pass`,
    });
  }
  if (cfg.requireFeed && !observabilityFeed) {
    violations.push({
      code: 'observability_feed_missing',
      blocking: true,
      message: `observability feed not found at ${cfg.observabilityFeedFile}`,
    });
  }
  if (cfg.requireDashboard && !dashboardExists) {
    violations.push({
      code: 'observability_dashboard_missing',
      blocking: true,
      message: `observability dashboard not found at ${cfg.observabilityDashboardFile}`,
    });
  }
  if (cfg.requireRetainedHistory && retainedHistory.length === 0) {
    violations.push({
      code: 'observability_history_empty_after_retention',
      blocking: true,
      message: 'retention removed all observability history entries',
    });
  }

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const apiPayload = buildApiPayload({
    generatedAt: ts,
    productizationStatus: status,
    productizationSummary,
    observabilityReport,
    observabilityFeed,
    retainedHistory: tail(retainedHistory, cfg.apiHistoryLimit),
    archive: {
      entriesWritten: archivedEntries.length,
    },
  });

  if (cfg.requireApiPayload) {
    await writeJson(cfg.observabilityApiPayloadFile, apiPayload);
  }

  const report = {
    generatedAt: ts,
    status,
    summary: {
      ...productizationSummary,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
    },
    config: cfg,
    violations,
  };

  await writeJson(cfg.productizationReportFile, report);

  const dashboard = [];
  dashboard.push('# Fullcycle Connectors Productization');
  dashboard.push('');
  dashboard.push(`- Generated at: ${ts}`);
  dashboard.push(`- Status: ${status.toUpperCase()}`);
  dashboard.push(`- Observability report status: ${productizationSummary.reportStatus}`);
  dashboard.push(`- Feed status: ${productizationSummary.feedStatus}`);
  dashboard.push(`- Dashboard exists: ${dashboardExists ? 'yes' : 'no'}`);
  dashboard.push(`- History retained: ${productizationSummary.historyRetained}`);
  dashboard.push(`- History archived: ${productizationSummary.historyArchived}`);
  dashboard.push('');
  dashboard.push('| Item | Value |');
  dashboard.push('|---|---|');
  dashboard.push(`| Retention days | ${cfg.retentionDays} |`);
  dashboard.push(`| Retention max entries | ${cfg.retentionMaxEntries} |`);
  dashboard.push(`| API history limit | ${cfg.apiHistoryLimit} |`);
  dashboard.push(`| API payload written | ${cfg.requireApiPayload ? 'yes' : 'no'} |`);
  dashboard.push(`| Store file | ${cfg.observabilityStoreFile} |`);
  dashboard.push(`| Archive file | ${cfg.observabilityArchiveFile} |`);
  dashboard.push(`| API payload file | ${cfg.observabilityApiPayloadFile} |`);
  dashboard.push('');
  dashboard.push('## Violations');
  dashboard.push('');
  if (violations.length === 0) {
    dashboard.push('- none');
  } else {
    for (const item of violations) {
      dashboard.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
    }
  }
  dashboard.push('');
  await writeText(cfg.productizationDashboardFile, dashboard.join('\n'));

  await appendLines(cfg.productizationAuditFile, [
    JSON.stringify({
      timestamp: ts,
      source: 'phase25-observability-productization',
      status,
      summary: report.summary,
      violations,
      productizationReportFile: cfg.productizationReportFile,
    }),
  ]);

  console.log(`Connector productization report: ${cfg.productizationReportFile}`);
  console.log(`Connector productization dashboard: ${cfg.productizationDashboardFile}`);
  console.log(`Connector productization store: ${cfg.observabilityStoreFile}`);
  console.log(`Connector productization archive: ${cfg.observabilityArchiveFile}`);
  console.log(`Connector productization API payload: ${cfg.observabilityApiPayloadFile}`);
  console.log(`[CONNECTOR-PRODUCTIZATION] status=${status} retained=${productizationSummary.historyRetained} archived=${productizationSummary.historyArchived} violations=${violations.length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[CONNECTOR-PRODUCTIZATION] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase25 productization failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
