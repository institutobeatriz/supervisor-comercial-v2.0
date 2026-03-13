# Phase 51 — Producer Mandatory Enforcement Drill

## Objetivo

Formalizar via drill a decisão que `backend/producer` é obrigatório sem fallback em todos os ambientes, testando explicitamente as garantias de enforcement já presentes no código desde as Fases 42–49.

## Contexto técnico

- Fase 42: producer dedicado com `requireProvider: true, requireProducer: true`
- Fase 43: `enforceNoLegacy` enforcement ativo
- Fase 46: `USE_COLLECTOR=true` como default
- Fase 49: dead branches `legacy_files` removidos, `legacyFallbackState` hardcoded `'disabled'`
- Nenhum drill existente valida explicitamente os campos `requireProvider`, `requireProducer` e o shape completo do producer report de enforcement

## Decisão formal

O `backend/producer` é **obrigatório sem fallback** em todos os ambientes a partir da Fase 51:
- A API retorna 503 quando o producer não produziu output válido
- `legacyFallbackAllowed: false` e `legacyFallbackState: 'disabled'` são campos imutáveis no producer descriptor
- `requireProvider: true` e `requireProducer: true` são os únicos valores aceitos no config canônico
- O coletor é obrigatório por padrão (`USE_COLLECTOR=true`)

## Arquitetura

**Abordagem:** Drill puro de contrato (sem alteração em código de produção). Segue padrão phase46 — executa o producer como subprocess e valida o report JSON gerado.

**Script:** `scripts/phase51-producer-mandatory-drill.mjs`

## Drills

| # | Nome | O que testa |
|---|------|-------------|
| 1 | `producer_config_require_flags` | `config.requireProvider === true` e `config.requireProducer === true` no producer report |
| 2 | `producer_descriptor_enforcement` | `legacyFallbackAllowed === false`, `legacyFallbackState === 'disabled'`, `ready === true` no producer descriptor |
| 3 | `collector_mandatory_default` | `summary.collectorEnabled === true` e `summary.collectorMode === 'file'` sem nenhuma env extra |
| 4 | `producer_status_pass` | Producer exits 0 e `report.status === 'pass'` no default |

## Arquivos a criar/modificar

- `scripts/phase51-producer-mandatory-drill.mjs` (novo)
- `.export-repo/scripts/phase51-producer-mandatory-drill.mjs` (cópia)
- `package.json` → `"test:phase51": "node scripts/phase51-producer-mandatory-drill.mjs"`
- `config/standalone-export.json` → adicionar `phase51`
- `docs/plans/2026-03-12-phase51-producer-mandatory-design.md` (este arquivo)
- `docs/analise-projeto/62-fase-51-validacao.md` (evidência, após testes passarem)
- `docs/analise-projeto/10-memoria-execucao-fases.md` (atualizar linha Fase 51)
- `HANDOFF.md`, `TODO_AI.md`

## Critério de aceite

- `npm run test:phase51`: 4 drills passando, 0 failing
- `npm run test:phase50`: regressão OK
- `npm run test:phase49`: regressão OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)
- CI remoto verde após push
