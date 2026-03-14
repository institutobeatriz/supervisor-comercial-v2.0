# Phase 53 — minTeams Policy Drill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Formalizar a política de `minTeams` da gate do painel operacional, criando um drill (phase53) que documenta e valida o comportamento correto nos modos zero, violação e satisfeito.

**Architecture:** Criar `scripts/phase53-minteams-policy-drill.mjs` seguindo o padrão fase48/51/52 — 4 drills que testam diretamente o script `phase31-observability-panel-backend-integration.mjs` com dados sintéticos via env vars, verificando presença/ausência do código de violação `backend_teams_insufficient`. Wirear `test:phase53` em `package.json` e `config/standalone-export.json`. Publicar via `standalone:publish` e aguardar CI verde.

**Tech Stack:** Node.js ESModules, `node:child_process` (spawn), `node:fs/promises`, scripts MJS existentes (phase31 panel integration, phase37 standalone publish).

---

## Contexto crítico

- **Worktree:** `C:/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial`
- **Todos os comandos** devem rodar nesse diretório como `cwd`
- **Script alvo dos drills:** `scripts/phase31-observability-panel-backend-integration.mjs`
- **Config relevante nesse script:**
  - `minTeams: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS', 1))`
  - `enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS', false)`
  - `backendStore.teams` → array de times (lido de `FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE`)
  - Violação: `{ code: 'backend_teams_insufficient', blocking: true }` quando `teams.length < minTeams`
  - O script grava o relatório em `FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE`
- **Para isolar minTeams** nos drills, desabilitar outros requisitos via env:
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS=false`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS=false`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY=false`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE=false`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS=false`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING=false`
  - **Mas ainda fornecer** `backendReportFile` (JSON com `{status:'pass'}`) e `backendStoreFile` (JSON com `{teams: [...]}`) — linha 126 sempre checa `backendReport != null`
  - `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS` não pode ser zerado (Math.max(1,...)), mas com `REQUIRE_API_SLA_HISTORY=false` o `api_sla_missing` não dispara; o `api_sla_insufficient_points` ainda dispara se slaHistory=[] — fornecer slaPayloadFile com >=1 entry, ou aceitar essa violação (só verificar ausência de `backend_teams_insufficient`)
  - Estratégia preferida: fornecer `slaPayloadFile` com `{history: [{timestamp: <ISO>, environment: 'drill', status: 'pass', availabilityPct: 99, worstLatencyMs: 50}]}` × 5 entries para satisfazer `minSlaPoints=5` padrão
- **Padrão de report:** ler `panelReportFile` pós-execução, verificar `report.violations.map(v=>v.code)` contém/não-contém `backend_teams_insufficient`

---

### Task 1: Criar o drill phase53-minteams-policy-drill.mjs

**Files:**
- Create: `scripts/phase53-minteams-policy-drill.mjs`

**Step 1: Criar o arquivo completo do drill**

Conteúdo completo para `scripts/phase53-minteams-policy-drill.mjs`:

