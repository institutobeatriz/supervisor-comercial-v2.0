import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase29-observability-realtime-panel.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase29-drill');

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

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

async function writeJsonl(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf-8');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const streamStateFile = path.resolve(DRILL_DIR, 'stream-state.json');
  const streamEventsFile = path.resolve(DRILL_DIR, 'stream-events.jsonl');
  const streamReportFile = path.resolve(DRILL_DIR, 'stream-report.json');
  const alertReportFile = path.resolve(DRILL_DIR, 'alert-report.json');
  const apiSlaHistoryFile = path.resolve(DRILL_DIR, 'api-sla-history.json');
  const panelReportFile = path.resolve(DRILL_DIR, 'panel-report.json');
  const panelDashboardFile = path.resolve(DRILL_DIR, 'panel-dashboard.html');
  const panelAuditFile = path.resolve(DRILL_DIR, 'panel-audit.jsonl');

  await fs.rm(panelReportFile, { force: true });
  await fs.rm(panelDashboardFile, { force: true });
  await fs.rm(panelAuditFile, { force: true });

  const now = Date.now();
  const iso = (offsetMs) => new Date(now + offsetMs).toISOString();

  const commonEnv = {
    FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE: streamStateFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE: streamEventsFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE: streamReportFile,
    FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE: alertReportFile,
    FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: apiSlaHistoryFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE: panelReportFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE: panelDashboardFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE: panelAuditFile,
    FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT: 'drill',
    FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE: 'http://127.0.0.1:3000',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_EVENTS: '1',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS: '3',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN: '180',
    FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN: '180',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS: 'true',
    FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS: 'true',
  };

  // PASS scenario
  await writeJson(streamStateFile, { generatedAt: iso(-60_000), status: 'pass', cursor: 15 });
  await writeJson(streamReportFile, { generatedAt: iso(-60_000), status: 'pass', summary: { cursor: 15 } });
  await writeJson(alertReportFile, { generatedAt: iso(-60_000), status: 'pass', summary: { activeIssues: 0 } });
  await writeJsonl(streamEventsFile, [
    { id: 'e1', timestamp: iso(-50_000), source: 'stream', environment: 'drill', severity: 'info', type: 'snapshot', status: 'ok', message: 'snapshot' },
    { id: 'e2', timestamp: iso(-40_000), source: 'governance', environment: 'drill', severity: 'warning', type: 'violation_opened', status: 'open', message: 'latency high' },
    { id: 'e3', timestamp: iso(-30_000), source: 'api_sla', environment: 'prod', severity: 'critical', type: 'threshold', status: 'fail', message: 'availability low' },
  ]);
  await writeJson(apiSlaHistoryFile, {
    generatedAt: iso(-30_000),
    history: [
      { timestamp: iso(-130_000), environment: 'drill', status: 'pass', availabilityPct: 99.9, worstLatencyMs: 180, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: iso(-110_000), environment: 'drill', status: 'pass', availabilityPct: 99.7, worstLatencyMs: 210, observedPayloadAgeMinutes: 1, blockingViolations: 0 },
      { timestamp: iso(-90_000), environment: 'drill', status: 'pass', availabilityPct: 99.5, worstLatencyMs: 230, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
      { timestamp: iso(-70_000), environment: 'drill', status: 'pass', availabilityPct: 99.6, worstLatencyMs: 200, observedPayloadAgeMinutes: 2, blockingViolations: 0 },
    ],
  });

  const passRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
  });
  assert((passRun.status ?? 1) === 0, `phase29 pass run should exit 0 (stderr=${passRun.stderr})`);
  const passReport = await readJson(panelReportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  const passHtml = await fs.readFile(panelDashboardFile, 'utf-8');
  assert(passHtml.includes('Connect SSE'), 'panel html should expose SSE action');
  assert(passHtml.includes('api-sla/history'), 'panel html should consume api-sla history endpoint');
  assert(passHtml.includes('source'), 'panel html should have source filter');
  assert(passHtml.includes('env'), 'panel html should have environment filter');
  assert(passHtml.includes('period'), 'panel html should have period filter');

  // FAIL scenario (strict)
  await writeJson(streamReportFile, { generatedAt: iso(-8 * 60 * 60 * 1000), status: 'fail', summary: { cursor: 15 } });
  await writeJson(alertReportFile, { generatedAt: iso(-8 * 60 * 60 * 1000), status: 'fail', summary: { activeIssues: 3 } });
  await writeJson(apiSlaHistoryFile, {
    generatedAt: iso(-8 * 60 * 60 * 1000),
    history: [{ timestamp: iso(-8 * 60 * 60 * 1000), environment: 'drill', status: 'fail', availabilityPct: 70, worstLatencyMs: 9000, observedPayloadAgeMinutes: 400, blockingViolations: 3 }],
  });

  const failRun = await runNode(SCRIPT, {
    ...commonEnv,
    FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
  });
  assert((failRun.status ?? 0) !== 0, 'phase29 fail run should exit non-zero');
  const failReport = await readJson(panelReportFile);
  const failCodes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(failCodes.has('stream_not_pass'), 'expected stream_not_pass');
  assert(failCodes.has('alerting_not_pass'), 'expected alerting_not_pass');
  assert(failCodes.has('api_sla_insufficient_points'), 'expected api_sla_insufficient_points');
  assert(failCodes.has('stream_stale'), 'expected stream_stale');
  assert(failCodes.has('api_sla_stale'), 'expected api_sla_stale');

  console.log('[OK] phase29 drill realtime panel pass/fail validated');
  console.log(`[OK] phase29 drill report=${panelReportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase29 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
