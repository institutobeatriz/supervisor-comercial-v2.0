# 14 - Fase 3 (P2) Validacao de APIs e contratos

## Atualizacao
- Data: 2026-03-08 (America/Sao_Paulo)
- Escopo: cobertura de contrato HTTP + regressoes P0/P1
- Objetivo: validar endpoints ativos e impedir regressao dos fixes criticos.

## Entrega tecnica

### 1) Suite de contrato automatizada
Arquivo:
- `scripts/phase3-api-contracts.mjs`

Script adicionado com:
1. Preparacao de fixtures reais no banco.
2. Testes HTTP/SSE para endpoints ativos:
- `health`, `events`, `internal/emit`;
- `api/dashboard/*` (todos endpoints expostos);
- `api/alerts`, `api/alerts/stream`, `api/alerts/history`;
- `api/conversations*`;
- `api/reviews*`;
- `api/metrics/usage`;
- `admin/*` (com auth);
- `webhooks/evolution`.
3. Regressao dedicada:
- deduplicacao de webhook;
- SQL de review;
- detalhe de conversa;
- formula de conversao;
- contrato de `alert_history`.
4. Cleanup de fixtures ao final.

### 2) Fallback automatico de execucao
Arquivo:
- `scripts/phase3-api-contracts.mjs`

Quando `localhost:5432` aponta para banco errado (sem schema do projeto):
1. script detecta ausencia de `sellers`;
2. copia o runner para `supervisor-api`;
3. reexecuta internamente no container com `TEST_DATABASE_URL=postgresql://app:app@postgres:5432/sales_supervisor`.

Resultado:
1. `npm run test:phase3` fica reproduzivel no ambiente atual.

### 3) Correcoes encontradas pela propria fase

#### 3.1 `/api/dashboard/executive` com erro 500
Arquivo:
- `packages/db/src/queries.ts`

Causa:
1. query de `getLeadsByTemperature` usava `GROUP BY temperature` com alias.
2. PostgreSQL exigia agrupamento explicito da expressao.

Correcao:
1. ajuste para `GROUP BY 1`.

#### 3.2 Deduplicacao falhando em corrida de conversa aberta
Arquivos:
- `packages/db/src/queries.ts`
- `infra/migrations/018_unique_open_conversation.sql`

Causa raiz:
1. durante redelivery rapido, duas chamadas podiam criar duas conversas `open` para o mesmo contato.
2. dedup de mensagens e por `(conversation_id, whatsapp_message_id)`, entao o mesmo `whatsapp_message_id` podia entrar uma vez em cada conversa.

Correcao:
1. `upsertConversation` virou upsert atomico:
- `ON CONFLICT (contact_id) WHERE status = 'open'`.
2. migration 018:
- fecha duplicatas antigas de `open` por contato (mantem a mais recente);
- cria indice unico parcial `idx_conversations_one_open_per_contact`.

## Evidencia de execucao

Comando:
1. `npm run test:phase3`

Resultado final:
1. `60 passed, 0 failed`.

Observacao:
1. primeira tentativa local detectou DB incorreto no host e delegou para container automaticamente.
2. apos correcoes, suite completa passou sem falhas.

## Cobertura de regressao (P0/P1)
1. `P0-API-02` dedup webhook: PASS.
2. `P0-DB-01` review SQL drift: PASS.
3. `P0-API-01` detalhe conversa: PASS.
4. `P1-DATA-01` formula conversao: PASS.
5. `P1-DATA-04` `alert_history` endpoint/contrato: PASS.

## Conclusao da fase
1. Fase 3 concluida com suite automatizada e evidencias.
2. Fase 4 (webhooks/filas) liberada.
