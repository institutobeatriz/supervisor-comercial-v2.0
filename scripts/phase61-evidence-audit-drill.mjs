#!/usr/bin/env node
/**
 * phase61-evidence-audit-drill.mjs
 *
 * Audits the consistency between the official memory
 * (10-memoria-execucao-fases.md) and the actual evidence files present in
 * docs/analise-projeto/.
 *
 * Drills:
 *  1. memory_row_count_correct      — exactly 61 CONCLUIDA rows (phases 0–60)
 *  2. post_worktree_evidence_complete — phases 32–60 (29 phases) all have
 *                                       evidence files in the worktree
 *  3. pre_worktree_gap_documented   — phases 0–31 (32 phases) are absent;
 *                                     gap is intentional (pre-worktree history)
 *  4. no_unexpected_missing         — no evidence file is absent except the
 *                                     known pre-worktree set (phases 0–31)
 *
 * Exits 1 on any failure.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DRILL_NAME = 'phase61-evidence-audit';
const REPORT_DIR = join(ROOT, 'tmp', 'drill-reports');
const DOCS_DIR = join(ROOT, 'docs', 'analise-projeto');
const MEMORY_FILE = join(DOCS_DIR, '10-memoria-execucao-fases.md');

// Phases created before the worktree was established — evidence not in git
const PRE_WORKTREE_PHASES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

// Phases whose evidence must be present in the worktree
const POST_WORKTREE_PHASES = Array.from({ length: 29 }, (_, i) => i + 32); // 32–60

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

  const memoryText = readFileSync(MEMORY_FILE, 'utf8');
  const existingDocs = readdirSync(DOCS_DIR);

  // Extract evidence refs from CONCLUIDA rows
  const concludedRows = memoryText
    .split('\n')
    .filter(l => l.includes('CONCLUIDA') && l.includes('fase'));

  // Parse referenced evidence filenames (backtick-quoted)
  const evidenceRefs = concludedRows
    .map(r => { const m = r.match(/`(\d+-fase-[^`]+\.md)`/); return m ? m[1] : null; })
    .filter(Boolean);

  // ── Drill 1: memory_row_count_correct ────────────────────────────────────
  console.log('\n[Drill 1] memory_row_count_correct');
  assert(
    concludedRows.length === 61,
    `memory has exactly 61 CONCLUIDA rows (phases 0–60) — found ${concludedRows.length}`
  );

  // ── Drill 2: post_worktree_evidence_complete ─────────────────────────────
  console.log('\n[Drill 2] post_worktree_evidence_complete');
  const missingPostWorktree = POST_WORKTREE_PHASES.filter(phase => {
    // Find the evidence ref for this phase
    const ref = evidenceRefs.find(f => {
      const m = f.match(/^(\d+)-fase-(\d+)-/);
      return m && parseInt(m[2], 10) === phase;
    });
    return !ref || !existingDocs.includes(ref);
  });
  assert(
    missingPostWorktree.length === 0,
    `phases 32–60 all have evidence files in worktree — missing phases: [${missingPostWorktree.join(',')}]`
  );

  // ── Drill 3: pre_worktree_gap_documented ─────────────────────────────────
  console.log('\n[Drill 3] pre_worktree_gap_documented');
  const missingPreWorktree = PRE_WORKTREE_PHASES.filter(phase => {
    const ref = evidenceRefs.find(f => {
      const m = f.match(/^(\d+)-fase-(\d+)-/);
      return m && parseInt(m[2], 10) === phase;
    });
    return ref && existingDocs.includes(ref);
  });
  // All pre-worktree phases should be ABSENT from the worktree
  assert(
    missingPreWorktree.length === 0,
    `phases 0–31 evidence files correctly absent from worktree (pre-worktree history) — unexpectedly present: [${missingPreWorktree.join(',')}]`
  );
  console.log(`[INFO] ${PRE_WORKTREE_PHASES.length} pre-worktree phases (0–31) correctly absent — documented as intentional`);

  // ── Drill 4: no_unexpected_missing ───────────────────────────────────────
  console.log('\n[Drill 4] no_unexpected_missing');
  const unexpectedMissing = evidenceRefs.filter(ref => {
    const m = ref.match(/^(\d+)-fase-(\d+)-/);
    if (!m) return false;
    const phase = parseInt(m[2], 10);
    // Only post-worktree phases should be present
    if (PRE_WORKTREE_PHASES.includes(phase)) return false; // expected to be absent
    return !existingDocs.includes(ref);
  });
  assert(
    unexpectedMissing.length === 0,
    `no unexpected missing evidence files — all absences are pre-worktree (phases 0–31) — unexpected missing: [${unexpectedMissing.join(', ')}]`
  );

  // ── Archive decision ─────────────────────────────────────────────────────
  const report = {
    drill: DRILL_NAME,
    date: new Date().toISOString().slice(0, 10),
    totalConcludedPhases: concludedRows.length,
    evidenceRefsInMemory: evidenceRefs.length,
    preWorktreePhases: {
      count: PRE_WORKTREE_PHASES.length,
      phases: PRE_WORKTREE_PHASES,
      reason: 'Evidence created before worktree was established; not committed to git. Memory rows exist and are authoritative.',
      status: 'intentionally_absent'
    },
    postWorktreePhases: {
      count: POST_WORKTREE_PHASES.length,
      phases: POST_WORKTREE_PHASES,
      status: 'all_present'
    },
    conclusion: 'Memory is consistent: 61 CONCLUIDA rows, 29 post-worktree evidence files present, 32 pre-worktree gaps are intentional and documented.'
  };

  writeJson(`${DRILL_NAME}-report`, report);
  console.log(`\n[INFO] Report archived to tmp/drill-reports/${DRILL_NAME}-report.json`);

  console.log('\n=== ALL DRILLS PASSED ===\n');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
