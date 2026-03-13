# Phase 52 Design — Remoção do dead config `cfg.providerMode`

## Data: 2026-03-12

## Contexto

Após a Fase 49 (remoção cirúrgica do legacy fallback), o campo `cfg.providerMode` em
`loadOperationalProvider()` (`scripts/observability-operational-provider.mjs`) ficou
sem uso. As branches condicionais que o consumiam foram removidas; o modo é agora
hardcoded como `'materialized_contract'` na chamada a `buildProviderMeta()` e no
objeto de saída de `buildMaterializedContract()`.

O HANDOFF.md da Fase 51 registra explicitamente:

> `cfg.providerMode` ainda presente em `loadOperationalProvider()` — dead config menor sem impacto

A Fase 52 fecha essa dívida técnica de baixo risco.

## Problema

No corpo de `loadOperationalProvider()`:

```js
const cfg = {
  providerMode: options.providerMode || envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
  // ...
};
```

- `cfg.providerMode` é calculado mas nunca lido depois.
- `buildProviderMeta()` recebe `mode: 'materialized_contract'` hardcoded.
- `buildMaterializedContract()` emite `providerMode: 'materialized_contract'` hardcoded.
- A env var `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE` é ingerida mas nunca tem efeito.

## Solução

Remover a linha `providerMode: ...` do objeto `cfg` em `loadOperationalProvider()`.

Não alterar:
- `providerMode: 'materialized_contract'` em `buildMaterializedContract()` — campo do contrato de saída
- `mode: 'materialized_contract'` na chamada de `buildProviderMeta()` — hardcoded correto
- Qualquer referência de `providerMode` nos scripts de drill de fases anteriores (histórico)

## Drill Phase 52

Arquivo: `scripts/phase52-providermode-cleanup-drill.mjs`

### Drill 1: `cfg_providermode_ignored`
- Chamar `loadOperationalProvider({ providerMode: 'rogue_mode', contractFile: tmpFile, materializeContract: true })`
- Verificar que o contract retornado tem `providerMode === 'materialized_contract'`
- Prova: a opção `providerMode` não tem mais efeito

### Drill 2: `contract_shape_intact`
- Chamar `loadOperationalProvider({ contractFile: tmpFile2, materializeContract: true })`
- Verificar que o contract retornado tem todos os campos obrigatórios:
  `version`, `schema`, `providerMode`, `sources`, `summary`, `generatedAt`

### Drill 3: `env_var_ignored`
- Definir env `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE=obsolete_mode`
- Chamar `loadOperationalProvider({ contractFile: tmpFile3, materializeContract: true })`
- Verificar que `contract.providerMode === 'materialized_contract'` (env ignorada)

### Drill 4: `producer_regression`
- Spawnar `phase42-observability-operational-provider-producer.mjs` com `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=synthetic`
- Verificar exit code 0 (regressão: mudança não quebrou o produtor)

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `scripts/observability-operational-provider.mjs` | Remover linha `providerMode` do `cfg` |
| `scripts/phase52-providermode-cleanup-drill.mjs` | Novo drill (4 drills) |
| `package.json` | Adicionar `test:phase52` |
| `config/standalone-export.json` | Adicionar `phase52-providermode-cleanup-drill.mjs` |
| `docs/analise-projeto/63-fase-52-validacao.md` | Nova evidência |
| `docs/analise-projeto/10-memoria-execucao-fases.md` | Atualizar linha Fase 52 |
| `HANDOFF.md` | Atualizar estado |
| `TODO_AI.md` | Marcar Fase 52 concluída |

## Critérios de aceite

1. `npm run test:phase52` — 4 drills passando
2. `npm run test:phase51` — sem regressão
3. `npm run test:phase49` — sem regressão
4. `npm run build -w @supervisor/dashboard` — sem erros TS
5. CI remoto verde (standalone publish)

## Riscos

- Risco zero de quebra de runtime: `cfg.providerMode` era computado mas nunca lido
- Risco zero de quebra de CI: o smoke `ci-api-smoke.mjs` valida `provider.providerMode`
  na **resposta da API**, não no cfg interno — esse campo continua presente no contrato
- A env var `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE` vai de ingerida-sem-efeito para simplesmente ignorada — sem impacto em produção
