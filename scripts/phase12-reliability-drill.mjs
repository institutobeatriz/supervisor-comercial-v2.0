import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const MONITOR_SCRIPT = path.resolve(ROOT, 'scripts/phase10-monitoring-slo.mjs');
const RELIABILITY_SCRIPT = path.resolve(ROOT, 'scripts/phase12-reliability-metrics.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase12-drill');

function runNode(scriptPath, env) {
  return spawnSync('node', [scriptPath], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const reportFile = path.resolve(DRILL_DIR, 'last-report.json');
  const stateFile = path.resolve(DRILL_DIR, 'slo-state.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'incidents.json');
  const reliabilityFile = path.resolve(DRILL_DIR, 'reliability-summary.json');

  const downRun = runNode(MONITOR_SCRIPT, {
    MONITOR_REPORT_FILE: reportFile,
    MONITOR_STATE_FILE: stateFile,
    MONITOR_INCIDENTS_FILE: incidentsFile,
    MONITOR_API_BASE: 'http://127.0.0.1:3999',
    MONITOR_DOCKER_WORKER_REQUIRED: 'false',
    MONITOR_EXIT_ON_INCIDENT: 'false',
    MONITOR_MIN_SAMPLES_FOR_SLO: '99',
  });
  if ((downRun.status ?? 1) !== 0) {
    console.error(`[FAIL] monitor down run expected exit 0, got ${downRun.status}`);
    process.exit(1);
  }

  const recoverRun = runNode(MONITOR_SCRIPT, {
    MONITOR_REPORT_FILE: reportFile,
    MONITOR_STATE_FILE: stateFile,
    MONITOR_INCIDENTS_FILE: incidentsFile,
    MONITOR_DOCKER_WORKER_REQUIRED: 'false',
    MONITOR_EXIT_ON_INCIDENT: 'false',
    MONITOR_MIN_SAMPLES_FOR_SLO: '99',
  });
  if ((recoverRun.status ?? 1) !== 0) {
    console.error(`[FAIL] monitor recover run expected exit 0, got ${recoverRun.status}`);
    process.exit(1);
  }

  const reliabilityRun = runNode(RELIABILITY_SCRIPT, {
    MONITOR_INCIDENTS_FILE: incidentsFile,
    RELIABILITY_REPORT_FILE: reliabilityFile,
    RELIABILITY_WINDOW_DAYS: '7',
    RELIABILITY_ENFORCE_TARGETS: 'false',
  });
  if ((reliabilityRun.status ?? 1) !== 0) {
    console.error(`[FAIL] reliability report expected exit 0, got ${reliabilityRun.status}`);
    process.exit(1);
  }

  const incidents = await readJson(incidentsFile);
  const reliability = await readJson(reliabilityFile);
  const resolved = Array.isArray(incidents.incidents)
    ? incidents.incidents.filter((inc) => inc.status === 'resolved')
    : [];

  if (resolved.length < 1) {
    console.error('[FAIL] expected at least one resolved incident in drill');
    process.exit(1);
  }

  if ((reliability?.totals?.resolvedIncidents ?? 0) < 1) {
    console.error('[FAIL] reliability summary did not count resolved incidents');
    process.exit(1);
  }

  console.log(`[OK] phase12 drill resolved incidents=${resolved.length}`);
  console.log(`[OK] phase12 drill MTTR avg min=${reliability?.mttr?.avgMin ?? 'n/a'} MTTD avg sec=${reliability?.mttd?.avgSec ?? 'n/a'}`);
}

main().catch((error) => {
  console.error(`Unexpected phase12 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
