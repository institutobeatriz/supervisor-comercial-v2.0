/**
 * Phase 56 — Standalone Sync CI Drill
 * Drills: phase37_pass
 *
 * Valida que test:phase37 (standalone sync drill) passa como parte do CI.
 * Fecha o último gap de CI: phase37 testa o mecanismo de sync idempotente.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase56-standalone-sync-ci-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase56-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function runNpmTest(scriptName) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', scriptName], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Drill 1: phase37_pass
// ---------------------------------------------------------------------------
async function drillPhase37() {
  console.log('\n[Drill 1] phase37_pass — npm run test:phase37 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase37');
  assert(exitCode === 0, 'test:phase37 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-300)}` : '');
  console.log('  [INFO] standalone sync drill valida: apply idempotente, drift detectado, delete stale');
}

const drills = [
  { name: 'phase37_pass', run: drillPhase37 },
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
