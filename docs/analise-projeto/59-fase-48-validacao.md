# 59 — Fase 48: Modo Service no Coletor Operacional

## Identificação
- Fase: 48
- Status: CONCLUIDA
- Data início: 2026-03-12
- Data conclusão: 2026-03-12
- Responsável: Claude (claude-sonnet-4-6)

## Objetivo
Implementar o modo `service` no coletor operacional (`phase44-operational-collector.mjs`), fechando
o contrato `OPERATIONAL_COLLECTOR_INTERFACE.integrationModes: ['file', 'api', 'service']`.

O modo `service` adiciona lazy polling com cache em memória (TTL padrão 300s): o coletor busca
os dados via API na primeira chamada e os mantém em cache até o TTL expirar, sem timer em background.

## Entregas desta fase

### Task 1 — TDD Red (drill failing)
- Criado `scripts/phase48-collector-service-mode-drill.mjs` com 4 drills:
  - `service_cache_hit`: 2ª chamada usa cache (servidor chamado só 1x)
  - `service_cache_miss`: TTL=0 → cada chamada vai à rede
  - `service_stale_refresh`: TTL=1ms, espera 5ms → 2ª chamada renova
  - `service_env_selection`: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=service` (env) seleciona modo
- Helper `withMockServer()` conta requisições HTTP para verificar comportamento do cache
- TDD red confirmado: todos os 4 drills falharam como esperado
- Commit: `b134aab test(phase48): add failing drill for collector service mode (TDD red)`

### Task 2 — Implementação do modo service
Alterações em `scripts/phase44-operational-collector.mjs`:
- Adicionado `_serviceCache = { sources: null, fetchedAt: null }` (singleton de módulo)
- Adicionada `buildServiceSources({ apiBaseUrl, apiKey, ttlMs })`:
  - Calcula `age = now - fetchedAt` (ou `Infinity` se nunca buscado)
  - Retorna cache se `sources !== null && age < ttlMs` (sem rede)
  - Caso contrário chama `buildApiSources()`, armazena resultado, retorna
  - Erro em `buildApiSources()` propaga sem atualizar cache (design intencional)
- Guard NaN-safe em `serviceTtlMs`: `Number.isFinite(fromEnv) ? fromEnv : 300000`
- Branch `if (mode === 'service')` adicionado antes do branch `api`
- Env var nova: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_SERVICE_TTL_MS` (default `300000`)
- Commits:
  - `(commit da implementação) feat(phase48): add service mode to operational collector`
  - `26dd9a9 fix(phase48): guard serviceTtlMs against NaN from non-numeric env var`

### Task 3 — Wire CI
- `package.json`: `"test:phase48": "node scripts/phase48-collector-service-mode-drill.mjs"`
- `config/standalone-export.json`: `"npm run test:phase48"` em `validateCommands`
- Commit: `428aded feat(phase48): wire test:phase48 to package.json and standalone-export`

### Task 4 — Sync e CI verde
- Sync: `copy=12 delete=0 unchanged=281`
- Export-repo commit: `3615570 handoff(phase48): collector service mode...`
- Push para `institutobeatriz/supervisor-comercial-v2.0` branch `codex/phase44-operational-collector`
- CI run `22983410484` → **success** (quality-and-smoke em 1m49s)

## Drills executados localmente

```
node scripts/phase48-collector-service-mode-drill.mjs
→ status=pass errors=0 (4 drills: cache_hit, cache_miss, stale_refresh, env_selection)

node scripts/phase44-operational-collector-drill.mjs
→ PASS (3/3)

node scripts/phase47-collector-api-mode-drill.mjs
→ status=pass errors=0

node scripts/phase46-collector-default-drill.mjs
→ status=pass errors=0
```

## Contrato fechado
`OPERATIONAL_COLLECTOR_INTERFACE.integrationModes` declarava `['file', 'api', 'service']`.
Após esta fase, todos os três modos principais estão implementados:
- `file`: lê arquivos locais (Phase 44)
- `api`: fetch HTTP one-shot com timeout (Phase 47)
- `service`: lazy polling com cache em memória TTL 300s (Phase 48)
- `synthetic`: dados sintéticos para testes (Phase 44, modo extra)

## Arquivos alterados
- `scripts/phase44-operational-collector.mjs` (+31 linhas net)
- `scripts/phase48-collector-service-mode-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`

## CI Evidence
- Run ID: `22983410484`
- Branch: `codex/phase44-operational-collector`
- Repo: `institutobeatriz/supervisor-comercial-v2.0`
- Job: `quality-and-smoke` → success em 1m49s
- URL: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22983410484
