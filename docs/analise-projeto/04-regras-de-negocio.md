# 04 - Regras de Negocio Detectadas

## Escopo
Regras extraidas do codigo e das configuracoes efetivamente executaveis. Onde houver incerteza, o ponto e marcado como HIPOTESE.

---

## 1) Ingestao e deduplicacao de eventos

### Regra RB-01 (explicita)
- O webhook Evolution aceita eventos com `event`, `instance` e `data` (objeto ou array).
- Fonte: `apps/api/src/routes/webhook.ts` (schema Zod).

### Regra RB-02 (explicita)
- Se `EVOLUTION_WEBHOOK_SECRET` estiver definido, a API exige `Authorization: Bearer <secret>`.
- Se nao estiver definido, nao exige auth para webhook.

### Regra RB-03 (explicita)
- Payload fora do schema retorna `200 { ok: true, ignored: true }` (nao retorna erro 4xx).
- E uma estrategia de tolerancia a eventos nao tratados.

### Regra RB-04 (explicita)
- Evento bruto e persistido em `raw_events` antes do processamento assinc.

### Regra RB-05 (implicita)
- A deduplicacao por `raw_events.whatsapp_id` existe no SQL, mas nao bloqueia claramente o fluxo de `processMessage` no uso atual.
- Evidencia: `insertRawEvent` pode retornar ID existente e `webhook.ts` segue para `setImmediate`.

### Regra RB-06 (explicita)
- Deduplicacao de mensagem em `messages` usa unique parcial `(conversation_id, whatsapp_message_id)`.
- Em conflito, `insertMessage` faz `DO NOTHING`.

### Regra RB-07 (implicita)
- Fluxo assume que `insertMessage` sempre retorna registro valido; em conflito pode retornar vazio.
- Isso afeta o uso posterior de `msg.id` no webhook.

---

## 2) Mapeamento multi-instancia -> vendedor

### Regra RB-08 (explicita)
- O seller da conversa e resolvido por `instance_seller_map` via `getSellerByInstance(instance)`.
- Se nao achar, usa `getDefaultSeller()`.

### Regra RB-09 (implicita)
- Se instancia nao estiver mapeada e nao houver seller default valido, mensagem nao e processada.

---

## 3) Regras de classificacao e funil

### Regra RB-10 (explicita)
- Classificacao LLM retorna no minimo: intent, funnel_stage, sentiment, confidence.
- Fonte: `packages/llm/src/index.ts`.

### Regra RB-11 (explicita)
- Venda so e considerada por helper se `funnel_stage = closed_won` e `confidence > 0.7`.
- Perda idem com `closed_lost`.

### Regra RB-12 (explicita - governanca)
- Regras deterministicas bloqueiam/escalao `closed_won` sem confirmacao de pagamento.
- Regras tambem escalam valores altos e confianca baixa.

### Regra RB-13 (explicita)
- `hasPaymentConfirmation()` usa padroes positivos e negativos em regex para reduzir falso positivo.

### Regra RB-14 (implicita)
- Em `decideOutcome`, rejeicao de "won/lost" cai para `in_progress`.

### Regra RB-15 (implicita)
- Fluxo de revisao humana e disparado para casos escalados; notificacao Telegram e best-effort.

---

## 4) Regras de STT e midia

### Regra RB-16 (explicita)
- Audio inbound com URL pode ir para STT; prioridade: base64 descriptografado da Evolution -> fallback decrypt local via mediaKey.

### Regra RB-17 (explicita)
- STT usa Groq (`/audio/transcriptions`), com modelo default `whisper-large-v3-turbo`.

### Regra RB-18 (implicita)
- Tabela `audio_transcripts` existe e pode ser usada por rotinas LGPD; fluxo principal atual privilegia atualizar `messages.text`.

---

## 5) Regras de Vision/OCR e fechamento de venda

### Regra RB-19 (explicita)
- Mensagens `image/document` inbound entram em fila `vision`.

### Regra RB-20 (explicita)
- Vision aplica score heuristico por estagio/tipo/mime antes de chamar OCR/vision API.

### Regra RB-21 (explicita)
- Se comprovante for detectado, sistema grava label de compra, avanca funil para `closed_won` e upsert em `sales_outcomes`.

### Regra RB-22 (explicita)
- `sale_type` e inferido como `mensalidade` se houver `won` recente do mesmo contato; senao `nova_venda`.

