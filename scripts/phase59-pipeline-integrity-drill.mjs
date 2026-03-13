#!/usr/bin/env node
/**
 * phase59-pipeline-integrity-drill.mjs
 *
 * Validates the structural integrity of the CI pipeline:
 *  1. scripts_exist_for_validatecommands — every test:phaseNN in validateCommands
 *     maps to a real .mjs file in scripts/
 *  2. validatecommands_test_count — at least 43 test:phase entries
 *  3. package_json_coverage — package.json has every test:phase key referenced
 *     by validateCommands
 *  4. phase58_evidence_exists — the production_ready evidence file is present
 *
 * Exits 1 on any failure.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DRILL_NAME = 'phase59-pipeline-integrity';
const REPORT_DIR = join(ROOT, 'tmp', 'drill-reports');

function writeJson(name, data) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function main() {
  console.log(`\n=== ${DRILL_NAME} ===\n`);

  // ── Load config files ────────────────────────────────────────────────────
  const exportJson = JSON.parse(
    readFileSync(join(ROOT, 'config', 'standalone-export.json'), 'utf8')
  );
  const packageJson = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8')
  );

  const validateCmds = exportJson.validateCommands ?? [];
  // Commands of the form "npm run test:phase<N>"
  const testPhaseCmds = validateCmds.filter(c => /test:phase\d+/.test(c));

  // ── Drill 1: scripts_exist_for_validatecommands ──────────────────────────
  console.log('\n[Drill 1] scripts_exist_for_validatecommands');
  const missingScripts = [];

  for (const cmd of testPhaseCmds) {
    const scriptKey = cmd.replace(/^npm run /, '');
    const scriptCmd = packageJson.scripts?.[scriptKey];
    if (!scriptCmd) {
      missingScripts.push(`${scriptKey}: not found in package.json`);
      continue;
    }
    // e.g. "node scripts/phase59-pipeline-integrity-drill.mjs"
    const mjsRelPath = scriptCmd.replace(/^node\s+/, '').trim();
    const fullPath = join(ROOT, mjsRelPath);
    if (!existsSync(fullPath)) {
      missingScripts.push(`${mjsRelPath}: file not found`);
    }
  }

  writeJson('drill1-scripts-exist', { total: testPhaseCmds.length, missingScripts });
  assert(
    missingScripts.length === 0,
    `scripts_exist_for_validatecommands: all ${testPhaseCmds.length} drill files exist`
  );

  // ── Drill 2: validatecommands_test_count ─────────────────────────────────
  console.log('\n[Drill 2] validatecommands_test_count');
  const count = testPhaseCmds.length;
  writeJson('drill2-validatecommands-count', { count, minimum: 43 });
  assert(count >= 43, `validatecommands_test_count: ${count} test:phase commands (≥43 expected)`);

  // ── Drill 3: package_json_coverage ───────────────────────────────────────
  console.log('\n[Drill 3] package_json_coverage');
  const missingFromPkg = testPhaseCmds
    .map(c => c.replace(/^npm run /, ''))
    .filter(key => !packageJson.scripts?.[key]);

  writeJson('drill3-package-coverage', { missingFromPkg });
  assert(
    missingFromPkg.length === 0,
    `package_json_coverage: all ${testPhaseCmds.length} validateCommands test:phase keys present in package.json`
  );

  // ── Drill 4: phase58_evidence_exists ─────────────────────────────────────
  console.log('\n[Drill 4] phase58_evidence_exists');
  const evidencePath = join(ROOT, 'docs', 'analise-projeto', '69-fase-58-validacao.md');
  const exists = existsSync(evidencePath);
  writeJson('drill4-phase58-evidence', { path: '69-fase-58-validacao.md', exists });
  assert(exists, 'phase58_evidence_exists: production_ready evidence file (69-fase-58-validacao.md) present');

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n✓ All ${DRILL_NAME} drills passed.\n`);
  writeJson('summary', {
    drill: DRILL_NAME,
    status: 'pass',
    drills: 4,
    testPhaseCommandsValidated: count,
    phase58EvidencePresent: exists,
  });
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