```javascript
/**
 * Phase 53 — minTeams Policy Drill
 * Drills: minteams_zero_no_violation / minteams_one_fires /
 *         minteams_one_satisfied / regression_phase31_drill
 *
 * Formaliza a política de minTeams na gate do painel operacional.
 * Valida que FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0 dispensa
 * o requisito de times, e que =1 dispara backend_teams_insufficient
 * quando teams=0, mas passa quando teams>=1.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase53-minteams-policy-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase53-drill');
const PANEL_SCRIPT = path.resolve(__dirname, 'phase31-observability-panel-backend-integration.mjs');
const PHASE31_DRILL = path.resolve(__dirname, 'phase31-observability-panel-backend-integration-drill.mjs');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function makeSlaHistory(n = 5) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 60_000).toISOString(),
    environment: 'drill',
    status: 'pass',
    availabilityPct: 99.9,
    worstLatencyMs: 45,
  }));
}

async function runPanel(drillId, extraEnv) {
  const panelReportFile = path.resolve(REPORT_DIR, `panel-report-${drillId}.json`);
  const backendReportFile = path.resolve(REPORT_DIR, `backend-report-${drillId}.json`);
  const backendStoreFile = path.resolve(REPORT_DIR, `backend-store-${drillId}.json`);
  const slaHistoryFile = path.resolve(REPORT_DIR, `sla-history-${drillId}.json`);

  // Provide required synthetic files
  await writeJson(backendReportFile, { status: 'pass', generatedAt: new Date().toISOString() });
  await writeJson(slaHistoryFile, { history: makeSlaHistory(5) });

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      // Isolate minTeams: disable other blocking requirements
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING: 'false',
      FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS: 'true',
      // Point to synthetic files
      FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE: panelReportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE: backendReportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: backendStoreFile,
      FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE: slaHistoryFile,
      FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE: path.resolve(REPORT_DIR, `panel-dashboard-${drillId}.html`),
      FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE: path.resolve(REPORT_DIR, `panel-audit-${drillId}.jsonl`),
      ...extraEnv,
      // backendStoreFile is set via extraEnv (contains the teams array)
    };

    const child = spawn('node', [PANEL_SCRIPT], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let exitCode = null;
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', async (code) => {
      exitCode = code;
      const report = await readJsonSafe(panelReportFile);
      resolve({ exitCode, report, panelReportFile, backendStoreFile });
    });
  });
}

// ---------------------------------------------------------------------------
// Drill 1: minteams_zero_no_violation
// ---------------------------------------------------------------------------
async function drillMinteamsZeroNoViolation() {
  console.log('\n[Drill 1] minteams_zero_no_violation — MIN_TEAMS=0 com 0 times: sem violação backend_teams_insufficient');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d1.json');
  await writeJson(storeFile, { teams: [], incidents: [], alerts: [] });

  const { report } = await runPanel('d1', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '0',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    !codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient NÃO dispara quando MIN_TEAMS=0 e teams=0',
    `violations=${JSON.stringify([...codes])}`,
  );
  console.log('  [INFO] decisão: MIN_TEAMS=0 => gate permissiva, sem exigência de times');
}

// ---------------------------------------------------------------------------
// Drill 2: minteams_one_fires
// ---------------------------------------------------------------------------
async function drillMinteamsOneFires() {
  console.log('\n[Drill 2] minteams_one_fires — MIN_TEAMS=1 com 0 times: backend_teams_insufficient dispara');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d2.json');
  await writeJson(storeFile, { teams: [], incidents: [], alerts: [] });

  const { report, exitCode } = await runPanel('d2', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '1',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient dispara quando MIN_TEAMS=1 e teams=0',
    `violations=${JSON.stringify([...codes])}`,
  );
  assert(exitCode !== 0, 'script exits non-zero com enforceTargets=true e teams_insufficient', `exitCode=${exitCode}`);
  console.log('  [INFO] gate é bloqueante quando ENFORCE_TARGETS=true e times insuficientes');
}

// ---------------------------------------------------------------------------
// Drill 3: minteams_one_satisfied
// ---------------------------------------------------------------------------
async function drillMinteamsOneSatisfied() {
  console.log('\n[Drill 3] minteams_one_satisfied — MIN_TEAMS=1 com 1 time: sem violação backend_teams_insufficient');

  const storeFile = path.resolve(REPORT_DIR, 'backend-store-d3.json');
  await writeJson(storeFile, { teams: [{ id: 'team-alpha', name: 'Team Alpha' }], incidents: [], alerts: [] });

  const { report } = await runPanel('d3', {
    FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS: '1',
    FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE: storeFile,
  });

  assert(report !== null, 'panel report foi escrito');
  const codes = new Set((report?.violations || []).map((v) => v?.code));
  assert(
    !codes.has('backend_teams_insufficient'),
    'backend_teams_insufficient NÃO dispara quando MIN_TEAMS=1 e teams=1',
    `violations=${JSON.stringify([...codes])}`,
  );
}

// ---------------------------------------------------------------------------
// Drill 4: regression_phase31_drill
// ---------------------------------------------------------------------------
async function drillRegressionPhase31() {
  console.log('\n[Drill 4] regression_phase31_drill — drill oficial do phase31 ainda passa');

  const { exitCode } = await new Promise((resolve) => {
    const child = spawn('node', [PHASE31_DRILL], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let exitCode = null;
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { exitCode = code; resolve({ exitCode }); });
  });

  assert(exitCode === 0, 'phase31 drill subprocess exits 0', `got=${exitCode}`);
}

const drills = [
  { name: 'minteams_zero_no_violation', run: drillMinteamsZeroNoViolation },
  { name: 'minteams_one_fires', run: drillMinteamsOneFires },
  { name: 'minteams_one_satisfied', run: drillMinteamsOneSatisfied },
  { name: 'regression_phase31_drill', run: drillRegressionPhase31 },
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

**Step 2: Testar o drill localmente**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase53-minteams-policy-drill.mjs
```

