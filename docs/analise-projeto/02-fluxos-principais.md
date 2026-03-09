# 02 - Fluxos Principais

## Escopo
Mapeamento ponta a ponta dos fluxos operacionais centrais, com entradas, processamento, persistencia e saidas.

## F01 - Ingestao de mensagem de texto (Webhook -> Classificacao -> Insights)

### Entrada
- Endpoint: `POST /webhooks/evolution`.
- Arquivo: `apps/api/src/routes/webhook.ts`.
- Evento aceito: `messages.upsert` ou `send.message`.

### Processamento
1. Valida header de seguranca somente se `EVOLUTION_WEBHOOK_SECRET` existir.
2. Valida payload com Zod (`event`, `instance`, `data`).
3. Extrai `key.id` para deduplicacao e persiste em `raw_events` via `insertRawEvent`.
4. Responde rapido com `status: queued`.
5. Em `setImmediate`, executa `processMessage`:
- resolve vendedor por `instance_seller_map` (`getSellerByInstance`) com fallback para vendedor default;
- `upsertContact`, `upsertConversation`, `insertMessage`, `updateConversationLastMessage`;
- para texto inbound, enfileira `classify`.

### Persistencia
- `raw_events`
- `contacts`
- `conversations`
- `messages`

### Saida
- Job `classify` no BullMQ.
- Atualizacao de dashboards ocorre depois do fluxo `analyze`.

### Arquivos relacionados
- `apps/api/src/routes/webhook.ts`
- `packages/db/src/queries.ts`
- `apps/worker/src/index.ts` (worker `classify`)

---

## F02 - Mensagem de audio (Webhook -> STT -> Classificacao)

### Entrada
- Tipo detectado no webhook: `audio`.

### Processamento
1. Webhook tenta baixar base64 descriptografado via Evolution API (`chat/getBase64FromMediaMessage`).
2. Se falhar e existir `mediaKey`, enfileira STT com fallback para descriptografia local.
3. Worker `stt` escolhe caminho:
- `transcribeFromBase64`, ou
- `transcribeFromEncryptedUrl`, ou
- `transcribeFromUrl`.
4. Salva transcricao em `messages.text`.
5. Enfileira `classify` com o texto transcrito.

### Persistencia
- `messages` (campo `text` atualizado)
- opcionalmente `audio_transcripts` existe no schema, mas fluxo principal atual nao grava nela.

### Saida
- Job `classify`.

### Arquivos relacionados
- `apps/api/src/routes/webhook.ts`
- `apps/worker/src/index.ts` (worker `stt`)
- `packages/stt/src/index.ts`

---

## F03 - Imagem/PDF (Webhook -> Vision)

### Entrada
- Tipo detectado no webhook: `image` ou `document`.

### Processamento
1. Webhook enfileira `vision` com `messageId`, `conversationId`, `instance`, `mime`, `messageKeyId`.
2. Worker `vision`:
- branch PDF: so executa se `mime === application/pdf` **e** `job.data.base64` existir;
- branch geral: calcula score heuristico por estagio/tipo/mime;
- se score alto, baixa base64 da Evolution e chama modelo vision (NVIDIA endpoint);
- se detectar comprovante, grava label de compra, fecha funil para `closed_won` e faz upsert em `sales_outcomes`.

### Persistencia
- `message_labels`
- `conversations.funnel_stage`
- `sales_outcomes`

### Saida
- Conversa marcada como venda (`won`) quando comprovante confirmado.

### Observacao forense
- O webhook nao envia `base64` no job vision; portanto a branch PDF baseada em `job.data.base64` nao dispara no caminho padrao atual.

### Arquivos relacionados
- `apps/api/src/routes/webhook.ts`
- `apps/worker/src/index.ts` (worker `vision`)
- `packages/vision/src/index.ts`

---

## F04 - Classificacao, decisao de outcome e governanca

### Entrada
- Job `classify` com `text` e contexto minimo.

### Processamento
1. `classifyMessage` (LLM) retorna `intent`, `funnel_stage`, `sentiment`, etc.
2. Ralph loop simplificado analisa gaps.
3. Regras locais de seguranca de venda (`hasPaymentConfirmation`, tamanho minimo).
4. Salva/atualiza `message_labels`.
5. Avanca `conversations.funnel_stage` (sem retroceder, exceto fechamentos).
6. Se venda detectada:
- chama `decideOutcome` (governance);
- registra `sales_outcomes` `won` e fecha conversa.
7. Se perda detectada:
- registra `sales_outcomes` `lost`.
8. Enfileira `analyze`.

### Persistencia
- `message_labels`
- `conversations`
- `sales_outcomes`
- `audit_log` + JSONL (via `@supervisor/audit`)

