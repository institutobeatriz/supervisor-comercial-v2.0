# Phase 47 — Collector modo `api`

**Data:** 2026-03-11
**Status:** aprovado
**Fase:** 47

## Contexto

O `OPERATIONAL_COLLECTOR_INTERFACE` (Phase 43) já declara `integrationModes: ['file', 'api', 'service']`.
O coletor (Phase 44) implementa apenas `file` e `synthetic`.
Phase 47 fecha o contrato adicionando `api` — o coletor faz HTTP GET no endpoint interno da própria API do projeto.

## Arquitetura

```
Producer (phase42)
  └─ collectOperationalSources({ mode: 'api', apiBaseUrl, apiKey })
       └─ GET /api/observability/connectors/backend/report
            └─ mapeia response.sources → { incidentAutomation, itsmSnapshot, fullcycleReport }
```

O endpoint `/api/observability/connectors/backend/report` já existe e expõe exatamente a estrutura `sources` necessária. Não há novo endpoint.

## Componentes

### 1. `scripts/phase44-operational-collector.mjs` — adição do modo `api`

Nova função `collectFromApi({ apiBaseUrl, apiKey, ts })`:
- Faz `fetch(apiBaseUrl + '/api/observability/connectors/backend/report')`
- Headers: `x-admin-key`, `x-observability-role: executive`
- Timeout: 8 segundos
- Se API responde 200: mapeia `response.sources` para o formato `OPERATIONAL_COLLECTOR_INTERFACE`
- Se API falha (network error, não-200, timeout): lança erro — o chamador decide o fallback

Novas env vars lidas dentro de `collectOperationalSources()`:
- `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL` (default: `http://localhost:3000`)
- `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY` (default: valor de `ADMIN_API_KEY` ou string vazia)

Mudança na lógica de seleção de modo:
```
if mode === 'api'  → collectFromApi()
if mode === 'synthetic' → collectSynthetic()
else (default 'file') → collectFromFiles()
```

### 2. `scripts/phase47-collector-api-mode-drill.mjs` — drill novo

3 drills:

| Drill | Descrição | Verificação |
|-------|-----------|-------------|
| `api_unreachable` | Modo `api` com `apiBaseUrl=http://localhost:19999` (porta fechada) | `collectOperationalSources` lança erro com mensagem clara; `collectorMode` não é `api` num contexto que fez retry para `file` |
| `api_mode_contract` | Modo `api` chamado com mock de resposta (via env `COLLECTOR_MOCK_API=true` ou servidor HTTP temporário em porta aleatória) | `sources.incidentAutomation`, `itsmSnapshot`, `fullcycleReport` corretamente mapeados; `result.valid === true` |
| `mode_env_selection` | `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=api` seleciona modo api | `result.collectorMode === 'api'` quando API está acessível |

Em CI: drills `api_unreachable` e `mode_env_selection` rodam sem API real. O drill `api_mode_contract` usa um servidor HTTP mínimo na porta 19998 levantado e derrubado dentro do próprio drill.

### 3. `scripts/ci-api-smoke.mjs` — sem alteração

O smoke existente já valida `collectorEnabled=true` e `collectorMode` não-vazio. Quando o smoke roda com a API em pé e o coletor em modo `api`, `collectorMode=api` aparece naturalmente no summary — o smoke passa sem mudança de código.

### 4. `package.json` + `config/standalone-export.json`

- Adicionar `"test:phase47": "node scripts/phase47-collector-api-mode-drill.mjs"`
- Adicionar `"npm run test:phase47"` no `validateCommands` do standalone-export.json

## Fluxo de dados (modo `api`)

```
collectOperationalSources({ mode: 'api', apiBaseUrl, apiKey })
  → fetch GET apiBaseUrl/api/observability/connectors/backend/report
  → response.json() → data
  → mapApiSourcesToCollectorFormat(data.sources || data.backend?.sources || {})
  → { incidentAutomation, itsmSnapshot, fullcycleReport }
  → validateCollectorSources(sources) — mesmo validador da fase44
  → return { sources, mode: 'api', schema, version, collectorMode: 'api', valid, validationErrors }
```

## Tratamento de erros

| Cenário | Comportamento |
|---------|---------------|
| API unreachable (ECONNREFUSED) | Lança `Error('collector api unreachable: ...')` — caller decide |
| API responde não-200 | Lança `Error('collector api returned status ...')` |
| Timeout (8s) | Lança `Error('collector api timeout')` |
| Response inválida (não-JSON) | Lança `Error('collector api response not JSON')` |
| Sources ausentes ou malformadas | `validateCollectorSources` retorna erros; `valid=false` |

O producer (phase42) já trata `collectOperationalSources` com try/catch e adiciona violation `collector_unavailable` (não-bloqueante). Nenhuma mudança no producer necessária.

## Compatibilidade retroativa

- Modo `file` continua sendo o default (`FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=file`)
- Modo `synthetic` inalterado
- CI continua rodando em modo `file`/`synthetic`
- Interface `OPERATIONAL_COLLECTOR_INTERFACE` não muda
- Fases 43, 44, 46 enforcement preservados

## Critérios de aceite

1. `npm run test:phase47` passa com status=pass
2. `npm run test:phase44` ainda passa (retrocompatibilidade)
3. CI remoto verde após push

## Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| `scripts/phase44-operational-collector.mjs` | modificado |
| `scripts/phase47-collector-api-mode-drill.mjs` | novo |
| `package.json` | modificado |
| `config/standalone-export.json` | modificado |
| `docs/analise-projeto/58-fase-47-validacao.md` | novo |
| `docs/analise-projeto/10-memoria-execucao-fases.md` | modificado |
| `HANDOFF.md` | modificado |
| `TODO_AI.md` | modificado |
