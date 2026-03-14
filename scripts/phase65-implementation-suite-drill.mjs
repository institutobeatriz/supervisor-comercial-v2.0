/**
 * phase65-implementation-suite-drill.mjs
 * Meta-drill: valida que todos os drills do bloco de implementação (fases 43-56) passam.
 * Cobre: phase43, 44, 46-56 (phase45 é exclusão intencional — propagation via standalone).
 * Padrão: mesmo que phase54/55/56/64 para seus respectivos blocos.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DRILL_NAME = 'phase65-implementation-suite';
const REPORT_DIR = 'logs/monitoring';

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
  // phase45 excluded — propagation drill requires standalone CI infra, not runnable locally
  const implPhases = [43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const phase of implPhases) {
    const script = `test:phase${phase}`;
    console.log(`[${DRILL_NAME}] running ${script}...`);
    const { exitCode, stdout, stderr } = runNpmTest(script);
    const ok = exitCode === 0;
    if (ok) {
      console.log(`  [PASS] ${script} exited 0`);
      passed++;
    } else {
      console.error(`  [FAIL] ${script} exited ${exitCode}`);
      console.error((stderr || stdout).slice(0, 400));
      failed++;
    }
    results.push({ drill: `phase${phase}_pass`, script, exitCode, pass: ok });
  }

  writeJson(`${DRILL_NAME}-report`, {
    drill: DRILL_NAME,
    timestamp: new Date().toISOString(),
    total: implPhases.length,
    passed,
    failed,
    excluded: [45],
    exclusionReason: 'phase45 requires standalone CI propagation infra — not runnable locally',
    results,
  });

  console.log(`\n[${DRILL_NAME}] ${passed}/${implPhases.length} drills passed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
