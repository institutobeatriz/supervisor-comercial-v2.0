import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase22-connectors-readiness.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase22-drill');

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function runErrorDetails(run) {
  const stdout = run.stdout?.trim() || '';
  const stderr = run.stderr?.trim() || '';
  const details = [];
  if (stdout) details.push(`stdout: ${stdout}`);
  if (stderr) details.push(`stderr: ${stderr}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

function runtimeReportHealthy() {
  return {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    incident: false,
    connectors: [
      {
        key: 'itsm:jira',
        provider: 'jira',
        channel: 'ticket',
        runsSeen: 12,
        successRatePct: 99.4,
        timeoutRatePct: 0.5,
        httpErrorRatePct: 0.4,
        latencyWorstP95Ms: 1500,
        latencyAvgP95Ms: 900,
        contractErrors: 0,
      },
      {
        key: 'oncall:pagerduty',
        provider: 'pagerduty',
        channel: 'paging',
        runsSeen: 12,
        successRatePct: 99.1,
        timeoutRatePct: 0.3,
        httpErrorRatePct: 0.2,
        latencyWorstP95Ms: 1200,
        latencyAvgP95Ms: 700,
        contractErrors: 0,
      },
    ],
  };
}

function environmentsComplete() {
  return {
    version: 1,
    connectors: {
      'itsm:jira': {
        owner: 'platform-itsm',
        runbook: 'https://runbooks.example.com/itsm-jira',
        sandbox: {
          enabled: true,
          endpoint: 'https://sandbox.example.com/jira',
          credentialRef: 'JIRA_SANDBOX_TOKEN',
        },
        production: {
          enabled: true,
          endpoint: 'https://prod.example.com/jira',
          credentialRef: 'JIRA_PROD_TOKEN',
        },
      },
      'oncall:pagerduty': {
        owner: 'platform-oncall',
        runbook: 'https://runbooks.example.com/pagerduty',
        sandbox: {
          enabled: true,
          endpoint: 'https://sandbox.example.com/pagerduty',
          credentialRef: 'PD_SANDBOX_TOKEN',
        },
        production: {
          enabled: true,
          endpoint: 'https://prod.example.com/pagerduty',
          credentialRef: 'PD_PROD_TOKEN',
        },
      },
    },
  };
}

function environmentsIncomplete() {
  return {
    version: 1,
    connectors: {
      'itsm:jira': {
        owner: '',
        runbook: '',
        sandbox: {
          enabled: true,
          endpoint: '',
          credentialRef: '',
        },
        production: {
          enabled: false,
          endpoint: '',
          credentialRef: '',
        },
      },
    },
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const runtimeReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-runtime-report.json');
  const incidentsFile = path.resolve(DRILL_DIR, 'fullcycle-connector-incidents.json');
  const envFile = path.resolve(DRILL_DIR, 'connector-environments.json');
  const readinessReportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-readiness-report.json');
  const readinessDashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-readiness.md');
  const tuningOutputFile = path.resolve(DRILL_DIR, 'fullcycle-connector-thresholds-suggested.json');

  await fs.rm(readinessReportFile, { force: true });
  await fs.rm(readinessDashboardFile, { force: true });
  await fs.rm(tuningOutputFile, { force: true });

  await writeJson(runtimeReportFile, runtimeReportHealthy());
  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: null,
    incidents: [],
  });
  await writeJson(envFile, environmentsComplete());

  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: runtimeReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_ENVIRONMENTS_FILE: envFile,
    FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE: readinessReportFile,
    FULLCYCLE_CONNECTOR_READINESS_DASHBOARD_FILE: readinessDashboardFile,
    FULLCYCLE_CONNECTOR_TUNING_OUTPUT_FILE: tuningOutputFile,
    FULLCYCLE_CONNECTOR_READINESS_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_ALERTS: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_NO_ACTIVE_INCIDENT: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_SANDBOX: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_PROD: 'true',
    FULLCYCLE_CONNECTOR_READINESS_MIN_SAMPLES_FOR_TUNING: '3',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL: 'https://alerts.example.com/hooks/executive',
  });
  assert((passRun.status ?? 1) === 0, `phase22 pass run should exit 0${runErrorDetails(passRun)}`);

  const passReport = await readJson(readinessReportFile);
  const tuning = await readJson(tuningOutputFile);
  assert(passReport?.status === 'pass', `expected pass readiness status, got ${passReport?.status}`);
  assert((passReport?.violations || []).length === 0, 'expected no violations in pass readiness run');
  assert(Object.keys(tuning?.suggestions || {}).length === 2, 'expected tuning suggestions for 2 connectors');

  await writeJson(incidentsFile, {
    version: 1,
    activeIncidentId: 'conn-active-001',
    incidents: [
      {
        id: 'conn-active-001',
        status: 'open',
      },
    ],
  });
  await writeJson(envFile, environmentsIncomplete());

  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE: runtimeReportFile,
    FULLCYCLE_CONNECTOR_INCIDENTS_FILE: incidentsFile,
    FULLCYCLE_CONNECTOR_ENVIRONMENTS_FILE: envFile,
    FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE: readinessReportFile,
    FULLCYCLE_CONNECTOR_READINESS_DASHBOARD_FILE: readinessDashboardFile,
    FULLCYCLE_CONNECTOR_TUNING_OUTPUT_FILE: tuningOutputFile,
    FULLCYCLE_CONNECTOR_READINESS_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_ALERTS: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_NO_ACTIVE_INCIDENT: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_SANDBOX: 'true',
    FULLCYCLE_CONNECTOR_READINESS_REQUIRE_PROD: 'true',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL: '',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_SLACK_WEBHOOK_URL: '',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_DISCORD_WEBHOOK_URL: '',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_BOT_TOKEN: '',
    FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_CHAT_ID: '',
  });
  assert((failRun.status ?? 0) !== 0, `phase22 fail run should exit non-zero${runErrorDetails(failRun)}`);

  const failReport = await readJson(readinessReportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail readiness status, got ${failReport?.status}`);
  assert(codes.has('sandbox_incomplete') || codes.has('production_incomplete'), 'expected env profile violation');
  assert(codes.has('active_connector_incident'), 'expected active incident violation');
  assert(codes.has('no_executive_alert_channels'), 'expected missing alert channels violation');

  console.log('[OK] phase22 drill readiness pass/fail behavior validated');
  console.log(`[OK] phase22 drill report=${readinessReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase22 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