Esperado:
```
[phase53-minteams-policy-drill] Starting...
[Drill] minteams_zero_no_violation
  [OK] panel report foi escrito
  [OK] backend_teams_insufficient NÃO dispara quando MIN_TEAMS=0 e teams=0
  [INFO] decisão: MIN_TEAMS=0 => gate permissiva, sem exigência de times

[Drill] minteams_one_fires
  [OK] panel report foi escrito
  [OK] backend_teams_insufficient dispara quando MIN_TEAMS=1 e teams=0
  [OK] script exits non-zero com enforceTargets=true e teams_insufficient

[Drill] minteams_one_satisfied
  [OK] panel report foi escrito
  [OK] backend_teams_insufficient NÃO dispara quando MIN_TEAMS=1 e teams=1

[Drill] regression_phase31_drill
  [OK] phase31 drill subprocess exits 0

[phase53-minteams-policy-drill] status=pass errors=0
```

**Step 3: Commit do drill**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
git add scripts/phase53-minteams-policy-drill.mjs
git commit -m "test(phase53): add minTeams policy drill"
```

---

### Task 2: Wirear test:phase53 em package.json e standalone-export.json

**Files:**
- Modify: `package.json`
- Modify: `config/standalone-export.json`

**Step 1: Adicionar script test:phase53 em package.json**

No `package.json` raiz, localizar a seção `"scripts"` e adicionar após `test:phase52`:

```json
"test:phase53": "node scripts/phase53-minteams-policy-drill.mjs",
```

**Step 2: Adicionar test:phase53 em config/standalone-export.json**

No array `validateCommands`, adicionar após `"npm run test:phase52"`:

```json
"npm run test:phase53"
```

**Step 3: Verificar que test:phase53 roda via npm**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run test:phase53
```

Esperado: `status=pass errors=0` e exit 0.

**Step 4: Verificar build TS**

```bash
npm run build -w @supervisor/dashboard
```

Esperado: sem erros TypeScript.

**Step 5: Verificar regressão phase51 e phase52**

```bash
npm run test:phase51
npm run test:phase52
```

Esperado: ambos `status=pass errors=0`.

**Step 6: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "feat(phase53): wire test:phase53 to package.json and standalone-export"
```

---

### Task 3: Publicar via standalone e aguardar CI

**Files:** nenhum arquivo novo criado nessa task.

**Step 1: Publicar no standalone**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run standalone:publish
```

Esperado: `[STANDALONE-PUBLISH] status=pass` com `changes>=2`.

**Step 2: Aguardar e verificar CI**

Acessar https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions e confirmar run verde com `quality-and-smoke: ✅`.

