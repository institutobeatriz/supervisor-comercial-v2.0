/**
 * phase64-audit-suite-drill.mjs
 * Meta-drill: valida que todos os drills de auditoria (fases 57-63) passam.
 * Padrao: mesmo que phase54/55/56 para seus respectivos blocos.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DRILL_NAME = 'phase64-audit-suite';
const REPORT_DIR = 'logs/monitoring';

function assert(cond, msg) {
  if (!cond) throw new Error(`[FAIL] ${msg}`);
}

function writeJson(name, data) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function runNpmTest(script) {
  const result = spawnSync('npm', ['run', script], {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

async function main() {
  const results = [];
  let passed = 0;
  let failed = 0;

  const auditPhases = [57, 58, 59, 60, 61, 62, 63];

  for (const phase of auditPhases) {
    const drillName = `phase${phase}_pass`;
    const script = `test:phase${phase}`;
    console.log(`[${DRILL_NAME}] running ${script}...`);
    const { exitCode, stdout, stderr } = runNpmTest(script);
    const ok = exitCode === 0;
    if (ok) {
      console.log(`  [PASS] ${script} exited 0`);
      passed++;
    } else {
      console.error(`  [FAIL] ${script} exited ${exitCode}`);
      console.error(stderr || stdout);
      failed++;
    }
    results.push({ drill: drillName, script, exitCode, pass: ok });
  }

  writeJson(`${DRILL_NAME}-report`, {
    drill: DRILL_NAME,
    timestamp: new Date().toISOString(),
    total: auditPhases.length,
    passed,
    failed,
    results,
  });

  console.log(`\n[${DRILL_NAME}] ${passed}/${auditPhases.length} drills passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
