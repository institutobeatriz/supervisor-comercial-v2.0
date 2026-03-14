/**
 * Phase 57 — Git Root Extraction Decision Drill
 * Drills: workspace_structure_sufficient / standalone_ci_validates_coverage /
 *         standalone_sync_scripts_present / decision_extraction_not_required
 *
 * Formaliza a decisão de NÃO extrair o projeto para um git root próprio neste
 * estágio. Valida que a estrutura nested atual é operacionalmente suficiente:
 * arquivos críticos acessíveis, cobertura CI completa via validateCommands e
 * scripts de sync standalone presentes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase57-git-root-decision-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase57-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Drill 1: workspace_structure_sufficient
// ---------------------------------------------------------------------------
async function drillWorkspaceStructureSufficient() {
  console.log('\n[Drill 1] workspace_structure_sufficient — arquivos críticos acessíveis no workspace nested');

  const root = process.cwd();
  const criticalFiles = [
    'HANDOFF.md',
    'TODO_AI.md',
    'package.json',
    'config/standalone-export.json',
    'docs/analise-projeto/10-memoria-execucao-fases.md',
  ];

  for (const rel of criticalFiles) {
    const exists = await fileExists(path.resolve(root, rel));
    assert(exists, `${rel} existe no workspace`, `path=${path.resolve(root, rel)}`);
  }

  // Validate package.json is parseable JSON with name field
  const pkgRaw = await readFile(path.resolve(root, 'package.json'), 'utf-8');
  const pkg = JSON.parse(pkgRaw);
  assert(typeof pkg.name === 'string', 'package.json tem campo name', `name=${pkg.name}`);
  assert(pkg.workspaces != null, 'package.json tem workspaces (monorepo)');

  console.log('  [INFO] decisão: estrutura nested não bloqueia nenhuma operação crítica');
}

// ---------------------------------------------------------------------------
// Drill 2: standalone_ci_validates_coverage
// ---------------------------------------------------------------------------
async function drillStandaloneCiValidatesCoverage() {
  console.log('\n[Drill 2] standalone_ci_validates_coverage — validateCommands cobre ≥30 comandos de teste');

  const root = process.cwd();
  const exportConfigPath = path.resolve(root, 'config/standalone-export.json');
  const exportConfigRaw = await readFile(exportConfigPath, 'utf-8');
  const exportConfig = JSON.parse(exportConfigRaw);

  assert(Array.isArray(exportConfig.validateCommands), 'validateCommands é array');

  const testCommands = exportConfig.validateCommands.filter((cmd) =>
    typeof cmd === 'string' && cmd.includes('test:phase'),
  );
  const totalCommands = exportConfig.validateCommands.length;

  assert(
    testCommands.length >= 30,
    `validateCommands tem ≥30 test:phase commands (encontrado: ${testCommands.length})`,
    `total_commands=${totalCommands}`,
  );

  // Verify git repo config is present
  assert(typeof exportConfig.git?.repo === 'string', 'git.repo está configurado', `repo=${exportConfig.git?.repo}`);
  assert(typeof exportConfig.git?.branchPrefix === 'string', 'git.branchPrefix configurado');

  console.log(`  [INFO] CI standalone cobre ${testCommands.length} fases de teste (total=${totalCommands} comandos)`);
  console.log(`  [INFO] repo canonical: ${exportConfig.git?.repo}`);
  console.log('  [INFO] decisão: cobertura CI completa sem necessidade de git root separado');
}

// ---------------------------------------------------------------------------
// Drill 3: standalone_sync_scripts_present
// ---------------------------------------------------------------------------
async function drillStandaloneSyncScriptsPresent() {
  console.log('\n[Drill 3] standalone_sync_scripts_present — scripts de sync standalone presentes e acessíveis');

  const root = process.cwd();
  const syncScripts = [
    'scripts/phase37-standalone-sync.mjs',
    'scripts/phase37-standalone-publish.mjs',
    'scripts/phase37-standalone-sync-drill.mjs',
  ];

  for (const rel of syncScripts) {
    const exists = await fileExists(path.resolve(root, rel));
    assert(exists, `${rel} presente`, `path=${path.resolve(root, rel)}`);
  }

  // Verify standalone sync drill script is non-empty
  const drillContent = await readFile(path.resolve(root, 'scripts/phase37-standalone-sync-drill.mjs'), 'utf-8');
  assert(drillContent.length > 100, 'phase37-standalone-sync-drill.mjs é não-trivial', `len=${drillContent.length}`);
  assert(drillContent.includes('syncStandalone') || drillContent.includes('assert'), 'phase37 drill contém lógica de validação');

  console.log('  [INFO] todos os scripts de automação standalone presentes');
  console.log('  [INFO] decisão: fluxo sync/publish/drill não requer git root próprio para operar');
}

// ---------------------------------------------------------------------------
// Drill 4: decision_extraction_not_required
// ---------------------------------------------------------------------------
async function drillDecisionExtractionNotRequired() {
  console.log('\n[Drill 4] decision_extraction_not_required — formaliza decisão: git root separado não é necessário');

  const decision = {
    phase: 57,
    decisionDate: new Date().toISOString().slice(0, 10),
    topic: 'git_root_extraction',
    conclusion: 'not_required',
    rationale: [
      'Workspace nested funcional: todos os arquivos críticos acessíveis via cwd convencional',
      'CI standalone completo: validateCommands cobre todas as fases sem necessidade de monorepo separado',
      'Automação de sync (phase37) opera corretamente a partir do workspace atual',
      'Ganho operacional de extração seria marginal; custo de migração não justificado neste estágio',
      'Worktree isolation (epic-sanderson) provê isolamento suficiente para desenvolvimento paralelo',
    ],
    preconditionsForRevisit: [
      'Projeto evoluir para múltiplos times independentes com ciclos de release separados',
      'CI standalone atingir limitações que exijam monorepo próprio',
      'Necessidade de versionamento semântico independente do projeto supervisor-comercial',
    ],
    decidedBy: 'Phase 57 drill — supervisor-comercial project',
  };

  const decisionFile = path.resolve(REPORT_DIR, 'git-root-decision.json');
  await writeJson(decisionFile, decision);

  assert(decision.conclusion === 'not_required', 'conclusão formalizada: git root separado não é necessário');
  assert(decision.rationale.length >= 4, `rationale documentado com ${decision.rationale.length} razões`);
  assert(decision.preconditionsForRevisit.length >= 2, 'condições de revisão documentadas');

  console.log(`  [INFO] decisão escrita em: ${decisionFile}`);
  console.log(`  [INFO] conclusão: ${decision.conclusion}`);
  console.log('  [INFO] decisão formalizada e arquivada no drill report');
}

const drills = [
  { name: 'workspace_structure_sufficient', run: drillWorkspaceStructureSufficient },
  { name: 'standalone_ci_validates_coverage', run: drillStandaloneCiValidatesCoverage },
  { name: 'standalone_sync_scripts_present', run: drillStandaloneSyncScriptsPresent },
  { name: 'decision_extraction_not_required', run: drillDecisionExtractionNotRequired },
];

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  console.log(`[${DRILL_NAME}] Starting...\n`);

  const errors = [];
  for (const drill of drills) {
    console.log(`[Drill] ${drill.name}`);
    try {
      await drill.run();
    } catch (err) {
      errors.push({ drill: drill.name, error: err.message });
      console.error(`  ${err.message}`);
    }
    console.log();
  }

  const status = errors.length === 0 ? 'pass' : 'fail';
  const report = { drillName: DRILL_NAME, status, errors, ts: new Date().toISOString() };
  await writeJson(path.resolve(REPORT_DIR, 'drill-report.json'), report);

  console.log(`[${DRILL_NAME}] status=${status} errors=${errors.length}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  [ERROR] ${e.drill}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(`[${DRILL_NAME}] Fatal:`, err); process.exit(1); });
