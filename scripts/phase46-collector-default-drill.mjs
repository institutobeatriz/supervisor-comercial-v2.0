/**
 * Phase 46 - Collector Default Drill
 *
 * Validates that USE_COLLECTOR=true is now the default in the producer and
 * that the summary correctly exposes collectorEnabled/collectorMode.
 *
 * Drills:
 *   1. default_path   — producer runs without USE_COLLECTOR env; confirms collectorEnabled=true in summary
 *   2. bypass_path    — producer runs with USE_COLLECTOR=false; confirms collectorEnabled=false in summary
 *   3. summary_contract — verifies collectorEnabled and collectorMode fields are present in every run
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase46-collector-default-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase46-drill');
const PRODUCER_SCRIPT = path.resolve(__dirname, 'phase42-observability-operational-provider-producer.mjs');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runProducer(extraEnv = {}) {
  return new Promise((resolve) => {
    const reportFile = path.resolve(REPORT_DIR, `producer-${Date.now()}.json`);

    const child = spawn('node', [PRODUCER_SCRIPT], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: reportFile,
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, 'producer-dashboard.md'),
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, 'producer-audit.jsonl'),
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (status) => resolve({ status, stdout, stderr, reportFile }));
  });
}

async function readJsonSafe(filePath) {
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drill 1: default_path — no USE_COLLECTOR env → defaults to true
// ---------------------------------------------------------------------------

async function drillDefaultPath() {
  console.log('\n[Drill 1] default_path — producer without USE_COLLECTOR env (should default to true)');

  // Run producer with USE_COLLECTOR explicitly unset (delete from env)
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR') {
      env[k] = v;
    }
  }

  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...env,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: path.resolve(REPORT_DIR, 'default-report.json'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, 'default-dashboard.md'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, 'default-audit.jsonl'),
      FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE: 'synthetic',   // use synthetic so drill is deterministic without real files
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  await new Promise((resolve) => {
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', resolve);
  });

  const report = await readJsonSafe(path.resolve(REPORT_DIR, 'default-report.json'));

  assert(report !== null, 'producer report was written');
  assert(typeof report.summary === 'object', 'summary is present');
  assert(report.summary.collectorEnabled === true, 'summary.collectorEnabled is true (default)');
  assert(report.summary.collectorMode === 'synthetic', 'summary.collectorMode is synthetic (env override)');
  assert(report.summary.legacyFallbackState === 'disabled', 'legacy fallback still disabled (phase43 preserved)');
  assert(report.config.useCollector === true, 'config.useCollector is true');

  return report;
}

// ---------------------------------------------------------------------------
// Drill 2: bypass_path — USE_COLLECTOR=false → collector disabled
// ---------------------------------------------------------------------------

async function drillBypassPath() {
  console.log('\n[Drill 2] bypass_path — USE_COLLECTOR=false explicitly');

  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: path.resolve(REPORT_DIR, 'bypass-report.json'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, 'bypass-dashboard.md'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, 'bypass-audit.jsonl'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve) => {
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', resolve);
  });

  const report = await readJsonSafe(path.resolve(REPORT_DIR, 'bypass-report.json'));

  assert(report !== null, 'bypass producer report was written');
  assert(report.summary.collectorEnabled === false, 'summary.collectorEnabled is false when USE_COLLECTOR=false');
  assert(report.summary.collectorMode === 'disabled', 'summary.collectorMode is disabled when collector off');
  assert(report.config.useCollector === false, 'config.useCollector is false');

  return report;
}

// ---------------------------------------------------------------------------
// Drill 3: summary_contract — collectorEnabled and collectorMode always present
// ---------------------------------------------------------------------------

async function drillSummaryContract(defaultReport, bypassReport) {
  console.log('\n[Drill 3] summary_contract — collectorEnabled/collectorMode present in all reports');

  for (const [label, report] of [['default', defaultReport], ['bypass', bypassReport]]) {
    assert(
      Object.prototype.hasOwnProperty.call(report.summary, 'collectorEnabled'),
      `${label} report.summary has collectorEnabled field`,
    );
    assert(
      Object.prototype.hasOwnProperty.call(report.summary, 'collectorMode'),
      `${label} report.summary has collectorMode field`,
    );
    assert(
      typeof report.summary.collectorEnabled === 'boolean',
      `${label} report.summary.collectorEnabled is boolean`,
    );
    assert(
      typeof report.summary.collectorMode === 'string',
      `${label} report.summary.collectorMode is string`,
    );
    assert(
      Object.prototype.hasOwnProperty.call(report.config, 'useCollector'),
      `${label} report.config has useCollector field`,
    );
    assert(
      Object.prototype.hasOwnProperty.call(report.config, 'collectorMode'),
      `${label} report.config has collectorMode field`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n[${DRILL_NAME}] Starting...`);
  const ts = new Date().toISOString();

  const { mkdir } = await import('node:fs/promises');
  await mkdir(REPORT_DIR, { recursive: true });

  let defaultReport = null;
  let bypassReport = null;
  let errors = [];

  try {
    defaultReport = await drillDefaultPath();
  } catch (err) {
    console.error(`  ${err.message}`);
    errors.push({ drill: 'default_path', error: err.message });
  }

  try {
    bypassReport = await drillBypassPath();
  } catch (err) {
    console.error(`  ${err.message}`);
    errors.push({ drill: 'bypass_path', error: err.message });
  }

  if (defaultReport && bypassReport) {
    try {
      await drillSummaryContract(defaultReport, bypassReport);
    } catch (err) {
      console.error(`  ${err.message}`);
      errors.push({ drill: 'summary_contract', error: err.message });
    }
  }

  const passed = errors.length === 0;
  const status = passed ? 'pass' : 'fail';

  const drillReport = {
    generatedAt: ts,
    drill: DRILL_NAME,
    status,
    errors,
    contract: {
      schema: 'fullcycle.observability.phase46.collector-default.v1',
      collectorDefaultEnabled: defaultReport?.summary?.collectorEnabled === true,
      collectorBypassWorks: bypassReport?.summary?.collectorEnabled === false,
      summaryHasCollectorFields: passed,
    },
  };

  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), drillReport);
  await writeJson(path.resolve(REPORT_DIR, 'phase46-integration-contract.json'), drillReport.contract);

  console.log(`\n[${DRILL_NAME}] status=${status} errors=${errors.length}`);

  if (!passed) {
    for (const e of errors) {
      console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    }
    process.exit(1);
  }

  console.log(`[${DRILL_NAME}] All drills passed — collector is now the default producer path`);
}

main().catch((err) => {
  console.error(`[${DRILL_NAME}] Fatal:`, err);
  process.exit(1);
});
