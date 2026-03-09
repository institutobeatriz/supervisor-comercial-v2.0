# 12 - Fase 1 (P0) Validacao

## Data
- 2026-03-08

## Escopo P0 executado
1. Remover segredos hardcoded do codigo.
2. Tornar auth admin obrigatoria fora de `development`.
3. Corrigir drift de schema SQL em `human_reviews`.
4. Corrigir `/api/conversations/:id` (colunas inexistentes).
5. Corrigir deduplicacao segura no webhook/message insert.

## Alteracoes realizadas

### Seguranca
1. `packages/llm/src/index.ts`
- removido fallback hardcoded de `GLM5_API_KEY`.

2. `apps/api/src/routes/reviews.ts`
- removido fallback hardcoded de `ADMIN_API_KEY`;
- retorna `503` quando chave nao configurada fora de `development`;
- valida `x-admin-key` contra env.

3. `apps/api/src/routes/admin.ts`
- mesma regra de obrigatoriedade de `ADMIN_API_KEY` fora de `development`.

4. `apps/dashboard/src/pages/Reviews.tsx`
- removida chave fixa no frontend;
- chave agora e informada por sessao (sessionStorage), sem hardcode em codigo.

5. `scripts/sync-correct.mjs`, `scripts/sync-messages.mjs`, `scripts/test-download.mjs`
- removido fallback hardcoded de `EVOLUTION_API_KEY`;
- erro explicito se chave nao configurada.

### Corretude de dados/API
1. `packages/db/src/queries.ts`
- `approveReview`/`rejectReview` alinhados a colunas reais:
  - `reviewed_by`, `review_notes`, `final_outcome`, `final_value_cents`;
- `approveReview`/`rejectReview` retornam registro atualizado (`RETURNING *`);
- join de reviews ajustado para `c.id::text = hr.conversation_id`;
- `insertMessage` agora recupera mensagem existente em conflito e nao retorna `undefined`.

2. `apps/api/src/routes/webhook.ts`
- `insertMessage` passa `whatsapp_message_id: key.id` para deduplicacao efetiva.

3. `apps/api/src/routes/conversations.ts`
- detalhe da conversa corrigido para schema real:
  - `messages.direction -> role`,
  - `messages.type -> media_type`,
  - `message_labels` para `sentiment` e `is_purchase_intent`;
- stats da conversa calculadas com `LEFT JOIN message_labels`.

### Infra
1. `docker-compose.yml`
- `api` agora carrega `.env` (chaves admin/webhook);
- removido campo `version` obsoleto;
- Redis com `maxmemory-policy noeviction`.

2. `infra/docker/Dockerfile.api` e `infra/docker/Dockerfile.worker`
- inclusao e build de `packages/vision` para corrigir falha de build docker.

## Validacoes executadas

### Build
1. `npm run build -w @supervisor/db` -> OK
2. `npm run build -w @supervisor/api` -> OK
3. `npm run build -w @supervisor/worker` -> OK
4. `npm run build -w dashboard` -> falha preexistente por dependencia `jspdf` ausente (nao introduzida por esta fase).

### Runtime/API (docker)
1. `GET /health` -> `200`.
2. `GET /admin/conversations`:
- sem chave -> `401`;
- com chave -> `200`.
3. `GET /api/reviews`:
- sem chave -> `401`;
- com chave -> `200`.
4. `POST /api/reviews/:id/approve` com review de teste -> `200` e registro retornado com `reviewed_by/review_notes/final_*`.
5. `POST /api/reviews/:id/reject` com review de teste -> `200`.
6. `GET /api/conversations/:id` -> `200` (sem erro de colunas inexistentes).

### Deduplicacao webhook
1. Enviado mesmo `whatsapp_message_id` duas vezes (`phase1-dedup-001`).
2. Resultado no banco:
- apenas `1` linha em `messages` para esse `whatsapp_message_id`.
3. API respondeu `200 queued` nas duas chamadas (sem crash).

## Resultado da fase
Status: **CONCLUIDA**.

Risco residual observado:
1. build frontend continua bloqueado por dependencia `jspdf` ausente no workspace atual.
2. health do container API aparece `unhealthy` em alguns ciclos apesar de `/health` responder 200 (investigar healthcheck de container na fase DevOps).
