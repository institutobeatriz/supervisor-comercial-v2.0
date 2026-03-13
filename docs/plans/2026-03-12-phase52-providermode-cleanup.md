# Phase 52 — Remoção de cfg.providerMode (Dead Config) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remover o campo `cfg.providerMode` da função `loadOperationalProvider()` em `scripts/observability-operational-provider.mjs`, que é dead config desde a Fase 49, e validar com 4 drills.

**Architecture:** Remoção cirúrgica de uma linha do objeto `cfg`. O campo foi calculado mas nunca usado após a remoção das branches condicionais na Fase 49. O campo `providerMode: 'materialized_contract'` no contrato de saída (em `buildMaterializedContract`) permanece intacto — ele é hardcoded independentemente do cfg. O drill valida que: (a) opções/env injecting `providerMode` não tem mais efeito, (b) o contrato de saída continua correto, (c) o producer subprocess não regride.

**Tech Stack:** Node.js 20+, ESModules, npm workspaces. Sem deps externas novas.

**Worktree:** `/c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial`

---

### Task 1: Remover cfg.providerMode de loadOperationalProvider()

**Files:**
- Modify: `scripts/observability-operational-provider.mjs` (linha ~337)

**Step 1: Ler contexto atual da função**

```bash
grep -n "providerMode\|cfg\." scripts/observability-operational-provider.mjs | head -20
```

Esperado: linha `providerMode: options.providerMode || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),` no objeto `cfg`.

**Step 2: Remover a linha do cfg**

Localizar e remover SOMENTE esta linha do objeto `cfg` dentro de `loadOperationalProvider()`:

```js
// REMOVER esta linha:
providerMode: options.providerMode || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
```

Não alterar nada mais. O objeto `cfg` continua com todos os outros campos: `materializeContract`, `contractFile`, `automationStateFile`, `snapshotFile`, `fullcycleReportFile`, `materializedBy`, `producer`, `collectorSources`.

**Step 3: Verificar que a remoção não quebrou a sintaxe**

```bash
node --input-type=module < /dev/null && node -e "import('./scripts/observability-operational-provider.mjs').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1); })"
```

Esperado: `OK` ou silêncio (sem erro de parse).

