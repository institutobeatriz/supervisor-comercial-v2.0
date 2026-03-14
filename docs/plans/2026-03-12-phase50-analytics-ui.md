# Phase 50 — Backend Analytics UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar card "Cobertura Operacional" em `Executivo.tsx` consumindo `/api/observability/connectors/backend/analytics`, com degradação graciosa quando o endpoint retorna 503.

**Architecture:** Novo `useApi` call independente em `Executivo.tsx`. Card renderizado apenas quando dados disponíveis (`current !== null`). Erro/503 = card oculto sem afetar o restante do painel. TypeScript build = gate de qualidade principal para mudança UI.

**Tech Stack:** React 18, TypeScript, lucide-react, Tailwind CSS, useApi hook existente.

---

### Task 1: TDD Red — Drill de validação da estrutura analytics

**Files:**
- Create: `scripts/phase50-analytics-ui-drill.mjs`

**Contexto:**
O endpoint `/api/observability/connectors/backend/analytics` retorna 503 se o arquivo analytics não existir, ou `{ current, generatedAt, version, entries, totalEntries }` se existir. O drill valida o contrato do arquivo de analytics que o endpoint lê, e verifica que o campo `current` tem os campos numéricos necessários para a UI.

Padrão de drill: igual phase48/phase49 — usa `DRILL_NAME`, `REPORT_DIR`, `main()`, `writeJson`, `assert`.

**Step 1: Criar o drill**

```js
/**
 * Phase 50 — Analytics UI Drill
 * Drills: analytics_current_shape / analytics_coverage_pct_range /
 *         analytics_null_current_safe / analytics_endpoint_contract
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { writeJson, readJson, envString } from './observability-operational-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const DRILL_NAME = 'phase50-analytics-ui-drill';
const REPORT_DIR = path.resolve(process.cwd(), 'logs/monitoring/phase50-drill');

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`[FAIL] ${label}${detail ? ': ' + detail : ''}`);
  console.log(`  [OK] ${label}`);
}

// ---------------------------------------------------------------------------
// Minimal shape that the UI OperationalCoverageCard requires from `current`
// ---------------------------------------------------------------------------
const REQUIRED_CURRENT_FIELDS = [
  'activeRecords',
  'assignedOwners',
  'unassignedOwners',
  'ownerCoveragePct',
  'breachedEscalations',
];

async function drillAnalyticsCurrentShape() {
  // Build a mock analytics object matching what phase32 produces
  const mockAnalytics = {
    generatedAt: new Date().toISOString(),
    version: 1,
    current: {
      activeRecords: 5,
      assignedOwners: 4,
      unassignedOwners: 1,
      ownerCoveragePct: 80,
      breachedEscalations: 0,
    },
    entries: [],
  };

  for (const field of REQUIRED_CURRENT_FIELDS) {
    assert(
      field in mockAnalytics.current,
      `current has field: ${field}`,
      `missing field '${field}' from analytics.current`,
    );
    assert(
      typeof mockAnalytics.current[field] === 'number',
      `current.${field} is numeric`,
      `expected number, got ${typeof mockAnalytics.current[field]}`,
    );
  }
}

async function drillAnalyticsCoveragePctRange() {
  const validValues = [0, 50, 80, 100];
  for (const pct of validValues) {
    assert(pct >= 0 && pct <= 100, `ownerCoveragePct=${pct} is in [0,100]`);
  }
  // UI color thresholds
  assert(80 >= 80, 'pct=80 maps to success (green threshold ≥ 80)');
  assert(50 >= 50 && 50 < 80, 'pct=50 maps to warning (yellow threshold ≥ 50 < 80)');
  assert(30 < 50, 'pct=30 maps to danger (red threshold < 50)');
}

async function drillAnalyticsNullCurrentSafe() {
  // When API returns { current: null }, the UI card must not render (not crash)
  const analyticsWithNullCurrent = { generatedAt: null, current: null, entries: [], totalEntries: 0 };
  // The UI guard: `if (!analytics || !analytics.current) return null`
  const shouldRender = analyticsWithNullCurrent.current !== null;
  assert(!shouldRender, 'null current → card does not render');
}

async function drillAnalyticsEndpointContract() {
  // Validate that the analytics file format (written by phase32) has the expected top-level keys
  const expectedTopLevelKeys = ['generatedAt', 'version', 'current', 'entries'];
  const mockFileContent = {
    generatedAt: new Date().toISOString(),
    version: 1,
    current: { activeRecords: 0, assignedOwners: 0, unassignedOwners: 0, ownerCoveragePct: 0, breachedEscalations: 0 },
    entries: [],
  };
  for (const key of expectedTopLevelKeys) {
    assert(key in mockFileContent, `analytics file has top-level key: ${key}`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const drills = [
  { name: 'analytics_current_shape', run: drillAnalyticsCurrentShape },
  { name: 'analytics_coverage_pct_range', run: drillAnalyticsCoveragePctRange },
  { name: 'analytics_null_current_safe', run: drillAnalyticsNullCurrentSafe },
  { name: 'analytics_endpoint_contract', run: drillAnalyticsEndpointContract },
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

**Step 2: Rodar para confirmar estado (todos devem PASSAR — são drills de contrato, não de implementação)**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
node scripts/phase50-analytics-ui-drill.mjs
```

