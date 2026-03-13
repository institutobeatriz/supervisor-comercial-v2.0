# Phase 54 — Fechamento do Gap de CI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar `test:phase38`, `test:phase39`, `test:phase40`, `test:phase41` e `test:phase42` ao `config/standalone-export.json` validateCommands, corrigindo primeiro a regressão de `test:phase42` causada pelo phase46 (USE_COLLECTOR=true default).

**Architecture:** Patch cirúrgico de 1 linha em `phase42-observability-operational-provider-producer-drill.mjs` (adicionar `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false'` ao `commonEnv`). Criar `phase54-ci-gap-closure-drill.mjs` — meta-drill que spawna cada um dos 5 testes (38-42) e valida exit 0. Wirear `test:phase54`. Adicionar test:phase38-42 + test:phase54 ao validateCommands. Publicar via standalone:publish.

**Tech Stack:** Node.js ESModules, `node:child_process` (spawn), scripts MJS existentes (phase38-42 drills, phase37 standalone publish).

---

## Contexto crítico

- **Worktree:** `C:/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial`
- **Regressão fase42:** `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR` default virou `true` em Phase 46. O drill phase42 foi escrito antes disso e não define essa variável, então o collector roda em modo `synthetic` e o producer status vira `warn` ao invés de `pass`.
- **Fix:** Adicionar `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false'` ao `commonEnv` em `scripts/phase42-observability-operational-provider-producer-drill.mjs` (linha ~188).
- **Testes que passam localmente e devem entrar no CI:** test:phase38, test:phase39, test:phase40, test:phase41, test:phase42 (após fix)
- **Padrão drill phase54:** 1 drill por test já existente + 1 drill de regressão geral = 5 drills total

---

### Task 1: Corrigir regressão test:phase42

**Files:**
- Modify: `scripts/phase42-observability-operational-provider-producer-drill.mjs`

**Step 1: Localizar o objeto commonEnv**

Abrir `scripts/phase42-observability-operational-provider-producer-drill.mjs` e localizar o bloco `const commonEnv = {` (em torno da linha 188).

**Step 2: Adicionar USE_COLLECTOR=false ao commonEnv**

No objeto `commonEnv`, adicionar APÓS a linha `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',`:

```javascript
    FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false',
```