Registrar o número do run CI para uso no handoff (formato: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/XXXXXXXXXX`).

---

### Task 4: Criar evidência, atualizar memória e handoff

**Files:**
- Create: `docs/analise-projeto/64-fase-53-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Criar evidência da Fase 53**

Criar `docs/analise-projeto/64-fase-53-validacao.md`:

```markdown
# 64 - Fase 53 — Política de minTeams na Gate do Painel Operacional

## Status: CONCLUÍDA
## Data: 2026-03-13

## Objetivo
Formalizar e validar a política de `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS`
na gate do painel operacional (`phase31-observability-panel-backend-integration.mjs`).
A política define: MIN_TEAMS=0 é permissiva (sem exigência de times), MIN_TEAMS>=1
é restritiva (gate falha com `backend_teams_insufficient` quando `teams.length < minTeams`).

## Decisão documentada
- Em ambientes CI sem dados reais de times, usar `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0`
  para evitar falhas espúrias por `backend_teams_insufficient`.
- Em produção, `MIN_TEAMS=1` (ou maior) garante que a gate exige times configurados.
- O default do script permanece `1` (conservador). A decisão de usar `0` é explícita via env.

## Drills

| Drill | Resultado |
|---|---|
| `minteams_zero_no_violation` | PASS |
| `minteams_one_fires` | PASS |
| `minteams_one_satisfied` | PASS |
| `regression_phase31_drill` | PASS |

## Build
- `npm run build -w @supervisor/dashboard`: ✅ sem erros TypeScript

## Regressão

| Teste | Resultado |
|---|---|
| `npm run test:phase53` | 4 passed, 0 failed |
| `npm run test:phase52` | 4 passed, 0 failed |
| `npm run test:phase51` | 4 passed, 0 failed |

## CI remoto
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/XX
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/XXXXXXXXXX
- Conclusão: success

## Commits desta fase
- `test(phase53): add minTeams policy drill`
- `feat(phase53): wire test:phase53 to package.json and standalone-export`
```

> Substituir `XX` e `XXXXXXXXXX` pelos valores reais do PR e CI run.

**Step 2: Atualizar docs/analise-projeto/10-memoria-execucao-fases.md**

Adicionar linha após a entrada da Fase 52:

```
| Fase 53 - Política de minTeams na gate do painel operacional | CONCLUIDA | 2026-03-13 | 2026-03-13 | `64-fase-53-validacao.md` | Drill formaliza política: MIN_TEAMS=0 permissivo (sem exigência de times), MIN_TEAMS>=1 exige teams>=n; 4 drills passando; build TS OK; CI verde run XXXXXXXXXX |
```

**Step 3: Atualizar HANDOFF.md**

Atualizar seções:
- `Ultima fase concluida`: Fase 53
- `Proxima fase liberada`: Fase 54 (a definir)
- Registrar CI run e PR
- Listar arquivos alterados da fase

**Step 4: Atualizar TODO_AI.md**

- Marcar `[x] Fase 53` com descrição da entrega
- Marcar `[x] Revisar politica minTeams=0 da gate final do painel`
- Adicionar `[ ] Fase 54: a definir — avaliar proxima necessidade conforme plano de conclusao`

**Step 5: Commit de handoff**

```bash
git add docs/analise-projeto/64-fase-53-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md TODO_AI.md
git commit -m "handoff(phase53): minTeams policy drill — evidence + memory + handoff"
```

---

## Checklist final

- [ ] `node scripts/phase53-minteams-policy-drill.mjs` → `status=pass errors=0`
- [ ] `npm run test:phase53` → pass
- [ ] `npm run test:phase52` → pass (regressão)
- [ ] `npm run test:phase51` → pass (regressão)
- [ ] `npm run build -w @supervisor/dashboard` → sem erros TS
- [ ] `npm run standalone:publish` → CI verde
- [ ] `docs/analise-projeto/64-fase-53-validacao.md` criado
- [ ] `docs/analise-projeto/10-memoria-execucao-fases.md` atualizado com Fase 53
- [ ] `HANDOFF.md` atualizado: ultima=53, proxima=54
- [ ] `TODO_AI.md` atualizado: fase53 marcada, minTeams marcada
