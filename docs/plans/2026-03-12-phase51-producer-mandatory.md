# Phase 51 — Producer Mandatory Enforcement Drill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar o drill `phase51-producer-mandatory-drill.mjs` que formaliza via testes de contrato a decisão de que `backend/producer` é obrigatório sem fallback em todos os ambientes, fechando os TODOs de alta prioridade da Fase 51.

**Architecture:** Drill puro de contrato (sem alteração em código de produção) que segue o padrão phase46 — executa o producer como subprocess com `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=synthetic` para determinismo, lê o report JSON gerado, e valida os campos de enforcement. O mesmo arquivo vai em `scripts/` (main) e `.export-repo/scripts/` (CI standalone).

**Tech Stack:** Node.js ESM, `node:child_process` spawn, JSON report validation, mesmo padrão de phase46/phase49/phase50 drills.

---

### Task 1: Criar o drill script

**Files:**
- Create: `scripts/phase51-producer-mandatory-drill.mjs`

**Step 1: Criar o drill script com os 4 drills**

Escrever `scripts/phase51-producer-mandatory-drill.mjs` com o conteúdo exato abaixo:

```javascript
/**
 * Phase 51 — Producer Mandatory Enforcement Drill
 * Drills: producer_config_require_flags / producer_descriptor_enforcement /
 *         collector_mandatory_default / producer_status_pass
 *
 * Decisão formal: backend/producer é obrigatório sem fallback em todos os ambientes
 * desde a Fase 51. Este drill valida que o enforcement já está em vigor.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { writeJson } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRILL_NAME = 'phase51-producer-mandatory-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase51-drill');
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

async function runProducer(extraEnv = {}, reportSuffix = 'default') {
  const reportFile = path.resolve(REPORT_DIR, `producer-${reportSuffix}.json`);
  const child = spawn('node', [PRODUCER_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE: 'synthetic',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE: reportFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE: path.resolve(REPORT_DIR, `producer-${reportSuffix}-dashboard.md`),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE: path.resolve(REPORT_DIR, `producer-${reportSuffix}-audit.jsonl`),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let status = null;
  await new Promise((resolve) => {
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.on('close', (code) => { status = code; resolve(); });
  });
  const report = await readJsonSafe(reportFile);
  return { status, report, reportFile };
}

// ---------------------------------------------------------------------------
// Drill 1: producer_config_require_flags
// ---------------------------------------------------------------------------
async function drillProducerConfigRequireFlags() {
  console.log('\n[Drill 1] producer_config_require_flags — requireProvider=true, requireProducer=true in config');
  const { report } = await runProducer({}, 'drill1');
  assert(report !== null, 'producer report was written');
  assert(report.config !== undefined, 'report.config exists');
  assert(report.config.requireProvider === true, 'config.requireProvider is true');
  assert(report.config.requireProducer === true, 'config.requireProducer is true');
}

// ---------------------------------------------------------------------------
// Drill 2: producer_descriptor_enforcement
// ---------------------------------------------------------------------------
async function drillProducerDescriptorEnforcement() {
  console.log('\n[Drill 2] producer_descriptor_enforcement — legacyFallbackAllowed=false, legacyFallbackState=disabled, ready=true');
  const { report } = await runProducer({}, 'drill2');
  assert(report !== null, 'producer report was written');
  const descriptor = report.producer?.operationalProvider;
  assert(descriptor !== undefined && descriptor !== null, 'report.producer.operationalProvider exists');
  assert(descriptor.legacyFallbackAllowed === false, 'descriptor.legacyFallbackAllowed is false');
  assert(descriptor.legacyFallbackState === 'disabled', 'descriptor.legacyFallbackState is disabled');
  assert(descriptor.ready === true, 'descriptor.ready is true');
}

// ---------------------------------------------------------------------------
// Drill 3: collector_mandatory_default
// ---------------------------------------------------------------------------
async function drillCollectorMandatoryDefault() {
  console.log('\n[Drill 3] collector_mandatory_default — collectorEnabled=true, collectorMode=synthetic in summary (default collector path)');
  const { report } = await runProducer({}, 'drill3');
  assert(report !== null, 'producer report was written');
  assert(typeof report.summary === 'object' && report.summary !== null, 'report.summary exists');
  assert(report.summary.collectorEnabled === true, 'summary.collectorEnabled is true (USE_COLLECTOR default=true)');
  assert(report.config.useCollector === true, 'config.useCollector is true');
  assert(typeof report.summary.collectorMode === 'string', 'summary.collectorMode is a string');
}

// ---------------------------------------------------------------------------
// Drill 4: producer_status_pass
// ---------------------------------------------------------------------------
async function drillProducerStatusPass() {
  console.log('\n[Drill 4] producer_status_pass — producer exits 0 and report.status === pass');
  const { status, report } = await runProducer({}, 'drill4');
  assert(status === 0, 'producer exits with code 0', `got ${status}`);
  assert(report !== null, 'producer report was written');
  assert(report.status === 'pass', 'report.status is pass', `got ${report?.status}`);
}

const drills = [
  { name: 'producer_config_require_flags', run: drillProducerConfigRequireFlags },
  { name: 'producer_descriptor_enforcement', run: drillProducerDescriptorEnforcement },
  { name: 'collector_mandatory_default', run: drillCollectorMandatoryDefault },
  { name: 'producer_status_pass', run: drillProducerStatusPass },
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

**Step 2: Executar o drill para confirmar que passa**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase51-producer-mandatory-drill.mjs
```