**Step 3: Verificar que test:phase42 passa agora**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run test:phase42
```

Esperado: exit 0, sem `[FAIL]`.

**Step 4: Verificar que test:phase51 e test:phase52 não regridem**

```bash
npm run test:phase51
npm run test:phase52
npm run test:phase53
```

Esperado: todos passando.

**Step 5: Commit**

```bash
git add scripts/phase42-observability-operational-provider-producer-drill.mjs
git commit -m "fix(phase54): restore phase42 drill by disabling collector (phase46 regression)"
```

---

### Task 2: Criar drill phase54-ci-gap-closure-drill.mjs

**Files:**
- Create: `scripts/phase54-ci-gap-closure-drill.mjs`

**Step 1: Criar o arquivo do drill**

Conteúdo completo:

```javascript
/**
 * Phase 54 — CI Gap Closure Drill
 * Drills: phase38_pass / phase39_pass / phase40_pass / phase41_pass / phase42_pass
 *
 * Meta-drill que valida que os testes phase38-42 passam como parte do CI.
 * Fecha o gap: esses testes existiam localmente mas não estavam no validateCommands.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase54-ci-gap-closure-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase54-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function runNpmTest(scriptName) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', scriptName], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Drill 1: phase38_pass
// ---------------------------------------------------------------------------
async function drillPhase38() {
  console.log('\n[Drill 1] phase38_pass — npm run test:phase38 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase38');
  assert(exitCode === 0, 'test:phase38 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 2: phase39_pass
// ---------------------------------------------------------------------------
async function drillPhase39() {
  console.log('\n[Drill 2] phase39_pass — npm run test:phase39 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase39');
  assert(exitCode === 0, 'test:phase39 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 3: phase40_pass
// ---------------------------------------------------------------------------
async function drillPhase40() {
  console.log('\n[Drill 3] phase40_pass — npm run test:phase40 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase40');
  assert(exitCode === 0, 'test:phase40 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 4: phase41_pass
// ---------------------------------------------------------------------------
async function drillPhase41() {
  console.log('\n[Drill 4] phase41_pass — npm run test:phase41 exits 0');
  const { exitCode, stderr } = await runNpmTest('test:phase41');
  assert(exitCode === 0, 'test:phase41 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

// ---------------------------------------------------------------------------
// Drill 5: phase42_pass
// ---------------------------------------------------------------------------
async function drillPhase42() {
  console.log('\n[Drill 5] phase42_pass — npm run test:phase42 exits 0 (collector disabled)');
  const { exitCode, stderr } = await runNpmTest('test:phase42');
  assert(exitCode === 0, 'test:phase42 exits 0', exitCode !== 0 ? `stderr=${stderr.slice(-200)}` : '');
}

const drills = [
  { name: 'phase38_pass', run: drillPhase38 },
  { name: 'phase39_pass', run: drillPhase39 },
  { name: 'phase40_pass', run: drillPhase40 },
  { name: 'phase41_pass', run: drillPhase41 },
  { name: 'phase42_pass', run: drillPhase42 },
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
```

**Step 2: Testar o drill**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase54-ci-gap-closure-drill.mjs
```

Esperado: `status=pass errors=0`, todos os 5 drills OK.

**Step 3: Adicionar test:phase54 em package.json**

Adicionar após `"test:phase53"`:
```json
"test:phase54": "node scripts/phase54-ci-gap-closure-drill.mjs",
```

**Step 4: Adicionar test:phase38-42 e test:phase54 em config/standalone-export.json**

No array `validateCommands`, adicionar APÓS `"npm run test:phase53"`:

```json
"npm run test:phase38",
"npm run test:phase39",
"npm run test:phase40",
"npm run test:phase41",
"npm run test:phase42",
"npm run test:phase54"
```

**Step 5: Verificar que npm run test:phase54 funciona via npm**

```bash
npm run test:phase54
```

Esperado: `status=pass errors=0`.

**Step 6: Regressão completa**

```bash
npm run test:phase52
npm run test:phase53
npm run build -w @supervisor/dashboard
```

**Step 7: Commit**

```bash
git add scripts/phase54-ci-gap-closure-drill.mjs package.json config/standalone-export.json
git commit -m "feat(phase54): add CI gap closure drill and wire phase38-42 to validateCommands"
```

---

### Task 3: Publicar via standalone e aguardar CI

**Step 1: Publicar**

```bash
npm run standalone:publish
```

Esperado: `[STANDALONE-PUBLISH] status=pass`.

**Step 2: Aguardar CI**

```bash
gh run watch --repo institutobeatriz/supervisor-comercial-v2.0 $(gh run list --repo institutobeatriz/supervisor-comercial-v2.0 --limit 1 --json databaseId --jq '.[0].databaseId')
```

Registrar: PR URL e CI run ID para handoff.

---

### Task 4: Evidência, memória, handoff

**Files:**
- Create: `docs/analise-projeto/65-fase-54-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Criar evidência 65-fase-54-validacao.md**

```markdown
# 65 - Fase 54 — Fechamento do Gap de CI (phase38-42)

## Status: CONCLUÍDA
## Data: 2026-03-13

## Objetivo
Fechar o gap entre os testes phase38-42 que existiam localmente mas não estavam
no `config/standalone-export.json` validateCommands. Corrigir a regressão do
`test:phase42` causada pela Fase 46 (USE_COLLECTOR=true se tornou default).

## O que foi entregue

### Fix: `scripts/phase42-observability-operational-provider-producer-drill.mjs`
- Adicionado `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR: 'false'` ao `commonEnv`
- Restaura comportamento original: testa o producer sem o collector
- Regressão da Fase 46 (USE_COLLECTOR default=true) corrigida

### Novo: `scripts/phase54-ci-gap-closure-drill.mjs`
- 5 drills: phase38_pass / phase39_pass / phase40_pass / phase41_pass / phase42_pass
- Meta-drill que valida exit 0 de cada teste

### `config/standalone-export.json`
- Adicionados: test:phase38, test:phase39, test:phase40, test:phase41, test:phase42, test:phase54

## Drills

| Drill | Resultado |
|---|---|
| `phase38_pass` | PASS |
| `phase39_pass` | PASS |
| `phase40_pass` | PASS |
| `phase41_pass` | PASS |
| `phase42_pass` | PASS |

## Build
- `npm run build -w @supervisor/dashboard`: ✅ sem erros TypeScript

## CI remoto
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/XX
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/XXXXXXXXXX
- Conclusão: success
```

**Step 2: Atualizar 10-memoria-execucao-fases.md**

Adicionar após Fase 53:
```
| Fase 54 - Fechamento do gap de CI (phase38-42) | CONCLUIDA | 2026-03-13 | 2026-03-13 | `65-fase-54-validacao.md` | Fix regressão phase42 drill (USE_COLLECTOR=false); drill phase54 meta-drill (5 drills); test:phase38-42 adicionados ao validateCommands; CI verde run XXXXXXXXXX |
```

**Step 3: Atualizar HANDOFF.md**

- `Ultima fase concluida`: Fase 54
- `Proxima fase liberada`: Fase 55 (a definir)
- Registrar CI run, PR, arquivos alterados

**Step 4: Atualizar TODO_AI.md**

- Marcar `[x] Fase 54: fechar gap CI phase38-42`
- Adicionar `[ ] Fase 55: a definir`

**Step 5: Commit**

```bash
git add docs/analise-projeto/65-fase-54-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md TODO_AI.md
git commit -m "handoff(phase54): CI gap closure — evidence + memory + handoff"
```

---

## Checklist final

- [ ] `npm run test:phase42` → pass (após fix USE_COLLECTOR=false)
- [ ] `node scripts/phase54-ci-gap-closure-drill.mjs` → `status=pass errors=0`
- [ ] `npm run test:phase54` → pass
- [ ] `npm run test:phase38` + 39 + 40 + 41 + 42 → todos passando
- [ ] `config/standalone-export.json` inclui test:phase38-42 e test:phase54
- [ ] `npm run build -w @supervisor/dashboard` → sem erros TS
- [ ] CI verde
- [ ] `65-fase-54-validacao.md` criado
- [ ] `10-memoria-execucao-fases.md` atualizado
- [ ] `HANDOFF.md` / `TODO_AI.md` atualizados