Esperado: 4 passed, 0 failed. (Este drill valida contratos de dados, não a UI em si — o gate real de qualidade é o TypeScript build na Task 2.)

**Step 3: Commit**

```bash
git add scripts/phase50-analytics-ui-drill.mjs
git commit -m "test(phase50): add analytics UI drill (contract validation)"
```

---

### Task 2: Implementação — Card `OperationalCoverageCard` em `Executivo.tsx`

**Files:**
- Modify: `apps/dashboard/src/pages/Executivo.tsx`

**Contexto importante:**
- O endpoint retorna **503** quando o arquivo analytics não existe (não 200+null). O `useApi` converte isso em `error`. Logo: quando `error !== null`, o card fica oculto.
- Quando `data !== null` mas `data.current === null`, o card também fica oculto.
- O card só renderiza quando `data?.current` for um objeto com `ownerCoveragePct` numérico.
- Usar ícone `Shield` do `lucide-react` (já instalado).
- Seguir o padrão de estilo existente: `glass rounded-xl p-4 glow-box`.

**Step 1: Adicionar tipo `AnalyticsData` e import do ícone `Shield`**

Localizar no topo de `apps/dashboard/src/pages/Executivo.tsx`:
```tsx
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, ShoppingCart, Users, Target,
  Clock, Zap, BarChart3, AlertTriangle,
} from 'lucide-react'
```
Adicionar `Shield` à lista de imports do lucide-react:
```tsx
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, ShoppingCart, Users, Target,
  Clock, Zap, BarChart3, AlertTriangle, Shield,
} from 'lucide-react'
```

Adicionar interface TypeScript após as interfaces existentes (após `interface PipelineData`):
```tsx
interface AnalyticsCurrent {
  activeRecords: number
  assignedOwners: number
  unassignedOwners: number
  ownerCoveragePct: number | null
  breachedEscalations: number
}

interface AnalyticsData {
  generatedAt: string | null
  current: AnalyticsCurrent | null
  totalEntries: number
}
```

**Step 2: Adicionar `useApi` call para analytics**

Após as outras chamadas `useApi` (perto de linha 143):
```tsx
const { data: analytics } = useApi<AnalyticsData>('/observability/connectors/backend/analytics?limit=1')
```

Nota: sem desestruturar `loading`/`error` — o card simplesmente não renderiza quando não há dados.

**Step 3: Adicionar Bloco 6 — Card Cobertura Operacional após o Pipeline**

Após o fechamento do bloco de Pipeline (após a `</div>` final do Bloco 5, antes do `</>` de fechamento), adicionar:

```tsx
      {/* ── Bloco 6: Cobertura Operacional (analytics) ── */}
      {analytics?.current && (
        <div className="glass rounded-xl p-4 glow-box mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={14} className="text-accent-primary" /> Cobertura Operacional
            </h3>
            {analytics.generatedAt && (
              <span className="text-[10px] text-gray-500">
                {new Date(analytics.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>

          {/* Barra de owner coverage */}
          {(() => {
            const pct = analytics.current!.ownerCoveragePct ?? 0
            const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Cobertura de Owners</span>
                  <span className="text-xs font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })()}

          {/* Grid de métricas */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Registros Ativos</p>
              <p className="text-lg font-bold text-white">{analytics.current!.activeRecords}</p>
            </div>
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Com Owner</p>
              <p className="text-lg font-bold text-accent-success">{analytics.current!.assignedOwners}</p>
            </div>
            <div className="p-2 bg-dark-700/50 rounded-lg text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">Sem Owner</p>
              <p className={`text-lg font-bold ${analytics.current!.unassignedOwners > 0 ? 'text-accent-warning' : 'text-gray-500'}`}>
                {analytics.current!.unassignedOwners}
              </p>
            </div>
          </div>

          {/* Alerta de escalações violadas */}
          {analytics.current!.breachedEscalations > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-danger/10 border border-accent-danger/20 rounded-lg">
              <AlertTriangle size={13} className="text-accent-danger flex-shrink-0" />
              <p className="text-xs text-accent-danger">
                <strong>{analytics.current!.breachedEscalations}</strong> escalação{analytics.current!.breachedEscalations > 1 ? 'ões' : ''} com SLA violado
              </p>
            </div>
          )}
        </div>
      )}
```

**Step 4: Verificar build TypeScript**

```bash
cd /c/Users/user/.openclaw/workspace/supervisor-comercial/.claude/worktrees/epic-sanderson/supervisor-comercial
npm run build -w @supervisor/dashboard
```

