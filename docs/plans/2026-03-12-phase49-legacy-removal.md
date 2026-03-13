# Phase 49 — Legacy Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove dead legacy-fallback branches and config options from the operational provider and producer, replacing dynamic `legacyFallbackState` with hardcoded `'disabled'`.

**Architecture:** Surgical removal of two unreachable return branches in `loadOperationalProvider()` (blocked since Phase 43 enforcement), removal of `allowLegacyFallback`/`enforceNoLegacy` config options, and hardcoding of `legacyFallbackState: 'disabled'` / `legacyFallbackAllowed: false` in output. `buildLegacySources()` is kept — it still feeds `buildMaterializedContract()` when `collectorSources` is null.

**Tech Stack:** Node.js ESM, no new deps, TDD with custom drill runner.

---

### Task 1: TDD Red — Write failing drill for legacy removal

**Files:**
- Create: `scripts/phase49-legacy-removal-drill.mjs`

**Context:**
The drill runner pattern from phase43/44/47/48 drills. Each drill is `{ name, run }` where `run()` throws on failure.

Check `scripts/phase47-collector-api-mode-drill.mjs` or `scripts/phase48-collector-service-mode-drill.mjs` for the exact pattern used.

**Step 1: Write the drill file**

```js
// scripts/phase49-legacy-removal-drill.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadProvider(opts) {
  const mod = await import(path.resolve(__dirname, 'observability-operational-provider.mjs'));
  return mod.loadOperationalProvider(opts);
}

const drills = [
  {
    name: 'no_legacy_mode_branch',
    async run() {
      // After removal, providerMode='legacy_files' must NOT return mode:'legacy_files'
      // It should proceed to the materialized_contract path instead
      const result = await loadProvider({
        providerMode: 'legacy_files',
        materializeContract: false,
        contractFile: '/nonexistent/contract.json',
        automationStateFile: '/nonexistent/state.json',
        snapshotFile: '/nonexistent/snapshot.json',
        fullcycleReportFile: '/nonexistent/report.json',
      });
      const mode = result?.meta?.mode;
      if (mode === 'legacy_files') {
        throw new Error(`expected mode != 'legacy_files' after removal, got '${mode}'`);
      }
    },
  },
  {
    name: 'legacy_fallback_state_hardcoded_disabled',
    async run() {
      // legacyFallbackState must always be 'disabled' regardless of options
      const result = await loadProvider({
        materializeContract: false,
        contractFile: '/nonexistent/contract.json',
        automationStateFile: '/nonexistent/state.json',
        snapshotFile: '/nonexistent/snapshot.json',
        fullcycleReportFile: '/nonexistent/report.json',
      });
      const state = result?.meta?.legacyFallbackState;
      if (state !== 'disabled') {
        throw new Error(`expected legacyFallbackState='disabled', got '${state}'`);
      }
    },
  },
  {
    name: 'legacy_fallback_allowed_hardcoded_false',
    async run() {
      // legacyFallbackAllowed must always be false
      const result = await loadProvider({
        materializeContract: false,
        contractFile: '/nonexistent/contract.json',
        automationStateFile: '/nonexistent/state.json',
        snapshotFile: '/nonexistent/snapshot.json',
        fullcycleReportFile: '/nonexistent/report.json',
      });
      const allowed = result?.meta?.legacyFallbackAllowed;
      if (allowed !== false) {
        throw new Error(`expected legacyFallbackAllowed=false, got ${allowed}`);
      }
    },
  },
  {
    name: 'allow_legacy_fallback_option_ignored',
    async run() {
      // Passing allowLegacyFallback:true must NOT activate legacy mode
      const result = await loadProvider({
        allowLegacyFallback: true,   // must be ignored after removal
        materializeContract: false,
        contractFile: '/nonexistent/contract.json',
        automationStateFile: '/nonexistent/state.json',
        snapshotFile: '/nonexistent/snapshot.json',
        fullcycleReportFile: '/nonexistent/report.json',
      });
      const mode = result?.meta?.mode;
      const state = result?.meta?.legacyFallbackState;
      if (mode === 'legacy_files') {
        throw new Error(`allowLegacyFallback:true must not activate legacy_files mode after removal`);
      }
      if (state !== 'disabled') {
        throw new Error(`legacyFallbackState must be 'disabled' even when allowLegacyFallback:true passed, got '${state}'`);
      }
    },
  },
];

let passed = 0;
let failed = 0;

for (const drill of drills) {
  try {
    await drill.run();
    console.log(`[PASS] ${drill.name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${drill.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nphase49 drills: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Step 2: Run to confirm red (all 4 drills fail or some fail)**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase49-legacy-removal-drill.mjs
```

Expected: At least `no_legacy_mode_branch` and `allow_legacy_fallback_option_ignored` fail (the dead branches still exist). `legacy_fallback_state_hardcoded_disabled` and `legacy_fallback_allowed_hardcoded_false` may pass already (current code already defaults to disabled/false when no producer and `allowLegacyFallback=false`).

**Step 3: Commit red drill**

```bash
git add scripts/phase49-legacy-removal-drill.mjs
git commit -m "test(phase49): add failing drill for legacy removal (TDD red)"
```

---

### Task 2: Implementation — Surgical removal in provider and producer

**Files:**
- Modify: `scripts/observability-operational-provider.mjs`
- Modify: `scripts/phase42-observability-operational-provider-producer.mjs`

#### 2A — `observability-operational-provider.mjs`

**Step 1: Remove `allowLegacyFallback` and `enforceNoLegacy` from `cfg` in `loadOperationalProvider()`**

Find and remove these two lines (currently lines 340-341):
```js
    allowLegacyFallback: options.allowLegacyFallback ?? envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
    enforceNoLegacy: options.enforceNoLegacy ?? envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY', false),
```

**Step 2: Remove the dead `if (cfg.providerMode !== 'materialized_contract')` block**

Remove lines 370-387:
```js
  if (cfg.providerMode !== 'materialized_contract') {
    if (cfg.enforceNoLegacy) {
      throw new Error(
        `[phase43-enforce] legacy_files mode is blocked: providerMode=${cfg.providerMode} but enforceNoLegacy=true. ` +
        'Set FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE=materialized_contract to use the canonical path.',
      );
    }
    const meta = buildProviderMeta({
      cfg,
      mode: 'legacy_files',
      contract: null,
      sources: legacySources,
      contractLoaded: false,
      loadError: null,
      materialized: false,
    });
    return { ...asOperationalInputs({ meta, contractLoaded: false, contract: null, legacy }), contract: null };
  }
```

**Step 3: Remove the dead `if (!contract && cfg.allowLegacyFallback)` block**

Remove lines 412-429:
```js
  if (!contract && cfg.allowLegacyFallback) {
    if (cfg.enforceNoLegacy) {
      throw new Error(
        `[phase43-enforce] legacy fallback is blocked: allowLegacyFallback=true but enforceNoLegacy=true. ` +
        'Set FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK=false to comply with phase43 enforcement.',
      );
    }
    const meta = buildProviderMeta({
      cfg,
      mode: 'materialized_contract',
      contract: null,
      sources: legacySources,
      contractLoaded: false,
      loadError,
      materialized,
    });
    return { ...asOperationalInputs({ meta, contractLoaded: false, contract: null, legacy }), contract: null };
  }
```

**Step 4: Hardcode `legacyFallbackState` and `legacyFallbackAllowed` in `buildProviderMeta()` output**

Find in `buildProviderMeta` (around lines 292-300):
```js
    allowLegacyFallback: cfg.allowLegacyFallback,
```
Remove this line entirely.

Find:
```js
    legacyFallbackState: producer?.legacyFallbackState || (cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled'),
    legacyFallbackAllowed: producer?.legacyFallbackAllowed === true || cfg.allowLegacyFallback,
```
Replace with:
```js
    legacyFallbackState: 'disabled',
    legacyFallbackAllowed: false,
```

#### 2B — `scripts/phase42-observability-operational-provider-producer.mjs`

**Step 5: Remove `allowLegacyFallback` from `cfg`**

Find (line 98):
```js
    allowLegacyFallback: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
```
Remove this line.

**Step 6: Hardcode `legacyFallbackAllowed` and `legacyFallbackState` in `producerDescriptor`**

Find (lines 116-117):
```js
    legacyFallbackAllowed: cfg.allowLegacyFallback,
    legacyFallbackState: cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled',
```
Replace with:
```js
    legacyFallbackAllowed: false,
    legacyFallbackState: 'disabled',
```

**Step 7: Remove the `if (cfg.allowLegacyFallback)` violation block**

Find and remove (around lines 174-180):
```js
    if (cfg.allowLegacyFallback) {
      violations.push({
        code: 'legacy_fallback_deprecated_still_enabled',
        blocking: false,
        message: 'legacy fallback remains enabled; official path should move to disabled state',
      });
    }
```

**Step 8: Hardcode `legacyFallbackAllowed` in `summary`**

Find (line 224):
```js
      legacyFallbackAllowed: providerMeta?.legacyFallbackAllowed === true || cfg.allowLegacyFallback,
```
Replace with:
```js
      legacyFallbackAllowed: false,
```

**Step 9: Remove `allowLegacyFallback` from `config` in `report`**

Find (around line 241):
```js
        allowLegacyFallback: cfg.allowLegacyFallback,
```
Remove this line.

**Step 10: Remove `allowLegacyFallback` from `loadOperationalProvider()` call**

Find (around line 163):
```js
      allowLegacyFallback: cfg.allowLegacyFallback,
```
Remove this line.

**Step 11: Hardcode `legacyFallbackState` in catch block**

Find (around line 326):
```js
        legacyFallbackState: cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled',
```
Replace with:
```js
        legacyFallbackState: 'disabled',
```

---

### Task 3: TDD Green — Run drills, verify all pass

**Step 1: Run phase49 drills**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase49-legacy-removal-drill.mjs
```

Expected output:
```
[PASS] no_legacy_mode_branch
[PASS] legacy_fallback_state_hardcoded_disabled
[PASS] legacy_fallback_allowed_hardcoded_false
[PASS] allow_legacy_fallback_option_ignored

phase49 drills: 4 passed, 0 failed
```

**Step 2: Run regression — all existing phase drills**

```bash
npm run test:phase43
npm run test:phase44
npm run test:phase46
npm run test:phase47
npm run test:phase48
```

All must pass with 0 failures.

**Step 3: Commit green implementation**

```bash
git add scripts/observability-operational-provider.mjs scripts/phase42-observability-operational-provider-producer.mjs scripts/phase49-legacy-removal-drill.mjs
git commit -m "feat(phase49): surgical removal of dead legacy fallback branches"
```

---

### Task 4: Wire `test:phase49` to package.json and standalone-export.json

**Files:**
- Modify: `package.json`
- Modify: `config/standalone-export.json`

**Step 1: Add script to package.json**

Find the `test:phase48` entry in `package.json` scripts and add after it:
```json
"test:phase49": "node scripts/phase49-legacy-removal-drill.mjs",
```

**Step 2: Add to standalone-export.json validateCommands**

Find `config/standalone-export.json` and add `"npm run test:phase49"` to the `validateCommands` array, after `test:phase48`.

**Step 3: Verify scripts run**

```bash
npm run test:phase49
```

Expected: `phase49 drills: 4 passed, 0 failed`

**Step 4: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "feat(phase49): wire test:phase49 to package.json and standalone-export"
```

---

### Task 5: Sync to standalone repo and verify CI

**Context:**
Check `scripts/phase37-standalone-sync.mjs` for the sync command pattern. The standalone repo is at `../.export-repo` relative to project root. Use the existing sync script — do NOT push manually.

**Step 1: Run standalone sync**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase37-standalone-sync.mjs
```

Expected: files copied to `.export-repo`, no errors.

**Step 2: Commit and push to standalone repo**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/.export-repo
git add -A
git commit -m "feat(phase49): surgical removal of dead legacy fallback branches"
git push
```

**Step 3: Create PR and verify CI**

```bash
gh pr create --title "feat(phase49): surgical removal of dead legacy fallback branches" \
  --body "Removes dead legacy_files return branches from loadOperationalProvider(). Hardcodes legacyFallbackState:'disabled'. Phase 49."
```

Check CI at: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions

Expected: green run, all validateCommands pass including `test:phase49`.

---

### Task 6: Evidence + Memory + Handoff WIP commit

**Files:**
- Create: `docs/analise-projeto/60-fase-49-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Create evidence file**

```markdown
# 60 - Fase 49 — Remoção do Legacy Fallback

## Status: CONCLUÍDA
## Data: 2026-03-12

## O que foi removido

### `scripts/observability-operational-provider.mjs`
- `allowLegacyFallback` e `enforceNoLegacy` removidos de `cfg`
- Bloco `if (cfg.providerMode !== 'materialized_contract')` removido (retornava `mode:'legacy_files'`)
- Bloco `if (!contract && cfg.allowLegacyFallback)` removido (legacy fallback)
- `allowLegacyFallback: cfg.allowLegacyFallback` removido de `buildProviderMeta` output
- `legacyFallbackState` e `legacyFallbackAllowed` hardcoded como `'disabled'`/`false`

### `scripts/phase42-observability-operational-provider-producer.mjs`
- `allowLegacyFallback` removido de `cfg`
- `producerDescriptor.legacyFallbackAllowed` e `legacyFallbackState` hardcoded
- Bloco `if (cfg.allowLegacyFallback)` de violation removido
- `legacyFallbackAllowed` em `summary` hardcoded como `false`
- `allowLegacyFallback` removido de `config` no relatório e da chamada `loadOperationalProvider()`
- `legacyFallbackState` no catch block hardcoded como `'disabled'`

## O que foi mantido
- `buildLegacySources()` — ainda alimenta `buildMaterializedContract()` quando `collectorSources` é null

## Drills
- `no_legacy_mode_branch`: PASS
- `legacy_fallback_state_hardcoded_disabled`: PASS
- `legacy_fallback_allowed_hardcoded_false`: PASS
- `allow_legacy_fallback_option_ignored`: PASS

## Regressão
- `test:phase43`: PASS
- `test:phase44`: PASS
- `test:phase46`: PASS
- `test:phase47`: PASS
- `test:phase48`: PASS

## CI remoto
- PR: (preencher após push)
- Run: (preencher após CI)
```

**Step 2: Add row to memory table in `10-memoria-execucao-fases.md`**

Find the last row in the status table (Fase 48 row) and add after it:
```
| Fase 49 - Remoção cirúrgica do legacy fallback | CONCLUIDA | 2026-03-12 | 2026-03-12 | `60-fase-49-validacao.md` | Dead branches removidos; legacyFallbackState hardcoded 'disabled'; buildLegacySources mantida |
```

**Step 3: Update `HANDOFF.md`**

Replace the Estado atual section:
```markdown
## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 49
- Proxima fase liberada: Fase 50 (a definir)
- Fase em andamento: nenhuma
```

Update "O que foi concluido ate agora" to mention Phase 49:
```
- Fases 0 a 49 concluidas e registradas na memoria oficial.
- Os dead branches de `legacy_files` foram removidos do provider e producer.
- `legacyFallbackState` é sempre `'disabled'` hardcoded; `buildLegacySources()` mantida para o caminho file-reading.
```

Update "Ultima fase" section to reflect Phase 49.

**Step 4: Update `TODO_AI.md`**

Mark phase49 tasks as done, update "Proxima fase liberada: Fase 50".

**Step 5: Commit WIP**

```bash
git add docs/analise-projeto/60-fase-49-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md TODO_AI.md
git commit -m "handoff(phase49): legacy fallback branches removed — evidence + memory + handoff"
```
