import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase25-observability-productization.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase25-drill');

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function runErrorDetails(run) {
  const stdout = run.stdout?.trim() || '';
  const stderr = run.stderr?.trim() || '';
  const details = [];
  if (stdout) details.push(`stdout: ${stdout}`);
  if (stderr) details.push(`stderr: ${stderr}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

function observabilityStoreSample() {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    history: [
      {
        timestamp: '2026-01-01T10:00:00.000Z',
        status: 'warn',
        summary: { environmentsTracked: 1, connectorsTracked: 1 },
      },
      {
        timestamp: '2026-03-08T10:00:00.000Z',
        status: 'pass',
        summary: { environmentsTracked: 3, connectorsTracked: 2 },
      },
      {
        timestamp: '2026-03-09T10:00:00.000Z',
        status: 'pass',
        summary: { environmentsTracked: 3, connectorsTracked: 2 },
      },
    ],
  };
}

function observabilityReportPass() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: {
      environmentsTracked: 3,
      connectorsTracked: 2,
      postmortemLinkCoveragePct: 100,
      openCriticalIncidents: 0,
      postmortemSlaBreaches: 0,
    },
  };
}

function observabilityReportWarn() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'warn',
    summary: {
      environmentsTracked: 1,
      connectorsTracked: 1,
      postmortemLinkCoveragePct: 0,
      openCriticalIncidents: 2,
      postmortemSlaBreaches: 1,
    },
  };
}

function observabilityFeedSample() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    summary: {
      environmentsTracked: 3,
      connectorsTracked: 2,
    },
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const observabilityStoreFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-store.json');
  const observabilityReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-report.json');
  const observabilityFeedFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability.json');
  const observabilityDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability.html');
  const observabilityArchiveFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-archive.jsonl');
  const observabilityApiPayloadFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-payload.json');
  const productizationReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-productization-report.json');
  const productizationDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-productization.md');
  const productizationAuditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-productization-audit.jsonl');

  await fs.rm(observabilityArchiveFile, { force: true });
  await fs.rm(observabilityApiPayloadFile, { force: true });
  await fs.rm(productizationReportFile, { force: true });
  await fs.rm(productizationDashboardFile, { force: true });
  await fs.rm(productizationAuditFile, { force: true });

  await writeJson(observabilityStoreFile, observabilityStoreSample());
  await writeJson(observabilityReportFile, observabilityReportPass());
  await writeJson(observabilityFeedFile, observabilityFeedSample());
  await fs.writeFile(observabilityDashboardFile, '<html><body>ok</body></html>', 'utf-8');

  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE: observabilityStoreFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE: observabilityFeedFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE: observabilityDashboardFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE: observabilityArchiveFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE: observabilityApiPayloadFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE: productizationReportFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_DASHBOARD_FILE: productizationDashboardFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_AUDIT_FILE: productizationAuditFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_DAYS: '30',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_MAX_ENTRIES: '2',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_API_HISTORY_LIMIT: '50',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_OBSERVABILITY_PASS: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_FEED: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_DASHBOARD: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_API_PAYLOAD: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_HISTORY_AFTER_RETENTION: 'true',
  });
  assert((passRun.status ?? 1) === 0, `phase25 pass run should exit 0${runErrorDetails(passRun)}`);

  const passReport = await readJson(productizationReportFile);
  assert(passReport?.status === 'pass', `expected pass productization status, got ${passReport?.status}`);
  assert((passReport?.summary?.historyRetained || 0) >= 1, `expected retained history >= 1, got ${passReport?.summary?.historyRetained}`);
  assert((passReport?.summary?.historyArchived || 0) >= 1, `expected archived history >= 1, got ${passReport?.summary?.historyArchived}`);
  assert(await fileExists(observabilityApiPayloadFile), 'expected API payload file created in pass run');

  const storeAfterPass = await readJson(observabilityStoreFile);
  assert((storeAfterPass?.history || []).length <= 2, 'expected retention max entries enforced');

  await writeJson(observabilityStoreFile, { version: 1, generatedAt: new Date().toISOString(), history: [] });
  await writeJson(observabilityReportFile, observabilityReportWarn());
  await fs.rm(observabilityFeedFile, { force: true });
  await fs.rm(observabilityDashboardFile, { force: true });

  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE: observabilityStoreFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE: observabilityReportFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE: observabilityFeedFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE: observabilityDashboardFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE: observabilityArchiveFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE: observabilityApiPayloadFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE: productizationReportFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_DASHBOARD_FILE: productizationDashboardFile,
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_AUDIT_FILE: productizationAuditFile,
    FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_DAYS: '30',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_MAX_ENTRIES: '2',
    FULLCYCLE_CONNECTOR_OBSERVABILITY_API_HISTORY_LIMIT: '50',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_OBSERVABILITY_PASS: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_FEED: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_DASHBOARD: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_API_PAYLOAD: 'true',
    FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_HISTORY_AFTER_RETENTION: 'true',
  });
  assert((failRun.status ?? 0) !== 0, `phase25 fail run should exit non-zero${runErrorDetails(failRun)}`);

  const failReport = await readJson(productizationReportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail productization status, got ${failReport?.status}`);
  assert(codes.has('observability_report_not_pass'), 'expected observability_report_not_pass violation');
  assert(codes.has('observability_feed_missing'), 'expected observability_feed_missing violation');
  assert(codes.has('observability_dashboard_missing'), 'expected observability_dashboard_missing violation');
  assert(codes.has('observability_history_empty_after_retention'), 'expected observability_history_empty_after_retention violation');

  console.log('[OK] phase25 drill API payload productization, retention/archive and strict policy gates validated');
  console.log(`[OK] phase25 drill report=${productizationReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase25 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
