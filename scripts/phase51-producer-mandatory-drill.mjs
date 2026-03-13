/**
 * Phase 51 — Producer Mandatory Enforcement Drill
 * Drills: producer_config_require_flags / producer_descriptor_enforcement /
 *         collector_mandatory_default / producer_status_pass
 *
 * Decisão formal: backend/producer é obrigatório sem fallback em todos os ambientes
 * desde a Fase 51. Este drill valida que o enforcement já está em vigor.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase51-producer-mandatory-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase51-drill');
const PRODUCER_SCRIPT = path.resolve(__dirname, 'phase42-observability-operational-provider-producer.mjs');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
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

async function runProducer(extraEnv = {}, reportSuffix = 'default') {
  const reportFile = path.resolve(REPORT_DIR, `producer-${reportSuffix}.json`);
  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE: 'synthetic',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, `producer-${reportSuffix}-dashboard.md`),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, `producer-${reportSuffix}-audit.jsonl`),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let status = null;
  await new Promise((resolve) => {
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { status = code; resolve(); });
  });
  const report = await readJsonSafe(reportFile);
  return { status, report, reportFile };
}

// ---------------------------------------------------------------------------
// Drill 1: producer_config_require_flags
// ---------------------------------------------------------------------------
async function drillProducerConfigRequireFlags() {
  console.log('\n[Drill 1] producer_config_require_flags — requireProvider=true, requireProducer=true in config');
  const { report } = await runProducer({}, 'drill1');
  assert(report !== null, 'producer report was written');
  assert(report.config !== undefined, 'report.config exists');
  assert(report.config.requireProvider === true, 'config.requireProvider is true');
  assert(report.config.requireProducer === true, 'config.requireProducer is true');
}

// ---------------------------------------------------------------------------
// Drill 2: producer_descriptor_enforcement
// ---------------------------------------------------------------------------
async function drillProducerDescriptorEnforcement() {
  console.log('\n[Drill 2] producer_descriptor_enforcement — legacyFallbackAllowed=false, legacyFallbackState=disabled, ready=true');
  const { report } = await runProducer({}, 'drill2');
  assert(report !== null, 'producer report was written');
  const descriptor = report.producer?.operationalProvider;
  assert(descriptor !== undefined && descriptor !== null, 'report.producer.operationalProvider exists');
  assert(descriptor.legacyFallbackAllowed === false, 'descriptor.legacyFallbackAllowed is false');
  assert(descriptor.legacyFallbackState === 'disabled', 'descriptor.legacyFallbackState is disabled');
  assert(descriptor.producerReady === true, 'descriptor.producerReady is true');
}

// ---------------------------------------------------------------------------
// Drill 3: collector_mandatory_default
// ---------------------------------------------------------------------------
async function drillCollectorMandatoryDefault() {
  console.log('\n[Drill 3] collector_mandatory_default — collectorEnabled=true, collectorMode in summary (default collector path)');
  const { report } = await runProducer({}, 'drill3');
  assert(report !== null, 'producer report was written');
  assert(typeof report.summary === 'object' && report.summary !== null, 'report.summary exists');
  assert(report.summary.collectorEnabled === true, 'summary.collectorEnabled is true (USE_COLLECTOR default=true)');
  assert(report.config.useCollector === true, 'config.useCollector is true');
  assert(typeof report.summary.collectorMode === 'string', 'summary.collectorMode is a string');
}

// ---------------------------------------------------------------------------
// Drill 4: producer_status_pass
// ---------------------------------------------------------------------------
async function drillProducerStatusPass() {
  console.log('\n[Drill 4] producer_status_pass — producer exits 0 and report.status === pass');
  const { status, report } = await runProducer({}, 'drill4');
  assert(status === 0, 'producer exits with code 0', `got ${status}`);
  assert(report !== null, 'producer report was written');
  assert(report.status === 'pass' || report.status === 'warn', 'report.status is pass or warn (no blocking violations)', `got ${report?.status}`);
}

const drills = [
  { name: 'producer_config_require_flags', run: drillProducerConfigRequireFlags },
  { name: 'producer_descriptor_enforcement', run: drillProducerDescriptorEnforcement },
  { name: 'collector_mandatory_default', run: drillCollectorMandatoryDefault },
  { name: 'producer_status_pass', run: drillProducerStatusPass },
];

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`[${DRILL_NAME}] Starting...\n`);

  const errors = [];
  for (const drill of drills) {
    console.log(`[Drill] ${drill.name}`);
    try {
      await drill.run();
    } catch (err) {
      errors.push({ drill: drill.name, error: err.message });
      console.error(`  ${err.message}`);
    }
    console.log();
  }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = { drillName: DRILL_NAME, status, errors, ts: new Date().toISOString() };
  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);

  console.log(`[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
