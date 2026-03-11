import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const MONITOR_SCRIPT = path.resolve(ROOT, 'scripts/phase10-monitoring-slo.mjs');
const CHAOS_DIR = path.resolve(ROOT, 'logs/monitoring/chaos');

async function readReport(reportFile) {
  const raw = await fs.readFile(reportFile, 'utf-8');
  return JSON.parse(raw);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function containsFailure(report, name) {
  return Array.isArray(report?.criticalFailures) && report.criticalFailures.some((f) => f.name === name);
}

function runScenario({
  name,
  env,
  expectedExitCode,
  expectedIncident,
  expectedFailureName,
}) {
  const reportFile = path.resolve(CHAOS_DIR, `${name}.report.json`);
  const stateFile = path.resolve(CHAOS_DIR, `${name}.state.json`);
  const incidentsFile = path.resolve(CHAOS_DIR, `${name}.incidents.json`);

  const runEnv = {
    ...process.env,
    MONITOR_STATE_FILE: stateFile,
    MONITOR_REPORT_FILE: reportFile,
    MONITOR_INCIDENTS_FILE: incidentsFile,
    MONITOR_HISTORY_SIZE: '20',
    MONITOR_MIN_SAMPLES_FOR_SLO: '1',
    ...env,
  };

  const result = spawnSync('node', [MONITOR_SCRIPT], {
    cwd: ROOT,
    env: runEnv,
    encoding: 'utf8',
  });

  const exitCode = result.status ?? 1;

  return {
    name,
    reportFile,
    stateFile,
    incidentsFile,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode,
    expectedExitCode,
    expectedIncident,
    expectedFailureName,
  };
}

function runRaw({
  env,
  reportFile,
  stateFile,
  incidentsFile,
}) {
  const runEnv = {
    ...process.env,
    MONITOR_STATE_FILE: stateFile,
    MONITOR_REPORT_FILE: reportFile,
    MONITOR_INCIDENTS_FILE: incidentsFile,
    MONITOR_HISTORY_SIZE: '20',
    MONITOR_MIN_SAMPLES_FOR_SLO: '1',
    ...env,
  };

  return spawnSync('node', [MONITOR_SCRIPT], {
    cwd: ROOT,
    env: runEnv,
    encoding: 'utf8',
  });
}

async function main() {
  await fs.mkdir(CHAOS_DIR, { recursive: true });

  const scenarios = [
    {
      name: 'baseline_healthy',
      env: {
        MONITOR_EXIT_ON_INCIDENT: 'true',
        MONITOR_DOCKER_WORKER_REQUIRED: 'false',
      },
      expectedExitCode: 0,
      expectedIncident: false,
      expectedFailureName: '',
    },
    {
      name: 'api_down_incident',
      env: {
        MONITOR_API_BASE: 'http://127.0.0.1:3999',
        MONITOR_EXIT_ON_INCIDENT: 'true',
        MONITOR_DOCKER_WORKER_REQUIRED: 'false',
      },
      expectedExitCode: 1,
      expectedIncident: true,
      expectedFailureName: 'api_health',
    },
    {
      name: 'worker_missing_incident',
      env: {
        MONITOR_EXIT_ON_INCIDENT: 'true',
        MONITOR_DOCKER_WORKER_REQUIRED: 'true',
        MONITOR_DOCKER_WORKER_CONTAINER: 'supervisor-worker-missing-chaos',
      },
      expectedExitCode: 1,
      expectedIncident: true,
      expectedFailureName: 'worker_container_health',
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(runScenario(scenario));
  }

  let failures = 0;

  for (const result of results) {
    let report = null;
    try {
      report = await readReport(result.reportFile);
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${result.name} unable to read report: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const exitOk = result.exitCode === result.expectedExitCode;
    const incidentOk = Boolean(report.incident) === result.expectedIncident;
    const failureOk = result.expectedFailureName
      ? containsFailure(report, result.expectedFailureName)
      : true;

    if (exitOk && incidentOk && failureOk) {
      console.log(`[OK] ${result.name} exit=${result.exitCode} incident=${report.incident}`);
      continue;
    }

    failures += 1;
    console.error(`[FAIL] ${result.name} exit=${result.exitCode} expectedExit=${result.expectedExitCode} incident=${report.incident} expectedIncident=${result.expectedIncident}`);
    if (!failureOk) {
      console.error(`[FAIL] ${result.name} expected critical failure "${result.expectedFailureName}" not found`);
    }
    if (result.stderr.trim()) {
      console.error(`[STDERR] ${result.name}: ${result.stderr.trim().slice(0, 300)}`);
    }
  }

  // Drill adicional: incidente abre e fecha corretamente no arquivo de incidentes
  {
    const name = 'incident_lifecycle';
    const reportFile = path.resolve(CHAOS_DIR, `${name}.report.json`);
    const stateFile = path.resolve(CHAOS_DIR, `${name}.state.json`);
    const incidentsFile = path.resolve(CHAOS_DIR, `${name}.incidents.json`);

    const stepDown = runRaw({
      reportFile,
      stateFile,
      incidentsFile,
      env: {
        MONITOR_API_BASE: 'http://127.0.0.1:3999',
        MONITOR_EXIT_ON_INCIDENT: 'false',
        MONITOR_DOCKER_WORKER_REQUIRED: 'false',
        MONITOR_MIN_SAMPLES_FOR_SLO: '99',
      },
    });

    if ((stepDown.status ?? 1) !== 0) {
      failures += 1;
      console.error(`[FAIL] ${name} stepDown expected exit 0 got ${stepDown.status}`);
    } else {
      const reportDown = await readJson(reportFile);
      if (!reportDown.incident) {
        failures += 1;
        console.error(`[FAIL] ${name} stepDown expected incident=true`);
      }
    }

    const stepRecover = runRaw({
      reportFile,
      stateFile,
      incidentsFile,
      env: {
        MONITOR_EXIT_ON_INCIDENT: 'false',
        MONITOR_DOCKER_WORKER_REQUIRED: 'false',
        MONITOR_MIN_SAMPLES_FOR_SLO: '99',
      },
    });

    if ((stepRecover.status ?? 1) !== 0) {
      failures += 1;
      console.error(`[FAIL] ${name} stepRecover expected exit 0 got ${stepRecover.status}`);
    } else {
      const reportRecover = await readJson(reportFile);
      if (reportRecover.incident) {
        failures += 1;
        console.error(`[FAIL] ${name} stepRecover expected incident=false`);
      }

      const incidentsData = await readJson(incidentsFile);
      const resolvedCount = Array.isArray(incidentsData.incidents)
        ? incidentsData.incidents.filter((inc) => inc.status === 'resolved').length
        : 0;
      if (resolvedCount < 1) {
        failures += 1;
        console.error(`[FAIL] ${name} expected at least one resolved incident`);
      } else {
        console.log(`[OK] ${name} resolved incidents=${resolvedCount}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`Chaos drills failed: ${failures}`);
    process.exit(1);
  }

  console.log('Chaos drills passed');
}

main().catch((error) => {
  console.error(`Unexpected chaos drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
