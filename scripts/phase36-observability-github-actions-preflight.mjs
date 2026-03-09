import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function tailLines(value, count = 40) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
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

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    child.on('error', (error) => resolve({ status: 1, signal: null, stdout, stderr: error.message }));
  });
}

function parseJson(output) {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function buildDashboard(report) {
  const lines = [
    '# Fase 36 - GitHub Actions Preflight',
    '',
    `- Gerado em: ${report.generatedAt}`,
    `- Status: ${String(report.status || 'unknown').toUpperCase()}`,
    `- Branch local: ${report.summary.branch || 'n/a'}`,
    `- Remote origin: ${report.summary.remoteOrigin || 'ausente'}`,
    `- Pronto para runner GitHub real: ${report.summary.readyForRealGithubRun ? 'sim' : 'nao'}`,
    '',
    '## Resumo',
    `- gh instalado: ${report.summary.ghInstalled ? 'sim' : 'nao'}`,
    `- gh autenticado: ${report.summary.ghAuthenticated ? 'sim' : 'nao'}`,
    `- Workflow CI encontrado: ${report.summary.ciWorkflowFound ? 'sim' : 'nao'}`,
    `- Ultimos runs consultados: ${report.summary.recentRunsCount}`,
    '',
    '## Bloqueios / observacoes',
  ];

  if (safeArray(report.violations).length === 0) {
    lines.push('- nenhum');
  } else {
    for (const violation of report.violations) {
      lines.push(`- ${violation.code}: ${violation.message}`);
    }
  }

  lines.push('', '## Comandos');
  lines.push(`- git branch --show-current`);
  lines.push(`- git config --get remote.origin.url`);
  lines.push(`- gh auth status`);
  if (report.summary.remoteOrigin) {
    lines.push(`- gh repo view --json nameWithOwner,url,visibility,defaultBranchRef`);
    lines.push(`- gh workflow list --json name,path,state`);
    lines.push(`- gh run list --workflow CI --limit 3 --json databaseId,status,conclusion,headBranch,url,createdAt,updatedAt`);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const reportFile = path.resolve(
    ROOT,
    envString('FULLCYCLE_CONNECTOR_OBS_GITHUB_PREFLIGHT_REPORT_FILE', 'logs/monitoring/fullcycle-connector-observability-github-preflight-report.json'),
  );
  const dashboardFile = path.resolve(
    ROOT,
    envString('FULLCYCLE_CONNECTOR_OBS_GITHUB_PREFLIGHT_DASHBOARD_FILE', 'docs/fullcycle-connectors-observability-github-preflight.md'),
  );
  const auditFile = path.resolve(
    ROOT,
    envString('FULLCYCLE_CONNECTOR_OBS_GITHUB_PREFLIGHT_AUDIT_FILE', 'logs/monitoring/fullcycle-connector-observability-github-preflight-audit.jsonl'),
  );

  const branchRun = await run('git', ['branch', '--show-current']);
  const remoteRun = await run('git', ['config', '--get', 'remote.origin.url']);
  const ghVersionRun = await run('gh', ['--version']);
  const ghAuthRun = ghVersionRun.status === 0 ? await run('gh', ['auth', 'status']) : { status: 1, stdout: '', stderr: 'gh not installed' };

  const remoteOrigin = String(remoteRun.stdout || '').trim();
  const branch = String(branchRun.stdout || '').trim();
  const ghInstalled = ghVersionRun.status === 0;
  const ghAuthenticated = ghAuthRun.status === 0;

  let repo = null;
  let workflows = [];
  let recentRuns = [];

  if (remoteOrigin && ghInstalled && ghAuthenticated) {
    const repoRun = await run('gh', ['repo', 'view', '--json', 'nameWithOwner,url,visibility,defaultBranchRef']);
    repo = parseJson(repoRun.stdout);

    const workflowRun = await run('gh', ['workflow', 'list', '--json', 'name,path,state']);
    workflows = safeArray(parseJson(workflowRun.stdout));

    const runsRun = await run('gh', ['run', 'list', '--workflow', 'CI', '--limit', '3', '--json', 'databaseId,status,conclusion,headBranch,url,createdAt,updatedAt']);
    recentRuns = safeArray(parseJson(runsRun.stdout));
  }

  const ciWorkflow = workflows.find((item) => String(item?.name || '').trim().toLowerCase() === 'ci');
  const violations = [];

  if (!ghInstalled) {
    violations.push({ code: 'gh_not_installed', blocking: true, message: 'GitHub CLI nao esta disponivel no ambiente local.' });
  }
  if (ghInstalled && !ghAuthenticated) {
    violations.push({ code: 'gh_not_authenticated', blocking: true, message: 'GitHub CLI nao esta autenticado para consultar repositorios/runs.' });
  }
  if (!remoteOrigin) {
    violations.push({ code: 'git_remote_missing', blocking: true, message: 'Nao existe remote origin configurado; sem remote nao ha como disparar/inspecionar GitHub Actions reais com este repo.' });
  }
  if (remoteOrigin && !ciWorkflow) {
    violations.push({ code: 'ci_workflow_missing', blocking: true, message: 'Remote presente, mas workflow CI nao foi encontrado via gh workflow list.' });
  }

  const readyForRealGithubRun = ghInstalled && ghAuthenticated && !!remoteOrigin && !!ciWorkflow;
  const status = readyForRealGithubRun ? 'pass' : (violations.some((item) => item.blocking) ? 'blocked' : 'warn');

  const report = {
    generatedAt,
    status,
    summary: {
      branch,
      remoteOrigin: remoteOrigin || null,
      ghInstalled,
      ghAuthenticated,
      ciWorkflowFound: !!ciWorkflow,
      recentRunsCount: recentRuns.length,
      readyForRealGithubRun,
    },
    repo,
    workflow: ciWorkflow || null,
    recentRuns,
    evidence: {
      gitBranch: { status: branchRun.status, stdoutTail: tailLines(branchRun.stdout, 10), stderrTail: tailLines(branchRun.stderr, 10) },
      gitRemote: { status: remoteRun.status, stdoutTail: tailLines(remoteRun.stdout, 10), stderrTail: tailLines(remoteRun.stderr, 10) },
      ghVersion: { status: ghVersionRun.status, stdoutTail: tailLines(ghVersionRun.stdout, 10), stderrTail: tailLines(ghVersionRun.stderr, 10) },
      ghAuth: { status: ghAuthRun.status, stdoutTail: tailLines(ghAuthRun.stdout, 20), stderrTail: tailLines(ghAuthRun.stderr, 20) },
    },
    violations,
    artifacts: {
      reportFile,
      dashboardFile,
      auditFile,
    },
  };

  await writeJson(reportFile, report);
  await writeText(dashboardFile, buildDashboard(report));
  await appendJsonl(auditFile, {
    timestamp: generatedAt,
    source: 'phase36-observability-github-actions-preflight',
    status,
    summary: report.summary,
    violations,
  });

  console.log(`Observability GitHub preflight report: ${reportFile}`);
  console.log(`Observability GitHub preflight dashboard: ${dashboardFile}`);
  console.log(`[OBS-GH-PREFLIGHT] status=${status} remote=${remoteOrigin ? 'present' : 'missing'} ghAuth=${ghAuthenticated ? 'yes' : 'no'} ciWorkflow=${ciWorkflow ? 'yes' : 'no'}`);
}

main().catch((error) => {
  console.error(`Unexpected phase36 GitHub preflight failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
