import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_CONFIG_FILE = path.resolve(
  ROOT,
  process.env.STANDALONE_EXPORT_CONFIG_FILE || 'config/standalone-export.json',
);
const DEFAULT_REPORT_FILE = path.resolve(
  ROOT,
  process.env.STANDALONE_EXPORT_REPORT_FILE || 'logs/monitoring/standalone-export-sync-report.json',
);
const DEFAULT_AUDIT_FILE = path.resolve(
  ROOT,
  process.env.STANDALONE_EXPORT_AUDIT_FILE || 'logs/monitoring/standalone-export-sync-audit.jsonl',
);

function envString(name, fallback = '') {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

function tail(value, count = 20) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function compileRule(pattern) {
  const normalized = normalizePath(pattern.endsWith('/') ? pattern.slice(0, -1) : pattern);
  return {
    raw: pattern,
    normalized,
    dirOnly: pattern.endsWith('/'),
    wildcard: pattern.includes('*'),
    hasSlash: normalized.includes('/'),
    regex: pattern.includes('*') ? wildcardToRegExp(normalized) : null,
  };
}

function matchRule(relPath, isDirectory, rule) {
  const normalized = normalizePath(relPath);
  const basename = path.posix.basename(normalized);

  if (!normalized) {
    return false;
  }

  if (rule.dirOnly) {
    if (!isDirectory) return false;
    if (!rule.hasSlash) {
      return normalized.split('/').includes(rule.normalized);
    }
    return normalized === rule.normalized || normalized.startsWith(`${rule.normalized}/`);
  }

  if (rule.wildcard) {
    const target = rule.hasSlash ? normalized : basename;
    return rule.regex.test(target);
  }

  if (!rule.hasSlash) {
    return basename === rule.normalized;
  }

  return normalized === rule.normalized;
}

function createMatcher(patterns) {
  const rules = (Array.isArray(patterns) ? patterns : []).map((pattern) => compileRule(String(pattern)));
  return {
    rules,
    match(relPath, isDirectory) {
      for (const rule of rules) {
        if (matchRule(relPath, isDirectory, rule)) {
          return rule.raw;
        }
      }
      return null;
    },
  };
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return createHash('sha1').update(data).digest('hex');
}

async function walkFiles(rootDir, matcher) {
  const files = new Map();
  const excluded = [];

  async function visit(currentDir, relativeDir = '') {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relPath = normalizePath(path.posix.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        const hit = matcher.match(relPath, true);
        if (hit) {
          excluded.push({ path: relPath, rule: hit, type: 'directory' });
          continue;
        }
        await visit(path.join(currentDir, entry.name), relPath);
        continue;
      }

      if (!entry.isFile()) {
        excluded.push({ path: relPath, rule: 'non-regular-file', type: 'other' });
        continue;
      }

      const hit = matcher.match(relPath, false);
      if (hit) {
        excluded.push({ path: relPath, rule: hit, type: 'file' });
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      const stats = await fs.stat(absolutePath);
      files.set(relPath, {
        path: relPath,
        absolutePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }

  await visit(rootDir);
  return { files, excluded };
}

async function buildPlan(sourceRoot, targetRoot, matcher) {
  const sourceScan = await walkFiles(sourceRoot, matcher);
  const targetScan = await walkFiles(targetRoot, matcher);
  const copy = [];
  const remove = [];
  let unchanged = 0;

  for (const [relPath, sourceEntry] of sourceScan.files.entries()) {
    const targetEntry = targetScan.files.get(relPath);
    if (!targetEntry) {
      copy.push({ path: relPath, reason: 'missing_in_target' });
      continue;
    }

    if (sourceEntry.size === targetEntry.size) {
      const [sourceHash, targetHash] = await Promise.all([
        hashFile(sourceEntry.absolutePath),
        hashFile(targetEntry.absolutePath),
      ]);
      if (sourceHash === targetHash) {
        unchanged += 1;
        continue;
      }
    }

    copy.push({ path: relPath, reason: 'content_changed' });
  }

  for (const relPath of targetScan.files.keys()) {
    if (!sourceScan.files.has(relPath)) {
      remove.push({ path: relPath, reason: 'missing_in_source' });
    }
  }

  return {
    sourceScan,
    targetScan,
    copy,
    remove,
    unchanged,
  };
}

async function pruneEmptyDirs(rootDir) {
  async function visit(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await visit(path.join(dirPath, entry.name));
      }
    }

    const freshEntries = await fs.readdir(dirPath, { withFileTypes: true });
    if (dirPath !== rootDir && freshEntries.length === 0) {
      await fs.rmdir(dirPath);
    }
  }

  if (await pathExists(rootDir)) {
    await visit(rootDir);
  }
}

async function applyPlan(sourceRoot, targetRoot, plan) {
  const deleted = [];
  const copied = [];

  for (const item of [...plan.remove].sort((left, right) => right.path.localeCompare(left.path))) {
    const targetPath = path.resolve(targetRoot, item.path);
    if (await pathExists(targetPath)) {
      await fs.rm(targetPath, { force: true });
      deleted.push(item.path);
    }
  }

  for (const item of plan.copy) {
    const sourcePath = path.resolve(sourceRoot, item.path);
    const targetPath = path.resolve(targetRoot, item.path);
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
    copied.push(item.path);
  }

  await pruneEmptyDirs(targetRoot);
  return { copied, deleted };
}

function buildReport(config, mode, plan, applied, generatedAt) {
  const driftDetected = plan.copy.length > 0 || plan.remove.length > 0;
  const status = mode === 'check' && driftDetected ? 'drift' : 'pass';
  return {
    generatedAt,
    status,
    mode,
    summary: {
      sourceRoot: config.sourceRoot,
      targetRoot: config.targetRoot,
      sourceFiles: plan.sourceScan.files.size,
      targetFiles: plan.targetScan.files.size,
      copyCount: plan.copy.length,
      deleteCount: plan.remove.length,
      unchangedCount: plan.unchanged,
      driftDetected,
      excludedEntries: plan.sourceScan.excluded.length + plan.targetScan.excluded.length,
    },
    config: {
      configFile: config.configFile,
      exclude: config.exclude,
      git: config.git,
      validateCommands: config.validateCommands,
    },
    changes: {
      copy: plan.copy,
      remove: plan.remove,
      applied: applied || { copied: [], deleted: [] },
    },
    excludedSamples: {
      source: plan.sourceScan.excluded.slice(0, 20),
      target: plan.targetScan.excluded.slice(0, 20),
    },
  };
}

export async function loadStandaloneExportConfig(configFile = DEFAULT_CONFIG_FILE) {
  const raw = await readJson(path.resolve(ROOT, configFile));
  const sourceRoot = path.resolve(ROOT, raw.sourceRoot || '.');
  const targetRoot = path.resolve(ROOT, raw.targetRoot || '.export-repo');
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.map((item) => String(item)) : [];
  const validateCommands = Array.isArray(raw.validateCommands) ? raw.validateCommands.map((item) => String(item)) : [];
  const git = raw.git && typeof raw.git === 'object' ? raw.git : {};

  return {
    configFile: path.resolve(ROOT, configFile),
    sourceRoot,
    targetRoot,
    exclude,
    validateCommands,
    git: {
      repo: envString('STANDALONE_EXPORT_GIT_REPO', String(git.repo || '')),
      defaultBranch: envString('STANDALONE_EXPORT_GIT_DEFAULT_BRANCH', String(git.defaultBranch || 'master')),
      branchPrefix: envString('STANDALONE_EXPORT_GIT_BRANCH_PREFIX', String(git.branchPrefix || 'codex/')),
    },
    matcher: createMatcher(exclude),
  };
}

export async function syncStandalone(options = {}) {
  const mode = options.mode === 'check' ? 'check' : 'apply';
  const reportFile = options.reportFile ? path.resolve(ROOT, options.reportFile) : DEFAULT_REPORT_FILE;
  const auditFile = options.auditFile ? path.resolve(ROOT, options.auditFile) : DEFAULT_AUDIT_FILE;
  const generatedAt = new Date().toISOString();
  const config = await loadStandaloneExportConfig(options.configFile || DEFAULT_CONFIG_FILE);

  if (config.sourceRoot === config.targetRoot) {
    throw new Error('sourceRoot and targetRoot cannot be the same path');
  }

  if (!(await pathExists(config.targetRoot))) {
    throw new Error(`standalone target root not found: ${config.targetRoot}`);
  }

  const plan = await buildPlan(config.sourceRoot, config.targetRoot, config.matcher);
  const applied = mode === 'apply' ? await applyPlan(config.sourceRoot, config.targetRoot, plan) : null;
  const report = buildReport(config, mode, plan, applied, generatedAt);

  await writeJson(reportFile, report);
  await appendJsonl(auditFile, {
    timestamp: generatedAt,
    source: 'phase37-standalone-sync',
    status: report.status,
    mode,
    summary: report.summary,
  });

  console.log(`Standalone sync report: ${reportFile}`);
  console.log(`[STANDALONE-SYNC] status=${report.status} mode=${mode} copy=${report.summary.copyCount} delete=${report.summary.deleteCount} unchanged=${report.summary.unchangedCount}`);

  if (report.status === 'drift') {
    const sample = [...report.changes.copy, ...report.changes.remove].slice(0, 10).map((item) => `${item.path}:${item.reason}`);
    for (const item of sample) {
      console.error(`[STANDALONE-SYNC] drift ${item}`);
    }
  }

  return report;
}

function parseArgs(argv) {
  const args = {
    mode: 'apply',
    configFile: DEFAULT_CONFIG_FILE,
    reportFile: DEFAULT_REPORT_FILE,
    auditFile: DEFAULT_AUDIT_FILE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      args.mode = 'check';
      continue;
    }
    if (token === '--apply') {
      args.mode = 'apply';
      continue;
    }
    if (token === '--config' && argv[index + 1]) {
      args.configFile = argv[index + 1];
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
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await syncStandalone(args);
  if (report.status === 'drift') {
    process.exit(1);
  }
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : null;
const selfFile = fileURLToPath(import.meta.url);

if (entryFile && entryFile === selfFile) {
  main().catch((error) => {
    console.error(`Unexpected phase37 standalone sync failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}

export function summarizeCommandFailure(result) {
  return {
    status: result.status,
    signal: result.signal,
    stdoutTail: tail(result.stdout, 20),
    stderrTail: tail(result.stderr, 20),
  };
}
