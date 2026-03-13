# 60 - Fase 49 — Remoção Cirúrgica do Legacy Fallback

## Status: CONCLUÍDA
## Data: 2026-03-12

## Objetivo

Remover os dead branches do fallback `legacy_files` de `loadOperationalProvider()` e do producer, hardcodeando `legacyFallbackState: 'disabled'` e `legacyFallbackAllowed: false` na saída. Mantém `buildLegacySources()` pois ainda alimenta `buildMaterializedContract()` quando `collectorSources` é null.

## O que foi removido

### `scripts/observability-operational-provider.mjs`
- `allowLegacyFallback` e `enforceNoLegacy` removidos do objeto `cfg` em `loadOperationalProvider()`
- Bloco `if (cfg.providerMode !== 'materialized_contract')` removido — retornava `mode:'legacy_files'`, morto desde a Fase 43
- Bloco `if (!contract && cfg.allowLegacyFallback)` removido — segundo fallback legacy, também morto desde a Fase 43
- `allowLegacyFallback: cfg.allowLegacyFallback` removido da saída de `buildProviderMeta()`
- `legacyFallbackState` e `legacyFallbackAllowed` hardcoded como `'disabled'`/`false` em `buildProviderMeta()`

### `scripts/phase42-observability-operational-provider-producer.mjs`
- `allowLegacyFallback` removido do objeto `cfg`
- `producerDescriptor.legacyFallbackAllowed` e `legacyFallbackState` hardcoded como `false`/`'disabled'`
- Bloco `if (cfg.allowLegacyFallback)` de violation removido
- `legacyFallbackAllowed` em `summary` hardcoded como `false`
- `allowLegacyFallback` removido do objeto `config` no relatório e da chamada `loadOperationalProvider()`
- `legacyFallbackState` no catch block hardcoded como `'disabled'`

## O que foi mantido
- `buildLegacySources()` — ainda usada como entrada para `buildMaterializedContract()` quando `collectorSources` é null
- `OPERATIONAL_COLLECTOR_INTERFACE.enforcement` — documentação canônica da política

## Drill novo: `scripts/phase49-legacy-removal-drill.mjs`

| Drill | Resultado |
|---|---|
| `no_legacy_mode_branch` | PASS |
| `legacy_fallback_state_hardcoded_disabled` | PASS |
| `legacy_fallback_allowed_hardcoded_false` | PASS |
| `allow_legacy_fallback_option_ignored` | PASS |

## Regressão

| Teste | Resultado |
|---|---|
| `npm run test:phase49` | 4 passed, 0 failed |
| `npm run test:phase48` | 4 passed, 0 failed |
| `npm run test:phase47` | 4 passed, 0 failed |
| `npm run test:phase46` | 3 passed, 0 failed |
| `npm run test:phase44` | 3 passed, 0 failed |
| `npm run test:phase43` | 4 passed, 0 failed |

## CI remoto

- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/10
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23000418395
- Conclusão: **success** (1m50s)

## Arquivos alterados

- `scripts/observability-operational-provider.mjs`
- `scripts/phase42-observability-operational-provider-producer.mjs`
- `scripts/phase49-legacy-removal-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/60-fase-49-validacao.md` (este arquivo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## Commits desta fase

- `d02ae82` test(phase49): add failing drill for legacy removal (TDD red)
- `adac8ae` fix(phase49): align drill with phase48 pattern — add report, null guards, fix messages
- `36775de` feat(phase49): surgical removal of dead legacy fallback branches
- `7cfd4b3` feat(phase49): wire test:phase49 to package.json and standalone-export
