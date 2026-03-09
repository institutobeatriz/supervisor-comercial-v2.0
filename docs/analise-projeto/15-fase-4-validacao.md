# 15 - Fase 4 - Validacao de Webhooks e Filas

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Validar o pipeline assincrono ponta a ponta:
- webhook Evolution;
- persistencia em `raw_events` e `messages`;
- enfileiramento/processamento em `classify`, `stt` e `vision`;
- comportamento em duplicacao, eventos invalidos e nao suportados.

## Ajustes aplicados durante a fase
1. `apps/api/src/routes/webhook.ts`
- audio agora aceita `base64` no proprio payload (sem depender da Evolution API);
- branch de `vision` passa `base64` para jobs de documento/imagem quando disponivel.

2. Nova suite automatizada:
- `scripts/phase4-webhooks-queues-e2e.mjs`
- fallback automatico para execucao no container `supervisor-api` quando DB local nao e o schema do projeto.

3. Script de execucao:
- `package.json` recebeu `test:phase4`.

## Execucao
Comando:
```bash
npm run test:phase4
```

Resultado final:
- `10 passed, 0 failed, 1 warnings`

Warning observado:
- STT com `mediaKey` falhou por dependencia externa de download (`fetch failed`) usando URL de teste (`https://example.com/audio.enc`).
- Fluxo esperado da fase foi validado: job `stt` foi enfileirado e processado ate estado terminal.

## Matriz executada (suite)
1. Pre-check API ativa.
2. Webhook invalido (schema) ignorado sem persistencia em `raw_events`.
3. Evento nao suportado persiste `raw_events` sem criar `messages`.
4. `messages.upsert` texto inbound:
- cria `raw_events`;
- cria `messages`;
- enfileira/processa `classify`;
- atualiza `message_labels` e `conversation_insights`.
5. `send.message` outbound:
- cria `messages` outbound;
- nao enfileira `classify`.
6. Audio inbound com `base64`:
- cria `messages` audio;
- enfileira `stt` com `base64`.
7. Audio inbound com fallback `mediaKey`:
- cria `messages` audio;
- enfileira `stt` com `mediaKey` quando Evolution nao devolve base64.
8. Image inbound:
- enfileira `vision` com `jobId` deterministico;
- valida politica de retry (`attempts=3`).
9. Document PDF inbound com `base64`:
- enfileira `vision`;
- executa branch local de PDF (`source: 'pdf'` no retorno do job).
10. Evento duplicado:
- mantem `1` linha em `raw_events` para `whatsapp_id`;
- mantem `1` linha em `messages` para mesmo `conversation_id + whatsapp_message_id`.

## Evidencias tecnicas
- Script: `scripts/phase4-webhooks-queues-e2e.mjs`
- Execucao validada em runtime docker (delegacao automatica):
  - API: `supervisor-api`
  - Worker: `supervisor-worker`
  - DB: `postgresql://app:app@postgres:5432/sales_supervisor`
  - Redis: `redis://redis:6379`

## Riscos residuais identificados na fase
1. O caso de fallback `mediaKey` depende de disponibilidade de URL de midia real; com URL sintetica, o worker termina em falha externa apos enfileiramento (comportamento esperado para teste de resiliencia).
2. Falhas de `rag-index` por constraint `ON CONFLICT` seguem aparecendo em log do worker e devem ser tratadas na trilha da Fase 5/6 (nao bloqueou os objetivos da Fase 4).

## Conclusao
Fase 4 concluida com validacao automatizada de webhook + filas + persistencia, incluindo cenarios obrigatorios de invalido, nao suportado, duplicado, texto, audio, imagem e documento.