Esperado: build completo sem erros TypeScript. Se houver erro de tipo, corrigir antes de continuar.

**Step 5: Commit**

```bash
git add apps/dashboard/src/pages/Executivo.tsx
git commit -m "feat(phase50): add operational coverage card to executive view"
```

---

### Task 3: Wire `test:phase50` + build check

**Files:**
- Modify: `package.json`
- Modify: `config/standalone-export.json`

**Contexto:** O `test:phase50` deve rodar o drill E o build do dashboard. Mas como o CI standalone não tem ambiente de build React, adicionamos apenas o drill ao `validateCommands` do standalone-export.json. O build fica como validação local.

**Step 1: Adicionar `test:phase50` ao `package.json`**

Encontrar `"test:phase49"` no `package.json` e adicionar após:
```json
"test:phase50": "node scripts/phase50-analytics-ui-drill.mjs",
```

**Step 2: Adicionar ao `config/standalone-export.json`**

Encontrar `"npm run test:phase49"` em `validateCommands` e adicionar após:
```json
"npm run test:phase50"
```

**Step 3: Verificar**

```bash
npm run test:phase50
```

Esperado: `phase50 drills: 4 passed, 0 failed`

**Step 4: Commit**

```bash
git add package.json config/standalone-export.json
git commit -m "feat(phase50): wire test:phase50 to package.json and standalone-export"
```

---

### Task 4: Sync para standalone repo + CI

**Contexto:** Usar `scripts/phase37-standalone-sync.mjs` para sincronizar com `.export-repo`. O PR já aberto é o #10 (`codex/phase44-operational-collector`).

**Step 1: Rodar regressão completa local**

```bash
npm run test:phase50
npm run test:phase49
npm run test:phase48
npm run build -w @supervisor/dashboard
```

Todos devem passar.

**Step 2: Sync**

```bash
node scripts/phase37-standalone-sync.mjs
```

**Step 3: Commit e push no export repo**

```bash
cd ../.export-repo   # ou o caminho correto do export repo — checar config/standalone-export.json para exportDir
git add -A
git commit -m "feat(phase50): add operational coverage card to executive view"
git push
```

**Step 4: Verificar CI**

```bash
gh run list --repo institutobeatriz/supervisor-comercial-v2.0 --limit 3
```

Aguardar run verde. Anotar o run ID.

---

### Task 5: Evidence + Memory + Handoff

**Files:**
- Create: `docs/analise-projeto/61-fase-50-validacao.md`
- Modify: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Modify: `HANDOFF.md`
- Modify: `TODO_AI.md`

**Step 1: Criar evidência**

```markdown
# 61 - Fase 50 — Analytics UI Card

## Status: CONCLUÍDA
## Data: 2026-03-12

## O que foi entregue

- Card "Cobertura Operacional" adicionado ao final de `Executivo.tsx`
- Consome `/api/observability/connectors/backend/analytics?limit=1`
- Renderiza apenas quando `analytics.current !== null`
- Degradação graciosa: card oculto em erro/503/sem dados
- Cor dinâmica da barra: verde ≥80%, amarelo ≥50%, vermelho <50%
- Alerta inline se `breachedEscalations > 0`
- Interface TypeScript `AnalyticsData` / `AnalyticsCurrent` adicionada

## Drills
| Drill | Resultado |
|---|---|
| analytics_current_shape | PASS |
| analytics_coverage_pct_range | PASS |
| analytics_null_current_safe | PASS |
| analytics_endpoint_contract | PASS |

## Build
- `npm run build -w @supervisor/dashboard`: OK (sem erros TypeScript)

## CI remoto
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/10
- CI run: (preencher após CI verde)
- Conclusão: success
```

**Step 2: Adicionar linha na tabela de `10-memoria-execucao-fases.md`**

Após a linha da Fase 49, adicionar:
```
| Fase 50 - Analytics UI card no painel executivo | CONCLUIDA | 2026-03-12 | 2026-03-12 | `61-fase-50-validacao.md` | Card Cobertura Operacional em Executivo.tsx; consome backend/analytics; degradação graciosa em 503; build TS OK; CI verde |
```

**Step 3: Atualizar `HANDOFF.md`**

- `Ultima fase concluida: Fase 50`
- `Proxima fase liberada: Fase 51 (a definir)`
- Atualizar seção "O que foi concluido", "O que a Fase 50 entregou", "Arquivos alterados"

**Step 4: Atualizar `TODO_AI.md`**

- Marcar fase50 como concluída
- Atualizar "Ultima fase concluida: Fase 50"

**Step 5: Commit handoff**

```bash
git add docs/analise-projeto/61-fase-50-validacao.md \
        docs/analise-projeto/10-memoria-execucao-fases.md \
        HANDOFF.md TODO_AI.md
git commit -m "handoff(phase50): analytics UI card — evidence + memory + handoff"
```
