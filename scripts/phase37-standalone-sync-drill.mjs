import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncStandalone } from './phase37-standalone-sync.mjs';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase37-standalone-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const targetRoot = path.join(tempRoot, 'target');
  const configFile = path.join(tempRoot, 'standalone-export.test.json');
  const reportFile = path.join(tempRoot, 'sync-report.json');
  const auditFile = path.join(tempRoot, 'sync-audit.jsonl');

  await writeFile(path.join(sourceRoot, 'src/keep.txt'), 'fresh\n');
  await writeFile(path.join(sourceRoot, 'docs/readme.md'), '# synced\n');
  await writeFile(path.join(sourceRoot, 'nested/data.json'), '{"ok":true}\n');
  await writeFile(path.join(sourceRoot, 'logs/runtime.log'), 'ignore me\n');
  await writeFile(path.join(sourceRoot, '.env'), 'SECRET=value\n');

  await writeFile(path.join(targetRoot, 'src/keep.txt'), 'stale\n');
  await writeFile(path.join(targetRoot, 'stale.txt'), 'remove me\n');
  await writeFile(path.join(targetRoot, 'logs/runtime.log'), 'keep ignored target log\n');
  await writeFile(path.join(targetRoot, '.git/HEAD'), 'ref: refs/heads/master\n');

  await fs.writeFile(
    configFile,
    JSON.stringify({
      sourceRoot,
      targetRoot,
      exclude: ['.git/', 'logs/', '.env'],
      validateCommands: [],
      git: { repo: 'example/repo', defaultBranch: 'master', branchPrefix: 'codex/' },
    }, null, 2),
    'utf-8',
  );

  const applyReport = await syncStandalone({ configFile, mode: 'apply', reportFile, auditFile });
  await assert(applyReport.status === 'pass', 'apply report should pass');
  await assert(applyReport.summary.copyCount === 3, `expected 3 copied files, got ${applyReport.summary.copyCount}`);
  await assert(applyReport.summary.deleteCount === 1, `expected 1 deleted file, got ${applyReport.summary.deleteCount}`);

  const syncedContent = await fs.readFile(path.join(targetRoot, 'src/keep.txt'), 'utf-8');
  await assert(syncedContent === 'fresh\n', 'target file should be updated from source');
  await assert((await fs.stat(path.join(targetRoot, 'logs/runtime.log'))).isFile(), 'ignored log file should remain untouched');
  await assert(!(await fs.stat(path.join(targetRoot, 'stale.txt')).then(() => true).catch(() => false)), 'stale file should be removed');

  const cleanReport = await syncStandalone({ configFile, mode: 'check', reportFile, auditFile });
  await assert(cleanReport.status === 'pass', 'check report should pass after apply');

  await writeFile(path.join(sourceRoot, 'src/new-file.txt'), 'drift\n');
  const driftReport = await syncStandalone({ configFile, mode: 'check', reportFile, auditFile });
  await assert(driftReport.status === 'drift', 'check report should detect drift when source changes');

  console.log('phase37 standalone sync drill: ok');
}

main().catch((error) => {
  console.error(`phase37 standalone sync drill failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
