/**
 * Phase 54 — CI Gap Closure Drill
 * Drills: phase38_pass / phase39_pass / phase40_pass / phase41_pass / phase42_pass
 *
 * Meta-drill que valida que os testes phase38-42 passam como parte do CI.
 * Fecha o gap: esses testes existiam localmente mas não estavam no validateCommands.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase54-ci-gap-closure-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase54-drill');

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
// Drill 1: phase38_pass
// ---------------------------------------------------------------------------
async function drillPhase38() {
  console.log('\n[Drill 1] phase38_pass — npm run test:phase38 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase38');
  assert(exitCode === 0, 'test:phase38 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 2: phase39_pass
// ---------------------------------------------------------------------------
async function drillPhase39() {
  console.log('\n[Drill 2] phase39_pass — npm run test:phase39 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase39');
  assert(exitCode === 0, 'test:phase39 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 3: phase40_pass
// ---------------------------------------------------------------------------
async function drillPhase40() {
  console.log('\n[Drill 3] phase40_pass — npm run test:phase40 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase40');
  assert(exitCode === 0, 'test:phase40 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 4: phase41_pass
// ---------------------------------------------------------------------------
async function drillPhase41() {
  console.log('\n[Drill 4] phase41_pass — npm run test:phase41 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase41');
  assert(exitCode === 0, 'test:phase41 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 5: phase42_pass
// ---------------------------------------------------------------------------
async function drillPhase42() {
  console.log('\n[Drill 5] phase42_pass — npm run test:phase42 exits 0 (collector disabled)');
  const { exitCode, stderr } = await runNpmTest('test:phase42');
  assert(exitCode === 0, 'test:phase42 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

const drills = [
  { name: 'phase38_pass', run: drillPhase38 },
  { name: 'phase39_pass', run: drillPhase39 },
  { name: 'phase40_pass', run: drillPhase40 },
  { name: 'phase41_pass', run: drillPhase41 },
  { name: 'phase42_pass', run: drillPhase42 },
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
