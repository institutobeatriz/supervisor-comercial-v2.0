# Phase 50 — Backend Analytics UI Design

## Objetivo
Exibir os dados do endpoint `/api/observability/connectors/backend/analytics` no painel executivo (`Executivo.tsx`), adicionando um card "Cobertura Operacional" com métricas de owner coverage, registros ativos e escalações violadas.

## Arquitetura

**Endpoint:** `GET /api/observability/connectors/backend/analytics?limit=1`

Payload relevante:
```json
{
  "current": {
    "activeRecords": 12,
    "assignedOwners": 10,
    "unassignedOwners": 2,
    "ownerCoveragePct": 83.3,
    "breachedEscalations": 0
  },
  "generatedAt": "2026-03-12T...",
  "totalEntries": 47
}
```

**Integração:** Novo `useApi` call no `Executivo.tsx`. O card carrega independentemente dos outros (falha isolada — se analytics não disponível, restante do painel não é afetado).

**Arquivo único alterado:** `apps/dashboard/src/pages/Executivo.tsx`

## Componente: `OperationalCoverageCard`

Card novo no final da página (após Bloco 5 Pipeline), seguindo o padrão `glass rounded-xl p-4 glow-box`.

Conteúdo:
- Título: "Cobertura Operacional" com ícone `Shield`
- Barra de progresso: `ownerCoveragePct` com cor dinâmica
  - ≥ 80% → `accent-success` (verde)
  - ≥ 50% → `accent-warning` (amarelo)
  - < 50% → `accent-danger` (vermelho)
- Grid 3 colunas: Registros Ativos | Owners Atribuídos | Sem Owner
- Alert inline se `breachedEscalations > 0`
- Timestamp `generatedAt` no rodapé

**Estados:**
- Loading: spinner/texto "Carregando cobertura operacional..."
- Vazio / null: card oculto (não renderiza)
- Erro: card oculto (graceful degradation)
- Sucesso: card completo

## Testes (drill)

`scripts/phase50-analytics-ui-drill.mjs` — testa o endpoint `/api/observability/connectors/backend/analytics` via mock HTTP:
1. `analytics_endpoint_structure` — resposta tem campos `current`, `generatedAt`, `totalEntries`
2. `analytics_current_fields` — `current` tem todos os campos numéricos esperados
3. `analytics_coverage_pct_range` — `ownerCoveragePct` entre 0 e 100 (ou null)
4. `analytics_graceful_missing` — endpoint retorna 200 mesmo sem arquivo de analytics (fallback `{}`)

## Critério de aceite
- Card visível em Executivo quando analytics disponível
- Card ausente (sem erro) quando analytics indisponível
- `npm run build -w @supervisor/dashboard` sem erros de TypeScript
- `npm run test:phase50` passando
- CI remoto verde
