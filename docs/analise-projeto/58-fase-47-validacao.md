# 58 — Fase 47: Modo API no Coletor Operacional

## Identificação
- Fase: 47
- Status: CONCLUIDA
- Data início: 2026-03-12
- Data conclusão: 2026-03-12
- Responsável: Claude (claude-sonnet-4-6)

## Objetivo
Adicionar o modo `api` ao coletor operacional (`phase44-operational-collector.mjs`), fechando o
contrato `OPERATIONAL_COLLECTOR_INTERFACE` que declara `integrationModes: ['file', 'api', 'service']`.

## Entregas desta fase

### Task 1 — TDD Red (drill failing)
- Criado `scripts/phase47-collector-api-mode-drill.mjs` com 3 drills:
  - `api_unreachable`: porta fechada → exceção com "collector api" na mensagem
  - `api_mode_contract`: mock server → fontes mapeadas corretamente
  - `mode_env_selection`: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=api` (env) seleciona modo api
- Commit: `4a64986 test(phase47): add failing drill for collector api mode (TDD red)`

### Task 2 — Implementação do modo api
Alterações em `scripts/phase44-operational-collector.mjs`:
- Adicionada função `buildApiSources({ apiBaseUrl, apiKey })`:
  - `fetch` com `AbortController` (timeout 8 s)
  - Erros prefixados com `"collector api ..."` (ex: `collector api unreachable`, `collector api timeout`)
  - Env vars: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL` (default `http://localhost:3000`)
    e `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY`
  - Endpoint chamado: `GET ${apiBaseUrl}/api/observability/connectors/backend/report`
  - Cabeçalhos: `x-admin-key`, `x-observability-role: executive`
- Adicionada função `mapApiSourcesToCollectorFormat(rawSources)`:
  - Mapeia `incidentAutomation`, `itsmSnapshot`, `fullcycleReport` para o formato do contrato
- Atualizado `collectOperationalSources()`:
  - Resolução de `apiBaseUrl` / `apiKey` de opções ou env vars
  - Novo branch `if (mode === 'api')` antes do check `synthetic`
  - Suporta `mode: 'api'` via opção direta ou env `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=api`
- Commit: `7dfc956 feat(phase47): add api mode to operational collector`

### Task 3 — Wire CI
- `package.json`: adicionado `"test:phase47": "node scripts/phase47-collector-api-mode-drill.mjs"`
- `config/standalone-export.json`: adicionado `"npm run test:phase47"` em `validateCommands`
- Commit: `26abd63 feat(phase47): wire test:phase47 to package.json and standalone-export`

### Task 4 — Sync e CI verde
- Sync para export-repo: `phase37-standalone-sync.mjs` → `copy=12 delete=0 unchanged=277`
- Export-repo commit: `a766bee handoff(phase47): collector api mode — buildApiSources + drill + CI wire`
- Push para `institutobeatriz/supervisor-comercial-v2.0` branch `codex/phase44-operational-collector`
- CI run `22981720840` → **success** (quality-and-smoke em 2m0s)

## Drills executados localmente

```
node scripts/phase47-collector-api-mode-drill.mjs
→ status=pass errors=0
→ All drills passed — api mode is operational

node scripts/phase44-operational-collector-drill.mjs
→ PASS (3 passed, 0 failed)

node scripts/phase46-collector-default-drill.mjs
→ status=pass errors=0
```

## Verificação de regressão
- phase43, phase44, phase46 drills: todos verdes
- CI remoto: run `22981720840` verde

## Contrato fechado
A `OPERATIONAL_COLLECTOR_INTERFACE` declarava `integrationModes: ['file', 'api', 'service']`.
Após esta fase, os modos `file`, `synthetic` e `api` estão implementados.
O modo `service` permanece para implementação futura.

## Arquivos alterados
- `scripts/phase44-operational-collector.mjs` (+96 linhas)
- `scripts/phase47-collector-api-mode-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`

## CI Evidence
- Run ID: `22981720840`
- Branch: `codex/phase44-operational-collector`
- Repo: `institutobeatriz/supervisor-comercial-v2.0`
- Job: `quality-and-smoke` → success em 2m0s
- URL: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22981720840