### Saida
- Job `analyze`.

### Arquivos relacionados
- `apps/worker/src/index.ts` (`classifyWorker`)
- `packages/llm/src/index.ts`
- `packages/governance/src/decision.ts`
- `packages/governance/src/rules.ts`

---

## F05 - Analise de conversa e notificacao em tempo real

### Entrada
- Job `analyze` por `conversationId`.

### Processamento
1. Agrega `message_labels` da conversa.
2. Calcula `quality_score` deterministico.
3. Faz upsert em `conversation_insights`.
4. Tenta gerar `wins/mistakes/next_best_actions` via LLM (best-effort).
5. Emite evento SSE interno (`POST /internal/emit` com `conversation_updated`).
6. Enfileira `rag-index`.

### Persistencia
- `conversation_insights`
- `audit_log` e JSONL

### Saida
- SSE para dashboard via `events.ts`.
- Job `rag-index`.

### Arquivos relacionados
- `apps/worker/src/index.ts` (`analyzeWorker`)
- `apps/api/src/routes/events.ts`
- `apps/api/src/routes/dashboard.ts` (cache invalido por evento)

---

## F06 - RAG indexacao e consulta

### Entrada
- Job `rag-index` por conversa.
- Consulta admin via `/admin/rag/search`.

### Processamento
1. Worker monta texto agregado de mensagens.
2. Faz chunking por janela deslizante.
3. Gera embedding com `@supervisor/embeddings` (se habilitado e com chave).
4. Insere em `rag_chunks` com `ON CONFLICT (conversation_id, chunk_text) DO NOTHING`.
5. API admin permite busca vetorial/textual dependendo de `RAG_VECTOR`.

### Persistencia
- `rag_chunks`

### Saida
- Base de conhecimento consultavel por similaridade.

### Arquivos relacionados
- `apps/worker/src/index.ts` (`ragWorker`)
- `packages/embeddings/src/index.ts`
- `packages/rag/src/index.ts`
- `packages/db/src/queries.ts` (`findSimilarRagChunks`, `findRagChunksByText`)

---

## F07 - Dashboard operacional (REST + SSE)

### Entrada
- Frontend React (`apps/dashboard`) usa REST `/api/*` e SSE `/api/alerts/stream` + `/events`.

### Processamento
1. Paginas consultam rotas de `dashboard.ts`, `conversations.ts`, `alerts.ts`, `reviews.ts`, `metrics.ts`.
2. `dashboard.ts` usa Redis para cache curto (30s) em KPIs/funil/ranking/perdas.
3. `events.ts` invalida cache em `conversation_updated`.
4. `alerts.ts` recalcula alertas em SQL (REST e stream periodicos).

### Persistencia
- Leitura de tabelas analiticas (`conversations`, `message_labels`, `sales_outcomes`, `conversation_insights`).

### Saida
- Cards, graficos, ranking, funil, relatorios PDF/XLSX e alertas ao vivo.

### Arquivos relacionados
- `apps/dashboard/src/App.tsx`
- `apps/dashboard/src/pages/*.tsx`
- `apps/api/src/routes/dashboard.ts`
- `apps/api/src/routes/alerts.ts`
- `apps/api/src/routes/events.ts`

---

## F08 - Rotinas agendadas (automacoes internas)

### Agendamentos
- `23:55` diario: enfileira job `report`.
- `de hora em hora`: `checkUsageAndAlert` (governanca).
- `dia 1, 03:00`: anonimiza contatos inativos (`anonymize_inactive_contacts`).
- `dia 1, 04:00`: remove transcricoes antigas (>1 ano).

### Observacao
- Worker `report` ainda retorna sucesso com placeholder (`TODO: Gerar relatorio`).

### Arquivos relacionados
- `apps/worker/src/index.ts`
- `infra/migrations/014_lgpd_retention.sql`

---

## F09 - Bootstrap e migracoes

### Entrada
- Startup da API.

### Processamento
1. `ping()` no banco.
2. `migrate()` aplica SQL pendente de `infra/migrations`.
3. Registra rotas Fastify e inicia servidor.

### Persistencia
- Tabela `_migrations`.

### Saida
- API pronta em `PORT` configurada.

### Arquivos relacionados
- `apps/api/src/index.ts`
- `packages/db/src/migrate.ts`
- `infra/migrations/*.sql`

---

## Hipoteses/limites
- HIPOTESE: parte dos scripts legados pode representar fluxos antigos nao usados em producao.
- HIPOTESE: alguns campos consultados pelo frontend/backend podem existir apenas em bases antigas (fora do conjunto de migrations atual versionado).
