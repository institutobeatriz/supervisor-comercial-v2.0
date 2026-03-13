/**
 * Phase 55 — CI Gap Closure Early Phases Drill
 * Drills: phase14_pass through phase30_pass (17 drills)
 *
 * Meta-drill que valida que os testes phase14-30 passam como parte do CI.
 * Fecha o gap: esses testes existiam localmente mas não estavam no validateCommands.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase55-ci-gap-early-phases-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase55-drill');

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

function makeDrill(phaseNum) {
  return {
    name: `phase${phaseNum}_pass`,
    run: async () => {
      console.log(`\n[Drill] phase${phaseNum}_pass — npm run test:phase${phaseNum} exits 0`);
      const { exitCode, stderr } = await runNpmTest(`test:phase${phaseNum}`);
      assert(exitCode === 0, `test:phase${phaseNum} exits 0`, exitCode !== 0 ? `stderr=${stderr.slice(-300)}` : '');
    },
  };
}

const drills = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(makeDrill);

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`[${DRILL_NAME}] Starting... (${drills.length} drills)\n`);

  const errors = [];
  for (const drill of drills) {
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
