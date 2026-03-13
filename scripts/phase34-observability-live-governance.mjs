import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const PHASE33_SCRIPT = path.resolve(ROOT, 'scripts/phase33-observability-live-runtime-validation.mjs');
const DEFAULT_OUTPUT_DIR = path.resolve(ROOT, 'logs/monitoring/phase34-live');
const REQUIRED_CHECKS = [
  'health',
  'ready',
  'observability_summary',
  'observability_feed',
  'observability_history',
  'observability_archive',
  'observability_dashboard',
  'observability_dashboard_asset_css',
  'observability_stream_once',
  'observability_api_sla_summary',
  'observability_api_sla_history',
  'observability_incidents_summary',
  'observability_incidents',
  'observability_alerts_summary',
  'observability_alerts',
  'observability_backend_summary',
  'observability_backend_provider',
  'observability_backend_producer',
  'observability_backend_report',
  'observability_backend_analytics',
  'observability_realtime_panel',
  'observability_realtime_panel_asset_css',
  'observability_realtime_panel_asset_js',
  'observability_backend_dashboard',
];

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function tailLines(value, count = 40) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function writeText(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, payload, 'utf-8');
}

async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasOwnEnv(name) {
  const raw = process.env[name];
  return !!(raw && raw.trim());
}

function resolveRuntimeProfile() {
  return envString(
    'FULLCYCLE_CONNECTOR_OBS_LIVE_RUNTIME_PROFILE',
    envBool('CI', false) || envBool('GITHUB_ACTIONS', false) ? 'ci' : 'desktop',
  );
}

