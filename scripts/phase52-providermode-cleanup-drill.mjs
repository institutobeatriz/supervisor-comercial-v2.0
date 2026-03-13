/**
 * Phase 52 — Dead Config Cleanup Drill
 * Drills: cfg_providermode_ignored / contract_shape_intact /
 *         env_var_ignored / producer_regression
 *
 * Valida que cfg.providerMode foi removido de loadOperationalProvider()
 * sem quebrar contrato de saída nem regressão do producer.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { loadOperationalProvider, writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase52-providermode-cleanup-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase52-drill');
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

// ---------------------------------------------------------------------------
// Drill 1: cfg_providermode_ignored
// ---------------------------------------------------------------------------
async function drillCfgProviderModeIgnored() {
  console.log('\n[Drill 1] cfg_providermode_ignored — injetar providerMode=rogue_mode nao afeta contrato');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill1.json');
  const result = await loadOperationalProvider({
    providerMode: 'rogue_mode',
    materializeContract: true,
    contractFile: tmpFile,
    materializedBy: 'phase52-drill1',
  });
  const contract = await readJsonSafe(tmpFile);
  assert(contract !== null, 'contract file foi escrito');
  assert(
    contract.providerMode === 'materialized_contract',
    'contract.providerMode é materialized_contract (rogue_mode foi ignorado)',
    `got=${contract?.providerMode}`,
  );
  assert(result.contract !== null && typeof result.contract === 'object', 'result.contract retornado');
}

// ---------------------------------------------------------------------------
// Drill 2: contract_shape_intact
// ---------------------------------------------------------------------------
async function drillContractShapeIntact() {
  console.log('\n[Drill 2] contract_shape_intact — contrato de saída tem todos os campos obrigatórios');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill2.json');
  await loadOperationalProvider({
    materializeContract: true,
    contractFile: tmpFile,
    materializedBy: 'phase52-drill2',
  });
  const contract = await readJsonSafe(tmpFile);
  assert(contract !== null, 'contract file foi escrito');
  const REQUIRED = ['version', 'schema', 'providerMode', 'sources', 'summary', 'generatedAt'];
  for (const field of REQUIRED) {
    assert(field in contract, `contract.${field} presente`, `got=${JSON.stringify(contract?.[field])}`);
  }
  assert(contract.providerMode === 'materialized_contract', 'contract.providerMode === materialized_contract');
  assert(typeof contract.version === 'number', 'contract.version é numérico');
}

// ---------------------------------------------------------------------------
// Drill 3: env_var_ignored
// ---------------------------------------------------------------------------
async function drillEnvVarIgnored() {
  console.log('\n[Drill 3] env_var_ignored — env FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE=obsolete_mode é ignorada');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill3.json');
  const prevValue = process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE;
  process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE = 'obsolete_mode';
  try {
    await loadOperationalProvider({
      materializeContract: true,
      contractFile: tmpFile,
      materializedBy: 'phase52-drill3',
    });
    const contract = await readJsonSafe(tmpFile);
    assert(contract !== null, 'contract file foi escrito com env obsolete_mode definida');
    assert(
      contract.providerMode === 'materialized_contract',
      'contract.providerMode ainda é materialized_contract (env ignorada)',
      `got=${contract?.providerMode}`,
    );
  } finally {
    if (prevValue === undefined) {
      delete process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE;
    } else {
      process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE = prevValue;
    }
  }
}

// ---------------------------------------------------------------------------
// Drill 4: producer_regression
// ---------------------------------------------------------------------------
async function drillProducerRegression() {
  console.log('\n[Drill 4] producer_regression — producer subprocess não regride após remoção do cfg.providerMode');
  const reportFile = path.resolve(REPORT_DIR, 'producer-drill4.json');
  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE: 'synthetic',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, 'producer-drill4-dashboard.md'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, 'producer-drill4-audit.jsonl'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exitCode = null;
  await new Promise((resolve) => {
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { exitCode = code; resolve(); });
  });
  const report = await readJsonSafe(reportFile);
  assert(exitCode === 0, 'producer subprocess exits 0', `got=${exitCode}`);
  assert(report !== null, 'producer report foi escrito');
  assert(report.status === 'pass' || report.status === 'warn', 'producer report.status é pass ou warn', `got=${report?.status}`);
}

const drills = [
  { name: 'cfg_providermode_ignored', run: drillCfgProviderModeIgnored },
  { name: 'contract_shape_intact', run: drillContractShapeIntact },
  { name: 'env_var_ignored', run: drillEnvVarIgnored },
  { name: 'producer_regression', run: drillProducerRegression },
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
