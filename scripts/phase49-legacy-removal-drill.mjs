/**
 * Phase 49 — Legacy Removal Drill
 * Drills: no_legacy_mode_branch / legacy_fallback_state_hardcoded_disabled /
 *         legacy_fallback_allowed_hardcoded_false / allow_legacy_fallback_option_ignored
 */
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { loadOperationalProvider, writeJson } from './observability-operational-provider.mjs';

const DRILL_NAME = 'phase49-legacy-removal-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase49-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

const BASE_OPTS = {
  materializeContract: false,
  contractFile: '/nonexistent/contract.json',
  automationStateFile: '/nonexistent/state.json',
  snapshotFile: '/nonexistent/snapshot.json',
  fullcycleReportFile: '/nonexistent/report.json',
};

// ---------------------------------------------------------------------------
// Drill 1: no_legacy_mode_branch — providerMode='legacy_files' must NOT return mode:'legacy_files'
// ---------------------------------------------------------------------------

async function drillNoLegacyModeBranch() {
  console.log('\n[Drill 1] no_legacy_mode_branch — legacy_files mode must not be returned after removal');

  const result = await loadOperationalProvider({
    providerMode: 'legacy_files',
    ...BASE_OPTS,
  });
  if (!result || !result.meta) throw new Error('loadOperationalProvider returned no result or no meta');
  const mode = result.meta.mode;
  if (mode === 'legacy_files') {
    throw new Error(`expected mode != 'legacy_files' after removal, got '${mode}'`);
  }
  assert(mode !== 'legacy_files', 'mode is not legacy_files after removal', `got '${mode}'`);
}

// ---------------------------------------------------------------------------
// Drill 2: legacy_fallback_state_hardcoded_disabled — legacyFallbackState must always be 'disabled'
// ---------------------------------------------------------------------------

async function drillLegacyFallbackStateHardcodedDisabled() {
  console.log('\n[Drill 2] legacy_fallback_state_hardcoded_disabled — legacyFallbackState must always be disabled');

  const result = await loadOperationalProvider({ ...BASE_OPTS });
  const state = result?.meta?.legacyFallbackState;
  if (state !== 'disabled') {
    throw new Error(`expected legacyFallbackState='disabled', got '${state}'`);
  }
  assert(state === 'disabled', 'legacyFallbackState=disabled');
}

// ---------------------------------------------------------------------------
// Drill 3: legacy_fallback_allowed_hardcoded_false — legacyFallbackAllowed must always be false
// ---------------------------------------------------------------------------

async function drillLegacyFallbackAllowedHardcodedFalse() {
  console.log('\n[Drill 3] legacy_fallback_allowed_hardcoded_false — legacyFallbackAllowed must always be false');

  const result = await loadOperationalProvider({ ...BASE_OPTS });
  const allowed = result?.meta?.legacyFallbackAllowed;
  if (allowed !== false) {
    throw new Error(`expected legacyFallbackAllowed=false, got '${allowed}'`);
  }
  assert(allowed === false, 'legacyFallbackAllowed=false');
}

// ---------------------------------------------------------------------------
// Drill 4: allow_legacy_fallback_option_ignored — allowLegacyFallback:true must NOT activate legacy_files mode
// ---------------------------------------------------------------------------

async function drillAllowLegacyFallbackOptionIgnored() {
  console.log('\n[Drill 4] allow_legacy_fallback_option_ignored — allowLegacyFallback:true must be ignored after removal');

  const result = await loadOperationalProvider({
    allowLegacyFallback: true,
    ...BASE_OPTS,
  });
  if (!result || !result.meta) throw new Error('loadOperationalProvider returned no result or no meta');
  const mode = result.meta.mode;
  const state = result.meta.legacyFallbackState;
  if (mode === 'legacy_files') {
    throw new Error(`allowLegacyFallback:true must not activate legacy_files mode after removal, got '${mode}'`);
  }
  if (state !== 'disabled') {
    throw new Error(`legacyFallbackState must be 'disabled' even when allowLegacyFallback:true passed, got '${state}'`);
  }
  assert(mode !== 'legacy_files', 'mode is not legacy_files when allowLegacyFallback:true', `got '${mode}'`);
  assert(state === 'disabled', 'legacyFallbackState=disabled when allowLegacyFallback:true');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n[${DRILL_NAME}] Starting...`);
  const ts = new Date().toISOString();

  await mkdir(REPORT_DIR, { recursive: true });

  const errors = [];

  try { await drillNoLegacyModeBranch();                  } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'no_legacy_mode_branch',                  error: err.message }); }
  try { await drillLegacyFallbackStateHardcodedDisabled(); } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'legacy_fallback_state_hardcoded_disabled', error: err.message }); }
  try { await drillLegacyFallbackAllowedHardcodedFalse();  } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'legacy_fallback_allowed_hardcoded_false',  error: err.message }); }
  try { await drillAllowLegacyFallbackOptionIgnored();     } catch (err) { console.error(`  ${err.message}`); errors.push({ drill: 'allow_legacy_fallback_option_ignored',     error: err.message }); }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = {
    generatedAt: ts,
    drill: DRILL_NAME,
    status,
    errors,
    contract: {
      schema: 'fullcycle.observability.phase49.legacy-removal.v1',
      legacyModeRemoved: errors.length === 0,
    },
  };

  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);
  console.log(`\n[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (status !== 'pass') {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
  console.log(`[${DRILL_NAME}] All drills passed — legacy mode removed`);
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
