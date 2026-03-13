import path from 'node:path';
import { writeJson } from './observability-operational-provider.mjs';
import { collectOperationalSources, validateCollectorSources } from './phase44-operational-collector.mjs';
import { loadOperationalProvider } from './observability-operational-provider.mjs';

const DRILL_NAME = 'phase44-operational-collector-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase44-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

// ---------------------------------------------------------------------------
// Drill 1: file_mode — collector in file mode with missing files → all loaded=false, structure valid
// ---------------------------------------------------------------------------

async function drillFileMode() {
  console.log('\n[Drill 1] file_mode — file-based collection with missing files');

  const result = await collectOperationalSources({
    mode: 'file',
    automationStateFile: '/nonexistent/phase44-drill/automation.json',
    snapshotFile: '/nonexistent/phase44-drill/snapshot.json',
    fullcycleReportFile: '/nonexistent/phase44-drill/report.json',
  });

  assert(result.schema === 'fullcycle.observability.operational-collector.v1', 'schema matches collector interface');
  assert(result.version === 1, 'version is 1');
  assert(result.collectorMode === 'file', 'collectorMode is file');
  assert(typeof result.sources === 'object' && result.sources !== null, 'sources is object');
  assert(result.sources.incidentAutomation.loaded === false, 'incidentAutomation.loaded=false (file missing)');
  assert(result.sources.itsmSnapshot.loaded === false, 'itsmSnapshot.loaded=false (file missing)');
  assert(result.sources.fullcycleReport.loaded === false, 'fullcycleReport.loaded=false (file missing)');
  assert(result.sources.incidentAutomation.incidentCount === 0, 'incidentCount=0 when file missing');
  assert(Array.isArray(result.sources.itsmSnapshot.paging), 'paging is array');
  assert(Array.isArray(result.sources.itsmSnapshot.tickets), 'tickets is array');
  assert(result.sources.fullcycleReport.status === 'unknown', 'fullcycleReport.status=unknown when file missing');
  assert(result.valid === true, 'collector output passes validation (structure valid even with missing files)');

  const errors = validateCollectorSources(result.sources);
  assert(errors.length === 0, 'validateCollectorSources returns no errors');

  return result;
}

// ---------------------------------------------------------------------------
// Drill 2: synthetic_mode — collector generates deterministic test data
// ---------------------------------------------------------------------------

async function drillSyntheticMode() {
  console.log('\n[Drill 2] synthetic_mode — synthetic data generation');

  const result = await collectOperationalSources({ mode: 'synthetic' });

  assert(result.collectorMode === 'synthetic', 'collectorMode is synthetic');
  assert(result.sources.incidentAutomation.loaded === true, 'incidentAutomation.loaded=true (synthetic)');
  assert(result.sources.itsmSnapshot.loaded === true, 'itsmSnapshot.loaded=true (synthetic)');
  assert(result.sources.fullcycleReport.loaded === true, 'fullcycleReport.loaded=true (synthetic)');
  assert(result.sources.incidentAutomation.incidentCount >= 1, 'incidentCount >= 1 in synthetic mode');
  assert(result.sources.itsmSnapshot.pagingCount >= 1, 'pagingCount >= 1 in synthetic mode');
  assert(result.sources.itsmSnapshot.ticketCount >= 1, 'ticketCount >= 1 in synthetic mode');
  assert(result.sources.fullcycleReport.status === 'pass', 'fullcycleReport.status=pass in synthetic mode');
  assert(result.sources.fullcycleReport.ownerCoveragePct === 100, 'ownerCoveragePct=100 in synthetic mode');
  assert(result.valid === true, 'synthetic output passes validation');

  const errors = validateCollectorSources(result.sources);
  assert(errors.length === 0, 'validateCollectorSources returns no errors for synthetic data');

  return result;
}

// ---------------------------------------------------------------------------
// Drill 3: integration — loadOperationalProvider uses collectorSources (bypasses files)
// ---------------------------------------------------------------------------

async function drillIntegration(syntheticSources) {
  console.log('\n[Drill 3] integration — loadOperationalProvider with collectorSources');

  // Pass invalid file paths to prove files are NOT read when collectorSources is provided
  const provider = await loadOperationalProvider({
    collectorSources: syntheticSources,
    providerMode: 'materialized_contract',
    materializeContract: true,
    allowLegacyFallback: false,
    contractFile: path.join(REPORT_DIR, 'phase44-integration-contract.json'),
    automationStateFile: '/nonexistent/phase44-drill/should-not-be-read/automation.json',
    snapshotFile: '/nonexistent/phase44-drill/should-not-be-read/snapshot.json',
    fullcycleReportFile: '/nonexistent/phase44-drill/should-not-be-read/report.json',
    materializedBy: 'phase44-operational-collector-drill',
  });

  assert(provider.meta.mode === 'materialized_contract', 'provider mode is materialized_contract');
  assert(provider.meta.materialized === true, 'contract was materialized');
  assert(provider.contract !== null, 'contract was produced');
  assert(provider.contract.schema === 'fullcycle.observability.operational-provider.v1', 'contract schema is valid');
  // Sources in contract must come from synthetic (loaded=true), not from missing files
  assert(provider.contract.sources.incidentAutomation.loaded === true, 'incidentAutomation.loaded=true in materialized contract');
  assert(provider.contract.sources.itsmSnapshot.loaded === true, 'itsmSnapshot.loaded=true in materialized contract');
  assert(provider.contract.sources.fullcycleReport.loaded === true, 'fullcycleReport.loaded=true in materialized contract');
  assert(
    provider.contract.sources.incidentAutomation.incidentCount >= 1,
    'incidentCount from synthetic sources propagated to contract',
  );
  assert(provider.meta.legacyFallbackState === 'disabled', 'legacyFallbackState=disabled');

  return provider;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const ts = new Date().toISOString();
  console.log(`=== ${DRILL_NAME} ===`);

  const results = [];
  let passed = 0;
  let failed = 0;

  async function runDrill(name, fn) {
    try {
      const result = await fn();
      console.log(`  -> ${name}: PASS`);
      results.push({ name, status: 'pass' });
      passed++;
      return result;
    } catch (error) {
      console.error(`  -> ${name}: FAIL — ${error.message}`);
      results.push({ name, status: 'fail', error: error.message });
      failed++;
      return null;
    }
  }

  const fileModeResult = await runDrill('file_mode', drillFileMode);
  const syntheticResult = await runDrill('synthetic_mode', drillSyntheticMode);
  let integrationResult = null;
  if (syntheticResult) {
    integrationResult = await runDrill('integration', () => drillIntegration(syntheticResult.sources));
  } else {
    console.error('  -> integration: SKIPPED (synthetic_mode failed)');
    results.push({ name: 'integration', status: 'skipped' });
  }

  const status = failed === 0 ? 'pass' : 'fail';

  const report = {
    generatedAt: ts,
    drill: DRILL_NAME,
    status,
    passed,
    failed,
    results,
    contract: integrationResult?.contract || null,
  };

  await writeJson(path.join(REPORT_DIR, 'drill-report.json'), report);

  console.log(`\n=== ${DRILL_NAME}: ${status.toUpperCase()} (${passed} passed, ${failed} failed) ===`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`Unexpected drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
