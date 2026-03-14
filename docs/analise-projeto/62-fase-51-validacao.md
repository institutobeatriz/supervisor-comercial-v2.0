# 62 - Fase 51 — Drill de Enforcement do Producer Obrigatório

## Status: CONCLUÍDA
## Data: 2026-03-12

## Objetivo
Formalizar via drill a decisão que `backend/producer` é obrigatório sem fallback em todos os ambientes. Testar explicitamente as garantias de enforcement já presentes no código desde as Fases 42–49.

## Decisão formal
O `backend/producer` é **obrigatório sem fallback** em todos os ambientes a partir da Fase 51:
- `legacyFallbackAllowed: false` e `legacyFallbackState: 'disabled'` são campos imutáveis no producer descriptor
- `requireProvider: true` e `requireProducer: true` são os únicos valores aceitos
- O coletor é obrigatório por padrão (`USE_COLLECTOR=true`)
- API retorna 503 quando producer não produziu output válido

## O que foi entregue

### `scripts/phase51-producer-mandatory-drill.mjs`
- Drill puro de contrato: executa producer como subprocess com `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE=synthetic`
- Lê o report JSON gerado e valida campos de enforcement
- Mesmo padrão de phase46/phase48/phase50 drills

## Drills

| Drill | Resultado |
|---|---|
| `producer_config_require_flags` | PASS |
| `producer_descriptor_enforcement` | PASS |
| `collector_mandatory_default` | PASS |
| `producer_status_pass` | PASS |

## Build

- `npm run build -w @supervisor/dashboard`: ✅ sem erros TypeScript

## Regressão

| Teste | Resultado |
|---|---|
| `npm run test:phase51` | 4 passed, 0 failed |
| `npm run test:phase50` | 4 passed, 0 failed |
| `npm run test:phase49` | 4 passed, 0 failed |

## CI remoto

- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/11
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23019099011
- Conclusão: **success** (2m5s)

## Commits desta fase

- `df18ca5` test(phase51): add producer mandatory enforcement drill
- `d214e04` feat(phase51): wire test:phase51 to package.json and standalone-export