### Regra RB-23 (implicita)
- Branch PDF local depende de `job.data.base64` presente.
- Como webhook nao envia base64 no job vision, esse caminho tende a nao ser usado no fluxo padrao.

---

## 6) Regras de analise de conversa

### Regra RB-24 (explicita)
- Worker `analyze` calcula `quality_score` por agregacao de labels e atualiza `conversation_insights`.

### Regra RB-25 (explicita)
- Apos `analyze`, worker emite evento interno (`/internal/emit`) para atualizacao SSE e invalida cache de dashboard.

### Regra RB-26 (explicita)
- Em seguida, enfileira `rag-index` para indexacao de chunks.

---

## 7) Regras de RAG

### Regra RB-27 (explicita)
- RAG vetorial so funciona com `RAG_VECTOR=true` e chave de embeddings configurada.

### Regra RB-28 (explicita)
- Insercao em `rag_chunks` e idempotente por `(conversation_id, chunk_text)`.

### Regra RB-29 (implicita)
- Existe risco de incompatibilidade de dimensao de embedding no schema dependendo da ordem/historico de migrations (1024 vs 1536).

---

## 8) Regras de dashboard e metricas comerciais

### Regra RB-30 (explicita)
- Dashboard aceita filtros de periodo por dia ou mes e filtro opcional por seller/produto.

### Regra RB-31 (explicita)
- Varios endpoints de dashboard usam cache Redis de curta duracao e sao invalidados por eventos de conversa.

### Regra RB-32 (implicita)
- Taxa de conversao tem definicao inconsistente entre camadas:
  - `packages/db`: `won / (won + lost)`;
  - `dashboard/kpis`: `won / leads_received`.

### Regra RB-33 (implicita)
- Limiares de sentimento em rotas de alerta/dashboard usam escala percentual em alguns pontos, enquanto tabela de labels guarda smallint.

---

## 9) Regras de revisao humana

### Regra RB-34 (explicita)
- Revisao exige header `x-admin-key` (ou query `adminKey`) nas rotas de review.

### Regra RB-35 (implicita)
- Existe fallback de `ADMIN_API_KEY` hardcoded na API e no frontend, reduzindo seguranca.

### Regra RB-36 (implicita)
- SQL de aprovacao/rejeicao usa colunas `reviewer/notes`, mas schema versionado define `reviewed_by/review_notes`.
- Regra de negocio pretendida (auditar quem revisou e notas) fica comprometida por drift de schema/SQL.

---

## 10) Regras de governanca de custo

### Regra RB-37 (explicita)
- Existem limites por tarefa (`classify`, `analyze`, `rag`, `report`, `won_lost`) com teto diario e por execucao.

### Regra RB-38 (explicita)
- Ao exceder limite, middleware pode rejeitar execucao e emitir alerta.

### Regra RB-39 (HIPOTESE)
- Mesmo com middleware pronto, nao ha evidencia de uso universal no pipeline principal.
- Motivo da incerteza: nao foi encontrado uso de `withGovernance()` no codigo de worker lido.

---

## 11) Regras de retencao/LGPD

### Regra RB-40 (explicita)
- Existe funcao SQL para anonimizar contatos inativos nao compradores apos periodo (default 730 dias).

### Regra RB-41 (explicita)
- Worker agenda limpeza mensal de transcricoes antigas (`audio_transcripts` > 1 ano).

### Regra RB-42 (implicita)
- Politica de retencao esta parcialmente codificada; nao ha camada completa de governanca de acesso/mascaramento em runtime API.

---

## 12) Regras operacionais de disponibilidade

### Regra RB-43 (explicita)
- API sobe apenas se `ping()` no banco passar e migrations aplicarem com sucesso.

### Regra RB-44 (implicita)
- Scripts locais de start/stop divergem entre si (alguns legados), podendo iniciar artefato incorreto do worker.

---

## 13) Resumo de consistencia das regras
- Regras de negocio nucleares (ingestao, classificacao, outcomes, alertas) existem e estao implementadas.
- Ha inconsistencias relevantes em:
  - deduplicacao efetiva ponta-a-ponta;
  - contrato de review humana (schema vs SQL);
  - formulas e escalas analiticas (conversao/sentimento);
  - seguranca operacional (chaves hardcoded).
