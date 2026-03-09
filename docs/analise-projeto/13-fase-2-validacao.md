# 13 - Fase 2 (P1) Validacao de dados e metricas

## Atualizacao
- Data: 2026-03-08 (America/Sao_Paulo)
- Escopo: `P1-DATA-01` ate `P1-DATA-05`
- Objetivo: remover inconsistencias de metricas/escala e fechar gaps de schema/migrations.

## Mudancas aplicadas

### 1) P1-DATA-01 - Formula de conversao unificada
Arquivo:
- `apps/api/src/routes/dashboard.ts`

Ajuste:
1. `/api/dashboard/kpis` parou de recalcular conversao com `sales_won / leads_received`.
2. Passou a usar `kpis.conversion_rate` retornado pela camada DB (regra oficial):
- `won / (won + lost) * 100`.

Impacto:
1. Elimina divergencia de conversao entre endpoints/telas que usam `getExecutiveKpis`.

### 2) P1-DATA-02 - Escala de sentimento/urgencia normalizada
Arquivos:
- `apps/api/src/routes/dashboard.ts`
- `apps/api/src/routes/alerts.ts`

Ajustes:
1. Sentimento negativo no dashboard:
- de `ml.sentiment < 40` para `ml.sentiment <= 2`.
2. Alertas de sentimento negativo:
- de `ml.sentiment < 30` para `ml.sentiment <= 2`.
3. Alertas de urgencia:
- de `ml.urgency >= 80` para `ml.urgency >= 3`.

Justificativa tecnica:
1. Classificacao LLM usa sentimento `1..5`.
2. Pipeline atual persiste urgencia em `message_labels` no range `1..3`.
3. Thresholds 30/40/80 eram semanticamente invalidos para a escala real.

### 3) P1-DATA-03 - Weekly report em `week_start`
Arquivo:
- `packages/db/src/queries.ts`

Ajustes:
1. `getWeeklyReport` deixou de consultar colunas inexistentes (`period_start`, `period_end`).
2. Consulta passou para:
- `week_start = $2::date`.
3. Filtro de vendedor ficou seguro:
- `($1::uuid IS NULL OR seller_id = $1)`.

Impacto:
1. Endpoint admin semanal deixa de depender de colunas nao versionadas.
2. Chamada sem `seller_id` nao quebra por cast de UUID invalido.

### 4) P1-DATA-04 - Migration oficial de `alert_history`
Arquivo:
- `infra/migrations/016_alert_history.sql`

Ajustes:
1. Tabela `alert_history` versionada.
2. Colunas base para historico/resolucao e ligacao opcional com conversa/vendedor.
3. Indices criados para busca por `resolved_at`, `conversation_id`, `seller_id`.

Impacto:
1. `/api/alerts/history` deixa de depender de tabela manual/externa ao repositorio.

### 5) P1-DATA-05 - Dimensao RAG padronizada em 1536
Arquivo:
- `infra/migrations/017_rag_embedding_1536.sql`

Ajustes:
1. Verifica tipo atual de `rag_chunks.embedding`.
2. Se diferente de `vector(1536)`, altera coluna para `vector(1536)` com `USING NULL`.
3. Recria indice vetorial `idx_rag_chunks_embedding`.

Observacao:
1. Conversao para 1536 pode invalidar embeddings antigos (set para `NULL`) quando havia dimensao diferente.
2. Re-embedding posterior e necessario para recuperar busca semantica nesses registros.

## Evidencias tecnicas

### Build
1. `npm run build -w @supervisor/db` -> OK
2. `npm run build -w @supervisor/api` -> OK
3. `npm run build -w @supervisor/worker` -> OK

### Banco (stack docker)
1. `reports_weekly` confirmado com colunas:
- `week_start`, `seller_id`, `kpis`, `heatmap`, `highlights`, `created_at`.
2. `rag_chunks.embedding` confirmado como:
- `vector(1536)`.
3. Tabela `alert_history` confirmada:
- `to_regclass('public.alert_history') = alert_history`.

### Runtime endpoints
1. `GET /health` -> `healthy`.
2. `GET /api/dashboard/kpis` -> 200.
3. Verificacao formula:
- `endpoint_taxa=100`, `expected_taxa=100`, `won=1`, `lost=0`.
4. `GET /api/dashboard/loss-stats` -> 200.
5. `GET /api/alerts` -> 200.
6. `GET /api/alerts/history?limit=5` -> 200 (lista vazia valida).
7. `GET /admin/reports/weekly` com `x-admin-key`:
- com `seller_id` -> report encontrado;
- sem `seller_id` -> report encontrado (filtro seguro).

## Resultado da fase
1. `P1-DATA-01` a `P1-DATA-05` implementados e validados.
2. Fase 2 considerada concluida.

## Riscos residuais
1. Healthcheck do container `api` permanece `unhealthy` intermitente, mesmo com endpoint `/health` respondendo `healthy`.
