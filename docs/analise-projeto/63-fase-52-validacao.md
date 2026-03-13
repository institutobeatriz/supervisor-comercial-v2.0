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
- Env var `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE` passa a ser completamente ignorada

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
- Conclusão: (a preencher)

## Commits desta fase

- `1aa0d79` refactor(phase52): remove dead cfg.providerMode from loadOperationalProvider
- `9faca47` test(phase52): add providerMode dead config cleanup drill
- `87bd8a1` feat(phase52): wire test:phase52 to package.json and standalone-export
