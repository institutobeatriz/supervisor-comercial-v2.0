import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadStandaloneExportConfig, summarizeCommandFailure, syncStandalone } from './phase37-standalone-sync.mjs';

const ROOT = process.cwd();
const DEFAULT_REPORT_FILE = path.resolve(
  ROOT,
  process.env.STANDALONE_EXPORT_PUBLISH_REPORT_FILE || 'logs/monitoring/standalone-export-publish-report.json',
);
const DEFAULT_AUDIT_FILE = path.resolve(
  ROOT,
  process.env.STANDALONE_EXPORT_PUBLISH_AUDIT_FILE || 'logs/monitoring/standalone-export-publish-audit.jsonl',
);

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function tail(value, count = 20) {
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
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
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

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function ensureBranchPrefix(branchName, prefix) {
  if (branchName.startsWith(prefix)) {
    return branchName;
  }
  return `${prefix}${branchName.replace(/^\/+/, '')}`;
}

async function mustRun(command, args, options = {}) {
  const result = await run(command, args, options);
  if ((result.status ?? 1) !== 0) {
    const detail = summarizeCommandFailure(result);
    throw new Error(`${command} ${args.join(' ')} failed with status=${detail.status} stderr=${detail.stderrTail.join(' | ') || 'n/a'}`);
  }
  return result;
}

async function resolveDefaultBranch(targetRoot, repo, fallback) {
  const ghResult = await run('gh', ['repo', 'view', repo, '--json', 'defaultBranchRef,url,nameWithOwner'], { cwd: targetRoot });
  const repoInfo = ghResult.status === 0 ? parseJson(ghResult.stdout) : null;
  return {
    repoInfo,
    defaultBranch: String(repoInfo?.defaultBranchRef?.name || fallback || 'master'),
  };
}

async function waitForRun(repo, branch, headSha, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listRun = await run(
      'gh',
      ['run', 'list', '--repo', repo, '--branch', branch, '--workflow', 'CI', '--limit', '10', '--json', 'databaseId,status,conclusion,url,headSha,headBranch,workflowName,displayTitle'],
      { cwd: ROOT },
    );
    if (listRun.status === 0) {
      const items = Array.isArray(parseJson(listRun.stdout)) ? parseJson(listRun.stdout) : [];
      const match = items.find((item) => String(item?.headSha || '') === headSha);
      if (match) {
        return match;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error(`Timed out waiting for CI run for branch=${branch} sha=${headSha}`);
}

function buildPrBody(context) {
  return [
    '## Contexto',
    '- Automacao da Fase 37 para sincronizar este workspace com o repo standalone publicado.',
    '- O objetivo desta PR e validar o fluxo canonico `sync -> branch -> push -> PR -> CI`.',
    '',
    '## Mudancas principais',
    '- configuracao declarativa do export standalone',
    '- script de sincronizacao idempotente com modo `--check`',
    '- script de publicacao com branch `codex/` e criacao de PR',
    '- documentacao do fluxo operacional canonico',
    '',
    '## Validacao local',
    ...context.validateCommands.map((command) => `- ${command}`),
    '',
    '## Observacao',
    '- Esta PR foi aberta automaticamente pela automacao da Fase 37.',
  ].join('\n');
}

export async function publishStandalone(options = {}) {
  const generatedAt = new Date().toISOString();
  const reportFile = options.reportFile ? path.resolve(ROOT, options.reportFile) : DEFAULT_REPORT_FILE;
  const auditFile = options.auditFile ? path.resolve(ROOT, options.auditFile) : DEFAULT_AUDIT_FILE;
  const config = await loadStandaloneExportConfig(options.configFile);
  const syncReport = await syncStandalone({
    configFile: options.configFile,
    mode: 'apply',
    reportFile: options.syncReportFile,
    auditFile: options.syncAuditFile,
  });

  const targetRoot = config.targetRoot;
  const gitDir = path.resolve(targetRoot, '.git');
  const gitExists = await fs.stat(gitDir).then(() => true).catch(() => false);
  if (!gitExists) {
    throw new Error(`standalone target is not a git repository: ${targetRoot}`);
  }

  const repo = config.git.repo;
  if (!repo) {
    throw new Error('standalone git repo is not configured in config/standalone-export.json');
  }

  const branchPrefix = config.git.branchPrefix || 'codex/';
  const defaultBranchInfo = await resolveDefaultBranch(targetRoot, repo, config.git.defaultBranch);
  const baseBranch = options.baseBranch || defaultBranchInfo.defaultBranch;
  const branchName = ensureBranchPrefix(
    options.branch || `${branchPrefix}phase37-standalone-sync-${timestampToken()}`,
    branchPrefix,
  );
  const commitMessage = options.commitMessage || 'chore(ci): automate standalone sync flow';
  const prTitle = options.prTitle || 'chore(ci): automate standalone sync flow';
  const prBody = options.prBody || buildPrBody({ validateCommands: config.validateCommands });

  await mustRun('git', ['checkout', '-B', branchName], { cwd: targetRoot });
  await mustRun('git', ['add', '-A'], { cwd: targetRoot });

  const stagedDiff = await mustRun('git', ['diff', '--cached', '--name-status'], { cwd: targetRoot });
  const changedFiles = tail(stagedDiff.stdout, 500);
  const hasChanges = changedFiles.length > 0;

  let commit = null;
  let push = null;
  let pr = null;
  let runInfo = null;
  let runResult = null;

  if (hasChanges) {
    const commitRun = await mustRun('git', ['commit', '-m', commitMessage], { cwd: targetRoot });
    const headRun = await mustRun('git', ['rev-parse', 'HEAD'], { cwd: targetRoot });
    commit = {
      sha: String(headRun.stdout || '').trim(),
      summary: tail(commitRun.stdout, 20),
    };

    if (!options.skipPush) {
      const pushRun = await mustRun('git', ['push', '-u', 'origin', branchName], { cwd: targetRoot });
      push = {
        branch: branchName,
        summary: tail(pushRun.stdout || pushRun.stderr, 20),
      };
    }

    if (!options.skipPr) {
      const prCreateRun = await mustRun(
        'gh',
        ['pr', 'create', '--repo', repo, '--base', baseBranch, '--head', branchName, '--title', prTitle, '--body', prBody],
        { cwd: targetRoot },
      );
      const prUrl = tail(prCreateRun.stdout, 1)[0] || '';
      const prViewRun = await mustRun('gh', ['pr', 'view', branchName, '--repo', repo, '--json', 'number,url,state,headRefName,headRefOid,baseRefName'], { cwd: targetRoot });
      pr = parseJson(prViewRun.stdout) || {
        url: prUrl,
        headRefName: branchName,
        baseRefName: baseBranch,
      };

      if (options.watchCi) {
        runInfo = await waitForRun(repo, branchName, pr.headRefOid || commit.sha, options.watchTimeoutMs || 20 * 60 * 1000);
        await mustRun('gh', ['run', 'watch', String(runInfo.databaseId), '--repo', repo, '--interval', '10', '--exit-status'], { cwd: targetRoot });
        const runView = await mustRun('gh', ['run', 'view', String(runInfo.databaseId), '--repo', repo, '--json', 'databaseId,status,conclusion,url,headBranch,headSha,workflowName,displayTitle'], { cwd: targetRoot });
        runResult = parseJson(runView.stdout) || runInfo;
      }
    }
  }

  const report = {
    generatedAt,
    status: hasChanges ? ((runResult && runResult.conclusion && runResult.conclusion !== 'success') ? 'fail' : 'pass') : 'noop',
    summary: {
      repo,
      baseBranch,
      branchName,
      hasChanges,
      changedFiles: changedFiles.length,
      watchCi: !!options.watchCi,
      remoteUrl: defaultBranchInfo.repoInfo?.url || null,
    },
    syncReportSummary: syncReport.summary,
    git: {
      commit,
      push,
      pr,
      run: runResult || runInfo,
    },
    changedFiles,
  };

  await writeJson(reportFile, report);
  await appendJsonl(auditFile, {
    timestamp: generatedAt,
    source: 'phase37-standalone-publish',
    status: report.status,
    summary: report.summary,
    pr: report.git.pr,
    run: report.git.run,
  });

  console.log(`Standalone publish report: ${reportFile}`);
  console.log(`[STANDALONE-PUBLISH] status=${report.status} repo=${repo} branch=${branchName} changes=${changedFiles.length}`);

  if (report.status === 'fail') {
    throw new Error(`standalone publish CI failed for branch ${branchName}`);
  }

  return report;
}

function parseArgs(argv) {
  const args = {
    watchCi: envBool('STANDALONE_EXPORT_WATCH_CI', false),
    skipPush: envBool('STANDALONE_EXPORT_SKIP_PUSH', false),
    skipPr: envBool('STANDALONE_EXPORT_SKIP_PR', false),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--watch-ci') {
      args.watchCi = true;
      continue;
    }
    if (token === '--skip-push') {
      args.skipPush = true;
      continue;
    }
    if (token === '--skip-pr') {
      args.skipPr = true;
      continue;
    }
    if (token === '--config' && argv[index + 1]) {
      args.configFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--branch' && argv[index + 1]) {
      args.branch = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--base-branch' && argv[index + 1]) {
      args.baseBranch = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--commit-message' && argv[index + 1]) {
      args.commitMessage = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--pr-title' && argv[index + 1]) {
      args.prTitle = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--report-file' && argv[index + 1]) {
      args.reportFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--audit-file' && argv[index + 1]) {
      args.auditFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--sync-report-file' && argv[index + 1]) {
      args.syncReportFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--sync-audit-file' && argv[index + 1]) {
      args.syncAuditFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--watch-timeout-ms' && argv[index + 1]) {
      args.watchTimeoutMs = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await publishStandalone(args);
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : null;
const selfFile = fileURLToPath(import.meta.url);

if (entryFile && entryFile === selfFile) {
  main().catch((error) => {
    console.error(`Unexpected phase37 standalone publish failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
