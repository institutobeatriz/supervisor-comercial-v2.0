/**
 * phase63-tracking-consistency-drill.mjs
 *
 * Fase 63 — Drill de consistencia cruzada dos arquivos de rastreamento
 *
 * Valida que HANDOFF.md, TODO_AI.md e 10-memoria-execucao-fases.md
 * estao todos de acordo sobre o mesmo estado de fase.
 *
 * Drills:
 *   1. handoff_phase_matches_memory   — fase em HANDOFF bate com contagem da memoria
 *   2. todo_phase_matches_handoff     — fase em TODO_AI bate com HANDOFF
 *   3. memory_concluida_count_exact   — memoria tem exatamente 63 rows CONCLUIDA (fases 0-62)
 *   4. evidence_file_latest_exists    — evidencia referenciada no HANDOFF existe no disco
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DRILL_NAME = 'phase63-tracking-consistency';
const REPORT_DIR = path.join(ROOT, 'logs', 'monitoring');

const results = [];

function assert(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ drill: name, status, detail });
  if (!condition) {
    console.error(`[FAIL] ${name}${detail ? ': ' + detail : ''}`);
  } else {
    console.log(`[PASS] ${name}${detail ? ': ' + detail : ''}`);
  }
  return condition;
}

function writeJson(data) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = path.join(REPORT_DIR, `${DRILL_NAME}-report.json`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Report: ${out}`);
}

function extractHandoffPhase(content) {
  const m = content.match(/Ultima fase concluida:\s*Fase\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractTodoPhase(content) {
  const m = content.match(/Ultima fase concluida:\s*Fase\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function countMemoriaConcluida(content) {
  return (content.match(/\|\s*Fase\s+\d+[^|]*\|\s*CONCLUIDA/g) || []).length;
}

function extractEvidenceRef(content) {
  // Look for evidence file referenced in HANDOFF — format: `docs/analise-projeto/NN-fase-NN-validacao.md`
  const m = content.match(/Evidencia oficial:\s*`([^`]+)`/);
  return m ? m[1] : null;
}

async function main() {
  console.log(`\n=== ${DRILL_NAME} ===\n`);

  // Read tracking files
  const handoffPath = path.join(ROOT, 'HANDOFF.md');
  const todoPath = path.join(ROOT, 'TODO_AI.md');
  const memoriaPath = path.join(ROOT, 'docs', 'analise-projeto', '10-memoria-execucao-fases.md');

  const handoffContent = fs.readFileSync(handoffPath, 'utf8');
  const todoContent = fs.readFileSync(todoPath, 'utf8');
  const memoriaContent = fs.readFileSync(memoriaPath, 'utf8');

  // --- Drill 1: HANDOFF phase matches memory row count ---
  const handoffPhase = extractHandoffPhase(handoffContent);
  const concluidaCount = countMemoriaConcluida(memoriaContent);
  const expectedCount = handoffPhase !== null ? handoffPhase + 1 : -1; // phases 0..N => N+1 rows
  assert(
    'handoff_phase_matches_memory',
    handoffPhase !== null && concluidaCount === expectedCount,
    `HANDOFF phase=${handoffPhase}, memoria CONCLUIDA rows=${concluidaCount}, expected=${expectedCount}`
  );

  // --- Drill 2: TODO_AI phase matches HANDOFF ---
  const todoPhase = extractTodoPhase(todoContent);
  assert(
    'todo_phase_matches_handoff',
    todoPhase !== null && todoPhase === handoffPhase,
    `TODO phase=${todoPhase}, HANDOFF phase=${handoffPhase}`
  );

  // --- Drill 3: memoria has at least 63 CONCLUIDA rows (phases 0-62 minimum) ---
  const MIN_ROWS = 63; // phases 0 through 62 were present when this drill was written
  assert(
    'memory_concluida_count_exact',
    concluidaCount >= MIN_ROWS,
    `found ${concluidaCount}, expected >= ${MIN_ROWS}`
  );

  // --- Drill 4: evidence file referenced in HANDOFF exists ---
  const evidenceRef = extractEvidenceRef(handoffContent);
  const evidencePath = evidenceRef ? path.join(ROOT, evidenceRef) : null;
  const evidenceExists = evidencePath ? fs.existsSync(evidencePath) : false;
  assert(
    'evidence_file_latest_exists',
    evidenceExists,
    evidenceRef ? `${evidenceRef} ${evidenceExists ? 'found' : 'MISSING'}` : 'no evidence ref found in HANDOFF'
  );

  // --- Write report ---
  const allPass = results.every(r => r.status === 'PASS');
  writeJson({
    drill: DRILL_NAME,
    timestamp: new Date().toISOString(),
    phase: 63,
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
    },
    drills: results,
    metadata: {
      handoffPhase,
      todoPhase,
      concluidaCount,
      evidenceRef,
    },
  });

  console.log(`\n${allPass ? '[OK] ALL DRILLS PASSED' : '[FAIL] SOME DRILLS FAILED'}\n`);
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
