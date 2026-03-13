# 57 - Fase 46 - Validacao

## Objetivo
Promover `USE_COLLECTOR=true` como default no producer operacional (phase42), expor o estado do coletor no summary e adicionar enforcement no smoke test de CI.

## Data
2026-03-11

## Responsavel
Claude Sonnet 4.6

## Resultado
CONCLUIDA — Drill local passa, CI GitHub Actions verde.

## CI
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/10
- Branch: `codex/phase44-operational-collector`
- Ultimo run CI verde: `22969908488`
- Job: `quality-and-smoke` — conclusion: success

## O que foi alterado

### `scripts/phase42-observability-operational-provider-producer.mjs`
- `useCollector` default alterado de `false` para `true`
  - Antes: `envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR', false)`
  - Depois: `envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR', true)`
- Adicionados campos `collectorEnabled` e `collectorMode` ao objeto `summary`
  - `collectorEnabled: cfg.useCollector` (boolean)
  - `collectorMode: cfg.useCollector ? cfg.collectorMode : 'disabled'` (string)
- Adicionados campos `useCollector` e `collectorMode` ao objeto `config` do report
- `renderDashboard` atualizado para exibir `Collector enabled` e `Collector mode`

### `scripts/ci-api-smoke.mjs`
- Adicionado enforcement phase46 no bloco `observability_backend_producer`:
  - `summary.collectorEnabled` deve ser `boolean`
  - `summary.collectorEnabled` deve ser `true`
  - `summary.collectorMode` deve ser string não-vazia

### `scripts/phase46-collector-default-drill.mjs` (novo)
- Drill 1 `default_path`: producer sem `USE_COLLECTOR` env → `collectorEnabled=true` no summary
- Drill 2 `bypass_path`: producer com `USE_COLLECTOR=false` → `collectorEnabled=false`, `collectorMode=disabled`
- Drill 3 `summary_contract`: `collectorEnabled`/`collectorMode` presentes em todos os reports

### `package.json`
- Adicionado: `"test:phase46": "node scripts/phase46-collector-default-drill.mjs"`

### `config/standalone-export.json`
- Adicionado `"npm run test:phase46"` em `validateCommands`

## Drills validados localmente

```
[Drill 1] default_path
  [OK] summary.collectorEnabled is true (default)
  [OK] summary.collectorMode is synthetic (env override)
  [OK] legacy fallback still disabled (phase43 preserved)
  [OK] config.useCollector is true

[Drill 2] bypass_path
  [OK] summary.collectorEnabled is false when USE_COLLECTOR=false
  [OK] summary.collectorMode is disabled when collector off
  [OK] config.useCollector is false

[Drill 3] summary_contract
  [OK] (12 asserts — todos passando)

status=pass errors=0
```

## Compatibilidade retroativa
- `USE_COLLECTOR=false` pode ser definido explicitamente para restaurar o caminho direto de leitura de arquivos
- Phase43 enforcement (legacyFallbackState=disabled) continua válido
- Drills phase43 e phase44 continuam passando

## Proxima fase liberada
Fase 47 (a definir conforme necessidade do projeto).

## Consideracoes
- O coletor ainda é um stub (modo `file` lê arquivos locais; modo `synthetic` gera dados deterministicos)
- Integração com serviço externo real fica para iteração futura
- O producer usa o coletor por default; o caminho legado (leitura direta de arquivos) continua disponível via opt-out