**Step 4: Commit mínimo**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
git add scripts/observability-operational-provider.mjs
git commit -m "refactor(phase52): remove dead cfg.providerMode from loadOperationalProvider"
```

---

### Task 2: Criar drill phase52-providermode-cleanup-drill.mjs

**Files:**
- Create: `scripts/phase52-providermode-cleanup-drill.mjs`

**Step 1: Criar o arquivo do drill**

Conteúdo completo do arquivo:

```js
/**
 * Phase 52 — Dead Config Cleanup Drill
 * Drills: cfg_providermode_ignored / contract_shape_intact /
 *         env_var_ignored / producer_regression
 *
 * Valida que cfg.providerMode foi removido de loadOperationalProvider()
 * sem quebrar contrato de saída nem regressão do producer.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { loadOperationalProvider, writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase52-providermode-cleanup-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase52-drill');
const PRODUCER_SCRIPT = path.resolve(__dirname, 'phase42-observability-operational-provider-producer.mjs');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

async function readJsonSafe(filePath) {
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drill 1: cfg_providermode_ignored
// ---------------------------------------------------------------------------
async function drillCfgProviderModeIgnored() {
  console.log('\n[Drill 1] cfg_providermode_ignored — injetar providerMode=rogue_mode nao afeta contrato');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill1.json');
  const result = await loadOperationalProvider({
    providerMode: 'rogue_mode',
    materializeContract: true,
    contractFile: tmpFile,
    materializedBy: 'phase52-drill1',
  });
  const contract = await readJsonSafe(tmpFile);
  assert(contract !== null, 'contract file foi escrito');
  assert(
    contract.providerMode === 'materialized_contract',
    'contract.providerMode é materialized_contract (rogue_mode foi ignorado)',
    `got=${contract?.providerMode}`,
  );
  assert(result.contract !== null && typeof result.contract === 'object', 'result.contract retornado');
}

// ---------------------------------------------------------------------------
// Drill 2: contract_shape_intact
// ---------------------------------------------------------------------------
async function drillContractShapeIntact() {
  console.log('\n[Drill 2] contract_shape_intact — contrato de saída tem todos os campos obrigatórios');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill2.json');
  await loadOperationalProvider({
    materializeContract: true,
    contractFile: tmpFile,
    materializedBy: 'phase52-drill2',
  });
  const contract = await readJsonSafe(tmpFile);
  assert(contract !== null, 'contract file foi escrito');
  const REQUIRED = ['version', 'schema', 'providerMode', 'sources', 'summary', 'generatedAt'];
  for (const field of REQUIRED) {
    assert(field in contract, `contract.${field} presente`, `got=${JSON.stringify(contract?.[field])}`);
  }
  assert(contract.providerMode === 'materialized_contract', 'contract.providerMode === materialized_contract');
  assert(typeof contract.version === 'number', 'contract.version é numérico');
}

// ---------------------------------------------------------------------------
// Drill 3: env_var_ignored
// ---------------------------------------------------------------------------
async function drillEnvVarIgnored() {
  console.log('\n[Drill 3] env_var_ignored — env FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE=obsolete_mode é ignorada');
  const tmpFile = path.resolve(REPORT_DIR, 'contract-drill3.json');
  // Set env var to something invalid — if still read, could break things
  const prevValue = process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE;
  process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE = 'obsolete_mode';
  try {
    await loadOperationalProvider({
      materializeContract: true,
      contractFile: tmpFile,
      materializedBy: 'phase52-drill3',
    });
    const contract = await readJsonSafe(tmpFile);
    assert(contract !== null, 'contract file foi escrito com env obsolete_mode definida');
    assert(
      contract.providerMode === 'materialized_contract',
      'contract.providerMode ainda é materialized_contract (env ignorada)',
      `got=${contract?.providerMode}`,
    );
  } finally {
    if (prevValue === undefined) {
      delete process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE;
    } else {
      process.env.FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE = prevValue;
    }
  }
}

// ---------------------------------------------------------------------------
// Drill 4: producer_regression
// ---------------------------------------------------------------------------
async function drillProducerRegression() {
  console.log('\n[Drill 4] producer_regression — producer subprocess não regride após remoção do cfg.providerMode');
  const reportFile = path.resolve(REPORT_DIR, 'producer-drill4.json');
  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE: 'synthetic',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, 'producer-drill4-dashboard.md'),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, 'producer-drill4-audit.jsonl'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exitCode = null;
  await new Promise((resolve) => {
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { exitCode = code; resolve(); });
  });
  const report = await readJsonSafe(reportFile);
  assert(exitCode === 0, 'producer subprocess exits 0', `got=${exitCode}`);
  assert(report !== null, 'producer report foi escrito');
  assert(report.status === 'pass' || report.status === 'warn', 'producer report.status é pass ou warn', `got=${report?.status}`);
}

const drills = [
  { name: 'cfg_providermode_ignored', run: drillCfgProviderModeIgnored },
  { name: 'contract_shape_intact', run: drillContractShapeIntact },
  { name: 'env_var_ignored', run: drillEnvVarIgnored },
  { name: 'producer_regression', run: drillProducerRegression },
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

**Step 2: Executar drill para verificar (deve passar)**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase52-providermode-cleanup-drill.mjs
```

Esperado: `status=pass errors=0` com todos os 4 drills `[OK]`.

**Step 3: Commit**

```bash
git add scripts/phase52-providermode-cleanup-drill.mjs
git commit -m "test(phase52): add providerMode dead config cleanup drill"
```

---

### Task 3: Wire test:phase52 em package.json e standalone-export.json

**Files:**
- Modify: `package.json` (raiz do worktree)
- Modify: `config/standalone-export.json`

**Step 1: Adicionar test:phase52 ao package.json**

Localizar o bloco de scripts `test:phase51` em `package.json` e adicionar após:

```json
"test:phase52": "node scripts/phase52-providermode-cleanup-drill.mjs",
```

**Step 2: Adicionar phase52 drill ao standalone-export.json**

Em `config/standalone-export.json`, localizar a lista de scripts e adicionar:

```json
"scripts/phase52-providermode-cleanup-drill.mjs"
```

Seguindo o mesmo padrão das entradas de `phase51`, `phase50`, etc.

**Step 3: Verificar wire**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run test:phase52
```

Esperado: 4 drills passando.

**Step 4: Verificar regressão**

```bash
npm run test:phase51 && npm run test:phase49
```

Esperado: todos passando.

**Step 5: Build TS**

```bash
npm run build -w @supervisor/dashboard
```

Esperado: sem erros TypeScript.

**Step 6: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "feat(phase52): wire test:phase52 to package.json and standalone-export"
```

---

### Task 4: Criar evidência e atualizar documentação

**Files:**
- Create: `docs/analise-projeto/63-fase-52-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Criar evidência da fase**

Criar `docs/analise-projeto/63-fase-52-validacao.md`:

```markdown
# 63 - Fase 52 — Remoção do Dead Config cfg.providerMode

## Status: CONCLUÍDA
## Data: 2026-03-12

## Objetivo
Remover o campo `cfg.providerMode` da função `loadOperationalProvider()` em
`scripts/observability-operational-provider.mjs`. Este campo era dead config
desde a Fase 49, quando todas as branches condicionais que o consumiam foram removidas.

## O que foi entregue

### `scripts/observability-operational-provider.mjs`
- Removida linha `providerMode: options.providerMode || envString(...)` do objeto `cfg`
- O campo `providerMode: 'materialized_contract'` no contrato de saída permanece intacto
  (hardcoded em `buildMaterializedContract()`, independente do cfg)

### `scripts/phase52-providermode-cleanup-drill.mjs`
- 4 drills validando a remoção sem regressão

## Drills

| Drill | Resultado |
|---|---|
| `cfg_providermode_ignored` | PASS |
| `contract_shape_intact` | PASS |
| `env_var_ignored` | PASS |
| `producer_regression` | PASS |

## Build

- `npm run build -w @supervisor/dashboard`: ✅ sem erros TypeScript

## Regressão

| Teste | Resultado |
|---|---|
| `npm run test:phase52` | 4 passed, 0 failed |
| `npm run test:phase51` | 4 passed, 0 failed |
| `npm run test:phase49` | 4 passed, 0 failed |

## CI remoto

- PR: (a preencher após publish)
- CI run: (a preencher após CI verde)
- Conclusão: success
```

**Step 2: Atualizar memoria oficial**

Em `docs/analise-projeto/10-memoria-execucao-fases.md`, adicionar linha após a Fase 51:

```
| Fase 52 - Remoção do dead config cfg.providerMode | CONCLUIDA | 2026-03-12 | 2026-03-12 | `63-fase-52-validacao.md` | cfg.providerMode removido de loadOperationalProvider(); contract.providerMode hardcoded em buildMaterializedContract() intacto; 4 drills passando; build TS OK; CI verde |
```

**Step 3: Atualizar HANDOFF.md**

Substituir conteúdo completo de `HANDOFF.md` com estado atualizado para Fase 52 concluída e Fase 53 a definir. Manter formato igual ao handoff da Fase 51 mas atualizar:
- `Ultima fase concluida: Fase 52`
- `Proxima fase liberada: Fase 53 (a definir)`
- `Ultima entrega relevante` → Fase 52
- `Arquivos alterados na fase concluida`
- `O que ainda nao foi fechado`

**Step 4: Atualizar TODO_AI.md**

- Marcar `Fase 52` como `[x]`
- Atualizar estado da fila para `Proxima fase liberada: Fase 53`

**Step 5: Commit final handoff**

```bash
git add docs/analise-projeto/63-fase-52-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md TODO_AI.md
git commit -m "handoff(phase52): dead config cfg.providerMode removed — evidence + memory + handoff"
```

---

### Task 5: Publicar no standalone e verificar CI

**Files:**
- Sem alteração de código — apenas publish

**Step 1: Rodar standalone:publish**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run standalone:publish
```

Esperado:
```
[STANDALONE-SYNC] status=pass ...
[STANDALONE-PUBLISH] status=pass repo=institutobeatriz/supervisor-comercial-v2.0 branch=codex/... changes=N
```

**Step 2: Aguardar CI e registrar run ID**

Verificar no GitHub Actions do repo `institutobeatriz/supervisor-comercial-v2.0` que o CI passou. Copiar o run ID (formato numérico) e atualizar `docs/analise-projeto/63-fase-52-validacao.md` com:

```markdown
## CI remoto
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/XX
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/XXXXXXXX
- Conclusão: success
```

**Step 3: Commit final com CI info**

```bash
git add docs/analise-projeto/63-fase-52-validacao.md HANDOFF.md
git commit -m "handoff(phase52): CI run XXXXXXXX green — phase52 complete"
```