Expected: 4 drills `[OK]`, status=pass, exit 0.

**Step 3: Commit**

```bash
git add scripts/phase51-producer-mandatory-drill.mjs
git commit -m "test(phase51): add producer mandatory enforcement drill"
```

---

### Task 2: Copiar drill para .export-repo e wirear package.json

**Files:**
- Create: `.export-repo/scripts/phase51-producer-mandatory-drill.mjs` (cópia do script acima)
- Modify: `package.json` (raiz) — adicionar `test:phase51`
- Modify: `config/standalone-export.json` — adicionar `"npm run test:phase51"` na lista de drills

**Step 1: Copiar o drill para o export-repo**

```bash
cp scripts/phase51-producer-mandatory-drill.mjs .export-repo/scripts/phase51-producer-mandatory-drill.mjs
```

**Step 2: Verificar que o arquivo existe em ambos os lugares**

```bash
ls scripts/phase51-producer-mandatory-drill.mjs .export-repo/scripts/phase51-producer-mandatory-drill.mjs
```

Expected: ambos os arquivos listados.

**Step 3: Adicionar `test:phase51` ao `package.json`**

No `package.json` da raiz, adicionar após a linha `"test:phase50"`:
```json
"test:phase51": "node scripts/phase51-producer-mandatory-drill.mjs",
```

**Step 4: Adicionar `test:phase51` ao `config/standalone-export.json`**

No `config/standalone-export.json`, na lista `"drills"`, adicionar após `"npm run test:phase50"`:
```json
"npm run test:phase51"
```

**Step 5: Executar o drill a partir do export-repo para confirmar**

```bash
cd .export-repo && node scripts/phase51-producer-mandatory-drill.mjs
```

Expected: 4 drills passando, status=pass.

**Step 6: Executar regressão**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run test:phase51
npm run test:phase50
npm run test:phase49
npm run build -w @supervisor/dashboard
```

Expected: todos passando, build sem erros TS.

**Step 7: Commit**

```bash
git add .export-repo/scripts/phase51-producer-mandatory-drill.mjs package.json config/standalone-export.json
git commit -m "feat(phase51): wire test:phase51 to package.json and standalone-export"
```

---

### Task 3: Criar evidência e atualizar handoff

**Files:**
- Create: `docs/analise-projeto/62-fase-51-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Criar evidence file**

Criar `docs/analise-projeto/62-fase-51-validacao.md` com:
- Status: CONCLUÍDA, Data: 2026-03-12
- Objetivo (decidir quando producer vira obrigatório)
- Decisão formal documentada
- Tabela dos 4 drills (nome → PASS)
- Build OK
- Regressão phase50/phase49 OK
- CI run: (preencher após CI verde)

**Step 2: Atualizar memória oficial**

Em `docs/analise-projeto/10-memoria-execucao-fases.md`, adicionar linha após Fase 50:

```
| Fase 51 - Drill de enforcement do producer obrigatório | CONCLUIDA | 2026-03-12 | 2026-03-12 | `62-fase-51-validacao.md` | Drill formaliza decisão: backend/producer obrigatório sem fallback desde Fase 51; requireProvider=true, requireProducer=true, legacyFallbackAllowed=false, collectorEnabled=true; 4 drills passando; CI verde |
```

**Step 3: Atualizar HANDOFF.md**

- Ultima fase concluida: Fase 51
- Proxima fase liberada: Fase 52 (a definir)
- Marcar items concluídos e O que foi entregue na Fase 51

**Step 4: Atualizar TODO_AI.md**

- Marcar `[x] Fase 51: avaliar proxima necessidade conforme plano de conclusao`
- Marcar `[x] Fase 51: decidir quando backend/producer vira obrigatorio sem fallback em todos os ambientes`
- Adicionar `[ ] Fase 52: (a definir)`

**Step 5: Commit de handoff**

```bash
git add docs/analise-projeto/62-fase-51-validacao.md docs/analise-projeto/10-memoria-execucao-fases.md HANDOFF.md TODO_AI.md
git commit -m "handoff(phase51): producer mandatory enforcement — evidence + memory + handoff"
```

---

### Task 4: Push para CI remoto

**Step 1: Push do worktree para o repo standalone**

Seguir o fluxo do `docs/standalone-repo-flow.md` — o workflow CI roda automaticamente no push. Verificar o resultado do CI run.

**Step 2: Verificar CI verde**

Confirmar run verde no GitHub Actions em `institutobeatriz/supervisor-comercial-v2.0`.

**Step 3: Atualizar evidência com CI run ID**

Editar `docs/analise-projeto/62-fase-51-validacao.md` para incluir a URL do CI run e confirmar success.

**Step 4: Commit final**

```bash
git add docs/analise-projeto/62-fase-51-validacao.md
git commit -m "docs(phase51): add CI run link to evidence"
```
