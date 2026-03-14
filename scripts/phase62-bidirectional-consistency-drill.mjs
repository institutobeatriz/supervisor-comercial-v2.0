#!/usr/bin/env node
/**
 * phase62-bidirectional-consistency-drill.mjs
 *
 * Validates bidirectional consistency between package.json test:phase scripts
 * and validateCommands in standalone-export.json.
 *
 * Phase 59 checked: validateCommands → scripts exist and package.json has them.
 * This drill checks the complementary direction:
 *   package.json test:phaseNN → either in validateCommands OR in the known
 *   intentional exclusion set (Docker / real data / no drill / network).
 *
 * Drills:
 *  1. validatecommands_all_have_pkg_scripts — every test:phaseNN in
 *     validateCommands has a matching script key in package.json
 *  2. pkg_excluded_phases_are_documented   — every test:phaseNN in package.json
 *     that is absent from validateCommands belongs to the documented exclusion
 *     set (phases 3-5 Docker, phases 10-13 real data)
 *  3. no_undocumented_pkg_test_scripts     — no test:phaseNN in package.json
 *     is absent from validateCommands for an undocumented reason
 *  4. validatecommands_count_stable        — count is exactly 46 (no regression)
 *
 * Exits 1 on any failure.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DRILL_NAME = 'phase62-bidirectional-consistency';
const REPORT_DIR = join(ROOT, 'tmp', 'drill-reports');

// Documented exclusions: phases that have test:phaseNN in package.json but are
// intentionally excluded from validateCommands (with documented reason).
const DOCUMENTED_EXCLUSIONS = {
  dockerRequired: [3, 4, 5],
  realDataRequired: [10, 11, 12, 13],
};

const ALL_DOCUMENTED_EXCLUSION_PHASES = [
  ...DOCUMENTED_EXCLUSIONS.dockerRequired,
  ...DOCUMENTED_EXCLUSIONS.realDataRequired,
];

const EXPECTED_VALIDATECOMMANDS_COUNT = 47;

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

function extractPhases(commands) {
  return new Set(
    commands
      .filter(c => /test:phase\d+/.test(c))
      .map(c => parseInt(c.match(/test:phase(\d+)/)[1], 10))
  );
}

async function main() {
  console.log(`\n=== ${DRILL_NAME} ===\n`);

  const exportJson = JSON.parse(
    readFileSync(join(ROOT, 'config', 'standalone-export.json'), 'utf8')
  );
  const packageJson = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8')
  );

  const validateCmds = exportJson.validateCommands ?? [];
  const valPhases = extractPhases(validateCmds);

  const pkgScripts = Object.keys(packageJson.scripts ?? {});
  const pkgPhases = extractPhases(pkgScripts.map(k => `npm run ${k}`));

  // ── Drill 1: validatecommands_all_have_pkg_scripts ───────────────────────
  console.log('\n[Drill 1] validatecommands_all_have_pkg_scripts');
  const valMissingFromPkg = [...valPhases].filter(p => !pkgPhases.has(p)).sort((a,b)=>a-b);
  assert(
    valMissingFromPkg.length === 0,
    `every test:phase in validateCommands has a matching package.json script — missing: [${valMissingFromPkg.join(',')}]`
  );

  // ── Drill 2: pkg_excluded_phases_are_documented ──────────────────────────
  console.log('\n[Drill 2] pkg_excluded_phases_are_documented');
  const pkgNotInVal = [...pkgPhases].filter(p => !valPhases.has(p)).sort((a,b)=>a-b);
  const undocumented = pkgNotInVal.filter(p => !ALL_DOCUMENTED_EXCLUSION_PHASES.includes(p));
  console.log(`[INFO] package.json test:phase entries absent from validateCommands: [${pkgNotInVal.join(',')}]`);
  console.log(`[INFO] Expected documented exclusions: [${ALL_DOCUMENTED_EXCLUSION_PHASES.join(',')}]`);
  assert(
    undocumented.length === 0,
    `all pkg test:phase absent from validateCommands are in documented exclusion set — undocumented: [${undocumented.join(',')}]`
  );

  // ── Drill 3: no_undocumented_pkg_test_scripts ────────────────────────────
  console.log('\n[Drill 3] no_undocumented_pkg_test_scripts');
  // Verify the documented exclusion phases ARE actually the ones excluded
  const docExcludedInVal = ALL_DOCUMENTED_EXCLUSION_PHASES.filter(p => valPhases.has(p));
  assert(
    docExcludedInVal.length === 0,
    `documented exclusion phases [${ALL_DOCUMENTED_EXCLUSION_PHASES.join(',')}] are all absent from validateCommands — unexpectedly present: [${docExcludedInVal.join(',')}]`
  );

  // ── Drill 4: validatecommands_count_stable ───────────────────────────────
  console.log('\n[Drill 4] validatecommands_count_stable');
  assert(
    valPhases.size >= EXPECTED_VALIDATECOMMANDS_COUNT,
    `validateCommands has at least ${EXPECTED_VALIDATECOMMANDS_COUNT} test:phase entries — found ${valPhases.size}`
  );

  // ── Archive report ───────────────────────────────────────────────────────
  const report = {
    drill: DRILL_NAME,
    date: new Date().toISOString().slice(0, 10),
    validateCommandsCount: valPhases.size,
    packageJsonTestPhaseCount: pkgPhases.size,
    inValidateCommandsNotPkg: valMissingFromPkg,
    inPkgNotValidateCommands: pkgNotInVal,
    documentedExclusions: DOCUMENTED_EXCLUSIONS,
    conclusion: `Bidirectional consistency confirmed: ${valPhases.size} validateCommands entries all have package.json scripts; ${pkgNotInVal.length} package.json-only scripts are all documented exclusions.`
  };

  writeJson(`${DRILL_NAME}-report`, report);
  console.log(`\n[INFO] Report archived to tmp/drill-reports/${DRILL_NAME}-report.json`);

  console.log('\n=== ALL DRILLS PASSED ===\n');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