function resolveOutputDir() {
  return path.resolve(ROOT, envString('FULLCYCLE_CONNECTOR_OBS_LIVE_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
}

function resolveBootDocker(runtimeProfile) {
  if (hasOwnEnv('FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA')) {
    return envBool('FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA', true);
  }
  return runtimeProfile !== 'ci';
}

function resolveBrowserArgs(runtimeProfile) {
  const explicit = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_ARGS', '');
  if (explicit) return explicit;
  if (runtimeProfile === 'ci' || process.platform === 'linux') {
    return '--no-sandbox,--disable-dev-shm-usage';
  }
  return '';
}

function mapRequiredChecks(smokeReport) {
  const byName = new Map(safeArray(smokeReport?.checks).map((item) => [item?.name, item]));
  return REQUIRED_CHECKS.map((name) => {
    const item = byName.get(name);
    if (!item) {
      return {
        name,
        status: 'missing',
        ok: false,
        reason: 'check missing from smoke report',
      };
    }

    const errors = safeArray(item.contractErrors).filter(Boolean);
    const ok = item.statusOk && item.contractOk !== false;
    const reason = ok
      ? 'ok'
      : [
          item.statusOk ? null : `unexpected status ${item.status}`,
          ...errors,
        ].filter(Boolean).join(' | ') || 'contract failed';

    return {
      name,
      status: ok ? 'pass' : 'fail',
      ok,
      httpStatus: item.status,
      contentType: item.contentType || '',
      contractEvaluated: !!item.contractEvaluated,
      reason,
    };
  });
}

function buildDashboard(report) {
  const lines = [
    '# Fase 34 - Observability Live Governance',
    '',
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Runtime profile: ${report.summary.runtimeProfile}`,
    `- Infra mode: ${report.summary.infraMode}`,
    `- API base: ${report.summary.apiBase || 'n/a'}`,
    '',
    '## Resumo executivo',
    `- Phase33 status: ${report.summary.phase33Status}`,
    `- Smoke OK: ${report.summary.smokeOkChecks}`,
    `- Smoke FAIL: ${report.summary.smokeFailChecks}`,
    `- Contratos validados: ${report.summary.smokeValidatedContractChecks} (minimo requerido: ${report.summary.requiredContractCoverageTarget})`,
    `- Falhas de contrato: ${report.summary.smokeContractFailChecks}`,
    `- Checks obrigatorios aprovados: ${report.summary.requiredChecksPassed}/${report.summary.requiredChecksTotal}`,
    `- Browser connection: ${report.summary.browserPanelConnection}`,
    `- Browser exceptions: ${report.summary.browserExceptions}`,
    `- Analytics endpoint: ${report.summary.analyticsStatus}`,
    '',
    '## Checks obrigatorios',
  ];

  for (const item of report.contracts.requiredChecks) {
    lines.push(`- ${item.name}: ${item.status}${item.reason && item.reason !== 'ok' ? ` (${item.reason})` : ''}`);
  }

  lines.push('', '## Artefatos');
  for (const [label, filePath] of Object.entries(report.artifacts)) {
    lines.push(`- ${label}: ${toRepoPath(filePath)}`);
  }

  lines.push('', '## Violacoes');
  if (safeArray(report.violations).length === 0) {
    lines.push('- nenhuma');
  } else {
    for (const violation of report.violations) {
      lines.push(`- ${violation.code}: ${violation.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
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
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

async function main() {
  const generatedAt = new Date().toISOString();
  const runtimeProfile = resolveRuntimeProfile();
  const outputDir = resolveOutputDir();
  const governanceReportFile = path.resolve(
    ROOT,
    envString(
      'FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_REPORT_FILE',
      'logs/monitoring/fullcycle-connector-observability-live-governance-report.json',
    ),
  );
  const governanceDashboardFile = path.resolve(
    ROOT,
    envString(
      'FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_DASHBOARD_FILE',
      'docs/fullcycle-connectors-observability-live-governance.md',
    ),
  );
  const governanceAuditFile = path.resolve(
    ROOT,
    envString(
      'FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_AUDIT_FILE',
      'logs/monitoring/fullcycle-connector-observability-live-governance-audit.jsonl',
    ),
  );
  const liveReportFile = path.resolve(outputDir, 'live-validation-report.json');
  const smokeReportFile = path.resolve(outputDir, 'smoke-report.json');
  const browserScreenshotFile = path.resolve(outputDir, 'panel-screenshot.png');
  const browserDomFile = path.resolve(outputDir, 'panel-dom.html');
  const browserLogFile = path.resolve(outputDir, 'browser.log');
  const apiLogFile = path.resolve(outputDir, 'api.log');

  const bootDocker = resolveBootDocker(runtimeProfile);
  const browserArgs = resolveBrowserArgs(runtimeProfile);
  const databaseUrl = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_DATABASE_URL', envString('DATABASE_URL', ''));
  const redisUrl = envString('FULLCYCLE_CONNECTOR_OBS_LIVE_REDIS_URL', envString('REDIS_URL', ''));

  const phase33Env = {
    FULLCYCLE_CONNECTOR_OBS_LIVE_OUTPUT_DIR: outputDir,
    FULLCYCLE_CONNECTOR_OBS_LIVE_RUNTIME_PROFILE: runtimeProfile,
    FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA: bootDocker ? 'true' : 'false',
  };

  if (browserArgs) phase33Env.FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_ARGS = browserArgs;
  if (databaseUrl) phase33Env.FULLCYCLE_CONNECTOR_OBS_LIVE_DATABASE_URL = databaseUrl;
  if (redisUrl) phase33Env.FULLCYCLE_CONNECTOR_OBS_LIVE_REDIS_URL = redisUrl;

  const violations = [];
  let phase33Run = null;

  try {
    phase33Run = await runNode(PHASE33_SCRIPT, phase33Env);
    const liveReport = await readJson(liveReportFile, null);
    const smokeReport = await readJson(smokeReportFile, liveReport?.runs?.smoke?.report || null);
    const requiredChecks = mapRequiredChecks(smokeReport);
    const requiredContractCoverageTarget = requiredChecks.filter((item) => item.httpStatus === 200 || item.contractEvaluated).length;
    const missingArtifacts = [];

    for (const item of [
      browserScreenshotFile,
      browserDomFile,
      browserLogFile,
      apiLogFile,
      liveReportFile,
      smokeReportFile,
    ]) {
      if (!(await fileExists(item))) missingArtifacts.push(item);
    }

    if ((phase33Run.status ?? 1) !== 0) {
      violations.push({
        code: 'phase33_live_validation_failed',
        blocking: true,
        message: `phase33 exited with status=${phase33Run.status}`,
      });
    }

    if (liveReport?.status !== 'pass') {
      violations.push({
        code: 'phase33_live_status_not_pass',
        blocking: true,
        message: `live validation status=${liveReport?.status || 'missing'}`,
      });
    }

    if (!smokeReport) {
      violations.push({
        code: 'phase34_smoke_report_missing',
        blocking: true,
        message: 'structured smoke report not found',
      });
    }

    if ((smokeReport?.summary?.contractFailChecks || 0) > 0) {
      violations.push({
        code: 'phase34_contract_failures_present',
        blocking: true,
        message: `smoke report has ${smokeReport.summary.contractFailChecks} contract failures`,
      });
    }

    const requiredFailures = requiredChecks.filter((item) => !item.ok);
    if (requiredFailures.length > 0) {
      violations.push({
        code: 'phase34_required_contract_checks_failed',
        blocking: true,
        message: requiredFailures.map((item) => `${item.name}: ${item.reason}`).join(' || '),
      });
    }

    if ((smokeReport?.summary?.validatedContractChecks || 0) < requiredContractCoverageTarget) {
      violations.push({
        code: 'phase34_contract_coverage_insufficient',
        blocking: true,
        message: `validatedContractChecks=${smokeReport?.summary?.validatedContractChecks || 0} required=${requiredContractCoverageTarget}`,
      });
    }

    if (missingArtifacts.length > 0) {
      violations.push({
        code: 'phase34_runtime_artifacts_missing',
        blocking: true,
        message: missingArtifacts.join(', '),
      });
    }

    if ((liveReport?.summary?.panelConnection || '') !== 'connected') {
      violations.push({
        code: 'phase34_browser_connection_not_connected',
        blocking: true,
        message: `panelConnection=${liveReport?.summary?.panelConnection || 'missing'}`,
      });
    }

    const upstreamViolations = safeArray(liveReport?.violations).map((item) => ({
      code: `phase33::${item.code}`,
      blocking: !!item.blocking,
      message: item.message,
    }));

    const blockingViolations = violations.filter((item) => item.blocking);
    const status = blockingViolations.length > 0 ? 'fail' : 'pass';

    const report = {
      generatedAt,
      status,
      summary: {
        runtimeProfile,
        infraMode: bootDocker ? 'docker-bootstrap' : 'external-services',
        phase33Status: liveReport?.status || 'missing',
        phase33ExitCode: phase33Run.status,
        apiBase: liveReport?.summary?.apiBase || null,
        browserPath: liveReport?.summary?.browserPath || null,
        browserArgs: liveReport?.summary?.browserArgs || (browserArgs ? browserArgs.split(',').filter(Boolean) : []),
        smokeOkChecks: liveReport?.summary?.smokeOkChecks ?? smokeReport?.summary?.okChecks ?? 0,
        smokeFailChecks: liveReport?.summary?.smokeFailChecks ?? smokeReport?.summary?.failChecks ?? 0,
        smokeValidatedContractChecks: liveReport?.summary?.smokeValidatedContractChecks ?? smokeReport?.summary?.validatedContractChecks ?? 0,
        smokeContractFailChecks: liveReport?.summary?.smokeContractFailChecks ?? smokeReport?.summary?.contractFailChecks ?? 0,
        requiredChecksTotal: REQUIRED_CHECKS.length,
        requiredChecksPassed: requiredChecks.filter((item) => item.ok).length,
        requiredContractCoverageTarget,
        browserPanelConnection: liveReport?.summary?.panelConnection || 'missing',
        browserExceptions: liveReport?.summary?.browserExceptions ?? null,
        analyticsStatus: liveReport?.summary?.analyticsStatus ?? null,
      },
      execution: {
        command: 'node scripts/phase33-observability-live-runtime-validation.mjs',
        exitCode: phase33Run.status,
        stdoutTail: tailLines(phase33Run.stdout, 50),
        stderrTail: tailLines(phase33Run.stderr, 50),
      },
      contracts: {
        requiredChecks,
      },
      upstream: {
        phase33Summary: liveReport?.summary || null,
        phase33Violations: upstreamViolations,
        smokeSummary: smokeReport?.summary || null,
      },
      artifacts: {
        outputDir,
        liveReportFile,
        smokeReportFile,
        browserScreenshotFile,
        browserDomFile,
        browserLogFile,
        apiLogFile,
        governanceReportFile,
        governanceDashboardFile,
        governanceAuditFile,
      },
      violations: [...upstreamViolations, ...violations],
    };

    await writeJson(governanceReportFile, report);
    await writeText(governanceDashboardFile, buildDashboard(report));
    await appendJsonl(governanceAuditFile, {
      timestamp: generatedAt,
      source: 'phase34-observability-live-governance',
      status,
      summary: report.summary,
      violations: report.violations,
    });

    console.log(`Observability live governance report: ${governanceReportFile}`);
    console.log(`Observability live governance dashboard: ${governanceDashboardFile}`);
    console.log(`[OBS-LIVE-GOV] status=${status} runtime=${report.summary.runtimeProfile} infra=${report.summary.infraMode} contracts=${report.summary.requiredChecksPassed}/${report.summary.requiredChecksTotal}`);

    if (status === 'fail') {
      for (const item of blockingViolations) {
        console.error(`[OBS-LIVE-GOV] ${item.code}: ${item.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    const failure = {
      generatedAt,
      status: 'fail',
      summary: {
        runtimeProfile,
        message: error instanceof Error ? error.message : String(error),
      },
      execution: phase33Run ? {
        command: 'node scripts/phase33-observability-live-runtime-validation.mjs',
        exitCode: phase33Run.status,
        stdoutTail: tailLines(phase33Run.stdout, 50),
        stderrTail: tailLines(phase33Run.stderr, 50),
      } : null,
      contracts: {
        requiredChecks: [],
      },
      artifacts: {
        outputDir,
        liveReportFile,
        smokeReportFile,
        browserScreenshotFile,
        browserDomFile,
        browserLogFile,
        apiLogFile,
        governanceReportFile,
        governanceDashboardFile,
        governanceAuditFile,
      },
      violations: [
        {
          code: 'phase34_live_governance_failed',
          blocking: true,
          message: error instanceof Error ? error.stack || error.message : String(error),
        },
      ],
    };

    await writeJson(governanceReportFile, failure);
    await writeText(governanceDashboardFile, buildDashboard(failure));
    await appendJsonl(governanceAuditFile, {
      timestamp: generatedAt,
      source: 'phase34-observability-live-governance',
      status: 'fail',
      summary: failure.summary,
      violations: failure.violations,
    });

    console.error(`Unexpected phase34 live governance failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase34 fatal failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
