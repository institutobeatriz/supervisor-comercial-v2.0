# Plano Arquitetural — Dashboard Comercial WhatsApp
**Data:** 2026-03-05
**Autor:** Arquiteto de Software + Engenheiro de Dados + Engenheiro IA/LLM + QA + Segurança
**Versão:** 1.0
**Stack:** Node.js/TypeScript, Fastify, BullMQ, PostgreSQL 16 + pgvector, Redis, React/Vite

---

## 1. Leitura do Repositório e Diagnóstico

### O que existe hoje

**Estrutura do monorepo:**
```
apps/
  api/      → Fastify (webhook, dashboard, conversations, alerts, reviews)
  worker/   → BullMQ workers (classify, stt, analyze, rag-index, report)
  dashboard/ → React + Vite + Tailwind

packages/
  db/         → Pool pg, queries, migrate, types
  llm/        → classifyMessage (Kimi K2.5 / DeepSeek / GLM-5-FP8)
  stt/        → Groq Whisper (base64, URL, encrypted HKDF)
  audit/      → logAudit + createAuditEntry
  governance/ → limits, alerts, decideOutcome
  planner/    → Ralph Loop (deliberativo, gap-analyzer)
  embeddings/ → (stub — embedding não populado)
  evolution/  → normalizer (estrutura do payload Evolution API)

infra/
  migrations/ → 001_init, 002_human_reviews, 003_add_monthly_goal,
                004_seed_sellers, 008_ralph_feedback,
                009_message_deduplication.sql.skip  ← CRÍTICO
  docker/     → Dockerfile.api, Dockerfile.worker
```

**Fluxo atual:**
1. `POST /webhooks/evolution` → parse → `setImmediate(processMessage)`
2. `processMessage` → upsert contact/conversation → insertMessage → enfileira STT ou classify
3. Se image/document em stage avançado → **chama Vision API de forma SÍNCRONA** no handler
4. STT Worker → Groq Whisper → salva text → enfileira classify
5. Classify Worker → LLM → salva label → atualiza funnel → detect sale/lost
6. Analyze Worker → quality_score determinístico por labels
7. Dashboard API → queries SQL diretas → polling do frontend

### Pontos Críticos (bugs e riscos)

| # | Problema | Gravidade | Local |
|---|----------|-----------|-------|
| P1 | **Deduplication migration (.skip)** — eventos duplicados entram no banco | 🔴 CRÍTICO | `infra/migrations/009` |
| P2 | **Vision/OCR síncrono no webhook handler** — pode estourar timeout de 150ms | 🔴 CRÍTICO | `webhook.ts:269` |
| P3 | **Sem raw_events table** — `raw_event` fica em `messages.raw_event JSONB` (não imutável, se o registro for deletado perde o evento) | 🔴 CRÍTICO | `queries.ts` |
| P4 | **API Key hardcoded** — `EVOLUTION_API_KEY = 'evolution-api-key-2024'` como fallback | 🟠 ALTO | `webhook.ts:17` |
| P5 | **Multi-tenancy hardcoded** — mapa instance→seller no código, não no banco | 🟠 ALTO | `webhook.ts:8-13` |
| P6 | **Sem idempotência** — sem chave de dedup no `insertMessage`, re-delivery duplica | 🟠 ALTO | `queries.ts` |
| P7 | **confidence: 0.85 hardcoded** no Ralph Loop — não é calculado de verdade | 🟡 MÉDIO | `worker/index.ts:151` |
| P8 | **`audio_transcripts` table existe mas não é usada** — transcription vai para `messages.text` | 🟡 MÉDIO | `worker/index.ts:403` |
| P9 | **RAG worker é TODO** — embeddings nunca populados | 🟡 MÉDIO | `worker/index.ts:547` |
| P10 | **Dashboard usa polling** — sem WebSocket/SSE para real-time | 🟡 MÉDIO | `dashboard/` |
| P11 | **`conversation_insights` referencia colunas `temperature`, `urgency_score`** que não existem na migration 001 | 🟡 MÉDIO | `conversations.ts:62` |
| P12 | **HKDF no STT é aproximado** — ignora verificação MAC do WhatsApp | 🟡 MÉDIO | `stt/index.ts:250` |
| P13 | **Sem `mensalidade vs venda nova`** — toda conversão vai para `won` sem distinção | 🟡 MÉDIO | domínio |
| P14 | **Sem métricas estruturadas** — `console.log` espalhados, sem Prometheus/traces | 🟡 MÉDIO | global |
| P15 | **Report worker é TODO** — cron dispara mas não gera nada | 🟢 BAIXO | `worker/index.ts:560` |

### O que está bem
- Arquitetura event-driven com BullMQ (lanes fast/slow/critical/stt)
- LLM conservador com regras determinísticas de validação (hasPaymentConfirmation)
- Camada de governança com circuit-breaker por custo
- Schema bem normalizado com pgvector para RAG
- Audit log estruturado por job
- Retry com exponential backoff no LLM

---

## 2. Arquitetura Recomendada

### Diagrama (texto)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INGESTÃO                                        │
│                                                                          │
│  Evolution API ──▶ POST /webhooks/evolution ──▶ raw_events (append-only)│
│                           │                                              │
│                      IMEDIATO: reply 200                                 │
│                           │                                              │
│                    setImmediate / enfileira                              │
│                           ▼                                              │
│                    Queue: ingest                                         │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                   ┌──────────────────▼─────────────────┐
                   │         NORMALIZAÇÃO                │
                   │                                     │
                   │  upsert contact + conversation      │
                   │  insertMessage (com message_id dedup)│
                   │         │                           │
                   │   tipo de mídia?                    │
                   └──┬──────┬──────┬────────────────────┘
                      │      │      │
              text  audio  image  document
                      │      │      │
              ┌───────┘  ┌───┘  ┌───┘
              ▼          ▼      ▼
         Queue:     Queue:  Queue:
         classify    stt    vision
              │          │      │
              ▼          ▼      ▼
     ┌─────────────────────────────────┐
     │         PROCESSAMENTO IA        │
     │                                 │
     │  STT Worker (Groq Whisper)      │
     │    └──▶ classify após transcrição│
     │                                 │
     │  Vision Worker (Kimi Vision)    │
     │    └──▶ OCR comprovante         │
     │    └──▶ classify se não comprovante│
     │                                 │
     │  Classify Worker (LLM routing)  │
     │    └──▶ label + funnel          │
     │    └──▶ detect sale/lost        │
     │    └──▶ Queue: analyze          │
     │                                 │
     │  Analyze Worker (quality_score) │
     │    └──▶ Queue: rag-index        │
     │                                 │
     │  RAG Worker (embeddings)        │
     └─────────────────────────────────┘
                      │
                      ▼
              ┌──────────────┐
              │   STORAGE    │
              │              │
              │  PostgreSQL  │
              │  + pgvector  │
              │              │
              │  Redis cache │
              │  (KPIs 30s)  │
              └──────────────┘
                      │
                      ▼
              ┌──────────────┐
              │  DASHBOARD   │
              │              │
              │  API Fastify │
              │  + SSE/WS    │
              │              │
              │  React/Vite  │
              └──────────────┘
```

### Componentes e Responsabilidades

| Componente | Responsabilidade | Tecnologia |
|-----------|-----------------|------------|
| `api` | Webhook ingestion, dashboard queries, SSE | Fastify |
| `worker` | STT, Vision, Classify, Analyze, RAG, Report | BullMQ |
| `packages/db` | Pool, queries, types, migrations | pg + pgvector |
| `packages/llm` | Classificação (roteamento por custo) | GLM-5/Kimi/DeepSeek |
| `packages/stt` | Transcrição de áudio | Groq Whisper |
| `packages/vision` | OCR de imagem/PDF (novo) | Kimi Vision / Mistral Pixtral |
| `packages/audit` | Log imutável de decisões IA | pg append-only |
| `packages/governance` | Circuit-breaker custo + limites | determinístico |
| PostgreSQL | Fonte da verdade + vetores | pg 16 + pgvector |
| Redis | Filas (BullMQ) + cache KPIs | Redis 7 |

---

## 3. Fluxo de Dados Fim a Fim

### Passo a passo (mensagem de texto)

```
1. Evolution API → POST /webhooks/evolution
   Headers: Authorization: Bearer {WEBHOOK_SECRET}
   Body: { event: "messages.upsert", instance: "Multivix", data: {...} }

2. Webhook handler:
   a. Valida auth token
   b. Valida schema (zod)
   c. INSERT INTO raw_events (event, instance, data, received_at)
      → retorna 200 imediatamente
   d. setImmediate → enfileira job "ingest" na Queue:ingest

3. Worker Ingest:
   a. Verifica deduplication (ON CONFLICT message_id DO NOTHING)
   b. upsert contact (phone_e164)
   c. upsert conversation (contact_id, seller_id via instance_map no banco)
   d. INSERT INTO messages (..., whatsapp_message_id, raw_event_id)
   e. Se tipo = text e direction = inbound → Queue:classify
   f. Se tipo = audio → Queue:stt
   g. Se tipo = image/document → Queue:vision

4. Worker STT (para áudio):
   a. Baixa via Evolution API getBase64 ou descriptografia local
   b. Groq Whisper → transcript
   c. INSERT INTO audio_transcripts (message_id, transcript, provider)
   d. UPDATE messages SET text = transcript
   e. Queue:classify com o texto transcrito

5. Worker Vision (para imagem/PDF):
   a. Baixa via Evolution API
   b. Kimi Vision → analisa se é comprovante + extrai valor
   c. Se é comprovante:
      → UPDATE messages SET vision_result = {...}
      → registra sales_outcome = 'won' + value_cents
      → avança conversation.funnel_stage = 'closed_won'
      → classifica como mensalidade ou venda_nova (regras domínio)
   d. Se não é comprovante:
      → Queue:classify (descreve imagem via vision para contexto)

6. Worker Classify:
   a. Roteamento: mensagem curta (<20 chars) → regras heurísticas
   b. Roteamento: mensagem longa → LLM (GLM-5-FP8 ou Kimi K2.5)
   c. UPSERT message_labels (intent, funnel_stage, sentiment, ...)
   d. Atualiza conversation.funnel_stage (apenas avança)
   e. Se detected_sale → governance.decideOutcome → INSERT sales_outcomes
   f. Queue:analyze (dedup por conversation_id)

7. Worker Analyze:
   a. Agrega labels da conversa
   b. Calcula quality_score (0-100)
   c. Gera wins/mistakes/next_best_actions via LLM (1x por conversa, lazy)
   d. UPSERT conversation_insights
   e. Queue:rag-index

8. Worker RAG:
   a. Cria chunks de texto (sliding window 512 tokens)
   b. Gera embedding via modelo local ou API
   c. INSERT INTO rag_chunks (chunk_text, embedding, metadata)

9. Dashboard:
   a. API Fastify serve queries SQL + Redis cache (30s TTL)
   b. SSE endpoint emite eventos quando conversation_insights muda
   c. Frontend React atualiza em near-real-time
```

---

## 4. Schema do Banco

### Tabelas atuais (001_init.sql) — mantidas

Todas as tabelas existentes estão corretas. Abaixo os **complementos/correções** necessários:

### Migration 005 — raw_events (append-only)

```sql
-- APPEND-ONLY — nunca deletar, nunca atualizar
CREATE TABLE IF NOT EXISTS raw_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event       TEXT NOT NULL,
    instance    TEXT NOT NULL,
    data        JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Chave de deduplicação extraída do payload
    whatsapp_id TEXT NULL  -- key.id do Evolution API
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_events_whatsapp_id
    ON raw_events (whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_events_received_at
    ON raw_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_instance
    ON raw_events (instance, received_at DESC);
```

### Migration 006 — messages (adicionar deduplication + FK raw_events)

```sql
-- Adicionar foreign key para raw_events
ALTER TABLE messages ADD COLUMN IF NOT EXISTS raw_event_id UUID REFERENCES raw_events(id);
-- Chave de deduplicação do WhatsApp
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT NULL;
-- Índice único para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_dedup
    ON messages (conversation_id, whatsapp_message_id)
    WHERE whatsapp_message_id IS NOT NULL;
```

### Migration 007 — conversation_insights (colunas faltantes)

```sql
-- Adicionar colunas referenciadas mas ausentes
ALTER TABLE conversation_insights ADD COLUMN IF NOT EXISTS temperature TEXT NULL;
ALTER TABLE conversation_insights ADD COLUMN IF NOT EXISTS urgency_score SMALLINT NULL;
```

### Migration 009 — habilitar deduplication (remover .skip)

```sql
-- Renomear 009_message_deduplication.sql.skip → 009_message_deduplication.sql
-- (já tem o SQL correto, só falta remover .skip)
```

### Migration 010 — instance_seller_map (tirar do código)

```sql
CREATE TABLE IF NOT EXISTS instance_seller_map (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance    TEXT NOT NULL UNIQUE,
    seller_id   UUID NOT NULL REFERENCES sellers(id),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed com dados atuais
INSERT INTO instance_seller_map (instance, seller_id) VALUES
    ('Multivix',       '80a50431-8f36-477c-9072-f0adcba3696e'),
    ('Multivix-Alunos','80a50431-8f36-477c-9072-f0adcba3696e'),
    ('Instituto-Vendas','6f875432-5dea-4fcf-972e-b278eb2c1d5b'),
    ('instituto-vendas','6f875432-5dea-4fcf-972e-b278eb2c1d5b')
ON CONFLICT (instance) DO NOTHING;
```

### Migration 011 — sales_outcomes (tipo de venda)

```sql
ALTER TABLE sales_outcomes ADD COLUMN IF NOT EXISTS sale_type TEXT NULL;
  -- 'nova_venda' | 'mensalidade' | 'renovacao' | NULL

ALTER TABLE sales_outcomes ADD COLUMN IF NOT EXISTS evidence_message_ids UUID[] NULL;
  -- IDs das mensagens que provam a venda (comprovante + texto)

ALTER TABLE sales_outcomes ADD COLUMN IF NOT EXISTS comprovante_url TEXT NULL;
ALTER TABLE sales_outcomes ADD COLUMN IF NOT EXISTS comprovante_analyzed_at TIMESTAMPTZ NULL;
```

### Migration 012 — sellers (email + meta)

```sql
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email TEXT NULL;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS monthly_goal_cents INTEGER NOT NULL DEFAULT 5000000;
```

### Migration 013 — audit_log (persistente)

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id    TEXT NOT NULL,
    job_id      TEXT NOT NULL,
    task        TEXT NOT NULL,
    action      TEXT NOT NULL,
    model       TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    cost_cents  INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL,
    decision    TEXT NOT NULL,  -- 'success' | 'fallback' | 'error' | 'rejected'
    reason      TEXT NULL,
    input_hash  TEXT NULL,  -- sha256 do input (não armazena PII)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_trace ON audit_log (trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_task  ON audit_log (task, created_at DESC);
```

### Índices Adicionais Recomendados

```sql
-- Para dashboard queries de período
CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations (seller_id, created_at DESC);

-- Para busca de comprovantes
CREATE INDEX IF NOT EXISTS idx_sales_outcomes_sale_type
    ON sales_outcomes (sale_type, outcome);

-- Para análise de objeções
CREATE INDEX IF NOT EXISTS idx_message_labels_funnel_intent
    ON message_labels (funnel_stage, intent);
```

### Tabelas e campos que são "append-only" (nunca deletar/atualizar)

| Tabela | Motivo |
|--------|--------|
| `raw_events` | Fonte da verdade imutável de todos os webhooks recebidos |
| `audit_log` | Log imutável de decisões IA (LGPD + auditoria) |
| `messages` | Registros de mensagens (nunca delete — apenas anonimize) |
| `audio_transcripts` | Transcrição original (reprocessamento usa nova versão) |

---

## 5. Pipeline de Mídia (Áudio / Imagem / PDF)

### Fluxo Atual vs. Proposto

**Problema atual:** Vision API chamada de forma **síncrona** no webhook handler, bloqueando a resposta.

**Solução:** Tudo via fila dedicada `Queue:vision`.

### Áudio

```
Evolution API
    │
    ├─ getBase64FromMediaMessage/{instance}   ← tentativa 1 (já implementado)
    │      se falhar ↓
    ├─ descriptografia local HKDF-SHA256      ← fallback (já implementado)
    │      se falhar ↓
    └─ DLQ: dead_letter com raw_event_id para reprocessamento manual

    ▼
Groq Whisper large-v3-turbo
    │
    ├─ language: 'pt'
    ├─ prompt: contexto da conversa (últimas 3 mensagens)   ← NOVO: contexto
    └─ response_format: 'verbose_json'   ← NOVO: pega segments com timestamps

    ▼
Diarização simples (heurística):
    - direction = outbound → speaker: 'vendedor'
    - direction = inbound → speaker: 'cliente'
    - (sem speaker diarization real por custo — Groq não suporta)

    ▼
INSERT INTO audio_transcripts (message_id, transcript, provider, duration_sec, confidence)
UPDATE messages SET text = transcript
Queue:classify
```

### Imagem

```
Queue:vision job { messageId, base64/url, mime, conversationId, sellerId }
    │
    ▼
Worker Vision:
    1. Detectar se é comprovante (heurísticas ANTES de chamar LLM):
       a. Nome do arquivo contém: "comprovante", "pix", "pagamento", "recibo"
       b. MIME = image/jpeg ou image/png (90%+ dos comprovantes)
       c. Conversa está em estágio >= proposta
       → Se 2+ sinais positivos: vai direto para OCR
       → Se 0 sinais: classifica como "foto genérica" e para (evita custo)

    2. OCR via Kimi Vision (já implementado):
       → Extrai: isComprovante, valorReais, tipoTransacao, nomeBanco

    3. Se isComprovante = true:
       → Classifica tipo: mensalidade | renovacao | nova_venda
       → Atualiza sales_outcomes com sale_type

    4. Se isComprovante = false:
       → Opcional: gerar descrição da imagem para contexto do classify
```

### PDF

```
Queue:vision job { messageId, base64/url, mime: 'application/pdf', ... }
    │
    ▼
Worker Vision PDF:
    1. Extrair texto via pdf-parse (lib npm, sem custo)
       → Se texto extraído > 100 chars: usa texto diretamente
       → Se texto extraído < 100 chars (PDF escaneado): vai para OCR

    2. OCR de PDF escaneado:
       → Converte página 1 para imagem via sharp/canvas
       → Envia imagem para Kimi Vision (mesma lógica de imagem)

    3. Análise do texto extraído:
       → Detectar comprovante via regex (mesmos padrões do text fallback)
       → Extrair valor, banco, tipo de transação
```

### DLQ (Dead Letter Queue)

```
Se qualquer job falha após 3 tentativas:
→ Mover para Queue:dlq com { originalQueue, jobData, error, attempt }
→ Notificar via alerta (governance.notify)
→ Registrar em audit_log com decision = 'error'
→ Manter raw_event_id para reprocessamento futuro
```

---

## 6. Camada de IA (Prompts, Modelos, Roteamento)

### Roteamento por Custo (Decisão em Cascata)

```
mensagem recebida
    │
    ├─ Heurística rápida (0ms, 0 custo):
    │   - len < 15 chars E sem keywords → classifica como 'lead'/'outro'
    │   - match regex forte (pix, paguei, comprovante) → 'closed_won'
    │   - match regex negação (não quero, desisti) → 'closed_lost'
    │   → Se confiança > 0.95: PARA AQUI
    │
    ├─ Modelo barato (GLM-5-FP8, ~$0.0001/call):
    │   - Mensagens de 15-200 chars
    │   - max_tokens: 150, temperature: 0.1
    │   → Se confiança > 0.75: PARA AQUI
    │
    └─ Modelo forte (Kimi K2.5 / DeepSeek-chat, ~$0.001/call):
        - Mensagens longas > 200 chars
        - Mensagens ambíguas (confidence < 0.75 do modelo barato)
        - Contexto de conversa longa (last 5 messages)
```

### Prompt de Classificação (Versão 2 — melhorado)

```
SYSTEM:
Você é classificador de mensagens de WhatsApp de vendas comerciais.
Contexto: {ultimasMensagens} (últimas 5 mensagens da conversa)

Retorne APENAS JSON válido:
{
  "intent": "compra|duvida|reclamacao|desistencia|negociacao|outro",
  "funnel_stage": "lead|qualificacao|proposta|negociacao|fechamento|closed_won|closed_lost",
  "sentiment": 1-5,
  "objection": "preco|prazo|necessidade|confianca|concorrencia|nenhuma",
  "needs_attention": boolean,
  "attention_reason": "string ou null",
  "value_cents": number_ou_null,
  "confidence": 0.0-1.0,
  "gap": "o que o vendedor deixou de fazer ou poderia ter feito melhor"
}

REGRAS CRÍTICAS:
- closed_won APENAS com confirmação EXPLÍCITA de pagamento realizado
- closed_lost APENAS com desistência EXPLÍCITA ("não quero mais", "vou com outra")
- gap: só preencher se funnel_stage = closed_lost ou negociacao prolongada
```

### Extração de Insights (Analyze Worker — V1)

```
Prompt para wins/mistakes/next_best_actions:
INPUT: últimas N mensagens da conversa (truncadas a 4000 tokens)
OUTPUT: {
  wins: [{title, evidence_msg_ids, why}],
  mistakes: [{title, evidence_msg_ids, why, fix}],
  next_best_actions: [{action, why, suggested_text}],
  summary: "resumo em 2 linhas"
}

Custo: executar 1x por conversa quando muda de estágio
Modelo: Kimi K2.5 (qualidade) com cache de resultado por 24h
```

### Detecção de Comprovante (Vision)

```
Prompt Vision (Kimi moonshot-v1-8k-vision-preview):
"Analise esta imagem. É um comprovante de pagamento PIX/TED/boleto/transferência?

Se SIM, retorne JSON:
{
  "isComprovante": true,
  "valorReais": 99.90,
  "tipoTransacao": "pix|ted|boleto|cartao|outro",
  "nomeBanco": "string",
  "dataTransacao": "YYYY-MM-DD ou null",
  "nomeRemetente": "string ou null",
  "nomeDestinatario": "string ou null"
}

Se NÃO, retorne:
{"isComprovante": false}

Responda APENAS com JSON. Sem texto adicional."
```

### Modelos por Etapa

| Etapa | Modelo | Custo estimado | Fallback |
|-------|--------|----------------|----------|
| Heurística rápida | Regex/regras | $0 | — |
| Classificação mensagens curtas | GLM-5-FP8 | ~$0.0001/msg | heurística |
| Classificação mensagens longas | Kimi K2.5 | ~$0.001/msg | GLM-5 |
| Análise de insights (conversa) | Kimi K2.5 | ~$0.005/conv | skip |
| STT (áudio) | Groq Whisper large-v3-turbo | ~$0.00054/min | — |
| Vision (imagem) | Kimi moonshot-v1-8k-vision | ~$0.002/img | regex texto |
| OCR PDF (texto) | pdf-parse (local) | $0 | Kimi Vision |
| Embeddings RAG | texto-embedding-3-small ou local | ~$0.0001/chunk | skip |

---

## 7. Regras para Comprovante vs. Mensalidade vs. Venda Nova

### Detecção de Comprovante

**Camada 1 — Heurísticas (pré-OCR, 0 custo):**
```
FORTE (score +2 cada):
- Conversa em stage: proposta | negociacao | fechamento
- Mime: image/jpeg | image/png | application/pdf
- Nome arquivo: *comprovante* | *pix* | *pagamento* | *recibo* | *boleto*
- Mensagem de texto anterior (outbound) menciona valor monetário

MÉDIO (score +1 cada):
- Direction: inbound
- Imagem sem caption ou caption curta (<20 chars)
- Horário comercial (08-20h BRT)

NEGATIVO (score -3):
- Stage: lead | qualificacao
- Caption longa (>50 chars) → provavelmente foto de produto/doc

Threshold: score >= 3 → enviar para Vision OCR
```

**Camada 2 — Vision OCR (Kimi Vision):**
```
Extrai: isComprovante, valorReais, tipoTransacao, nomeBanco, dataTransacao
```

**Camada 3 — Fallback (regex em texto):**
```
Pattern: R?\$?\s*(\d{1,6})[,\.](\d{2})\b
Constraint: entre R$5,00 e R$50.000,00
Contexto: mensagem outbound mais recente com valor
```

### Mensalidade vs. Venda Nova

**Sinais de MENSALIDADE/RENOVAÇÃO:**
```javascript
const isMensalidade = [
  /mensalidade/i,
  /renova[çc][aã]o/i,
  /continu[ae]/i,
  /pr[oó]xim[ao]\s*m[eê]s/i,
  /mant[eê]r\s*(o\s*)?plano/i,
  /mês\s*seguinte/i,
  /fatura\s*de\s*\w+\s*\d{4}/i,  // "fatura de março 2026"
  /acesso\s*(liberado|renovado)/i,
].some(r => r.test(text));
```

**Sinais de VENDA NOVA:**
```javascript
const isNovaVenda = [
  /bem[- ]vindo/i,
  /cadastr[ao]/i,
  /primeiro\s*(acesso|pagamento|m[eê]s)/i,
  /come[çc]ando/i,
  /novos?\s*(aluno|cliente|membro)/i,
  /inscri[çc][aã]o/i,
].some(r => r.test(conversationText));
```

**Heurística por histórico:**
```
IF contact tem sales_outcome = 'won' com date < (now - 25 dias)
  AND novo comprovante chega
  AND valor ≈ mesmo valor anterior (±10%)
→ Classificar como 'mensalidade'

ELSE IF primeiro comprovante do contact
→ Classificar como 'nova_venda'

ELSE IF mesmo valor que pacote padrão
→ Incerto → sinalizar para revisão humana (needs_attention = true)
```

### Identificar Etapa do Funil e Perda

**Mapeamento intent → funnel_stage:**
```
lead:          primeiro contato, perguntas genéricas
qualificacao:  "tenho interesse", "me conta mais", perguntas específicas
proposta:      "qual o valor", "como funciona", "me manda mais detalhes"
negociacao:    "tá caro", "tem desconto", "posso parcelar", "como pago"
fechamento:    "vou fazer o pix", "me manda os dados", "fechado"
closed_won:    comprovante confirmado OU texto explícito de pagamento
closed_lost:   "não vou mais", "muito caro", "vou com outro", "desisti"
```

**Detectar perda e gap:**
```
Perda detectada quando:
- intent = 'desistencia' com confiança > 0.7
- Texto explícito de desistência
- 7+ dias sem resposta (cron detecta leads inativos)

Gap = o que faltou:
- Se objeção = 'preco': vendedor não ofereceu parcelamento/desconto
- Se objeção = 'confianca': vendedor não enviou prova social/depoimento
- Se objeção = 'necessidade': vendedor não qualificou bem (lead frio)
- Se lost por timeout: follow-up não foi feito
```

---

## 8. Plano por Fases (MVP → V1 → V2)

### MVP — Fundação Sólida (Semana 1-2)
**Critério de pronto:** Sistema recebe, persiste e não duplica eventos. Análise básica funciona.

| # | Tarefa | Arquivo | Prioridade |
|---|--------|---------|------------|
| M1 | Habilitar migration 009 (deduplication) | `infra/migrations/009*.skip → .sql` | 🔴 |
| M2 | Criar migration raw_events (append-only) | `infra/migrations/005_raw_events.sql` | 🔴 |
| M3 | Criar migration instance_seller_map | `infra/migrations/010_instance_map.sql` | 🔴 |
| M4 | Criar migration sales_outcomes sale_type | `infra/migrations/011_sale_type.sql` | 🟠 |
| M5 | Criar migration conversation_insights cols | `infra/migrations/007_insights_cols.sql` | 🟠 |
| M6 | Mover Vision OCR para Queue:vision (async) | `apps/api/routes/webhook.ts` | 🔴 |
| M7 | Adicionar Vision Worker no worker/index.ts | `apps/worker/src/index.ts` | 🔴 |
| M8 | Remover hardcoded EVOLUTION_API_KEY fallback | `apps/api/routes/webhook.ts:17` | 🟠 |
| M9 | Criar queue "ingest" e mover processMessage | `apps/api`, `apps/worker` | 🟡 |
| M10 | Salvar em raw_events antes de processar | `webhook.ts processMessage` | 🔴 |

### V1 — Pipeline Completo + Dashboard Real-time (Semana 3-6)
**Critério de pronto:** Áudio, imagem e PDF processados. Dashboard com near-real-time. Insights gerados.

| # | Tarefa | Detalhe |
|---|--------|---------|
| V1.1 | Implementar `packages/vision` dedicado | OCR de imagem + PDF separado do webhook |
| V1.2 | Melhoria STT: contexto nas últimas 5 msgs | Passar context_hint para Groq Whisper |
| V1.3 | Implementar RAG Worker real | Gerar embeddings + inserir rag_chunks |
| V1.4 | SSE endpoint `/events` (near real-time) | Emite quando conversation_insights muda |
| V1.5 | Implement Analyze Worker com LLM (wins/mistakes) | Prompt para gerar insights de conversa |
| V1.6 | Implementar regras mensalidade vs nova_venda | Migration + lógica no vision worker |
| V1.7 | Implement DLQ com notificação | Queue:dlq + governance.notify |
| V1.8 | Implementar Report Worker diário | Relatório diário real com dados |
| V1.9 | Migrar instance_seller_map para banco | Remover hardcoded de webhook.ts |
| V1.10 | Substituir console.log por Pino estruturado | Structured logging + trace_id em todos |
| V1.11 | Audit log → banco (migration 013) | Persistir audit_log em PostgreSQL |
| V1.12 | Redis cache para KPIs (30s TTL) | Evitar queries pesadas no dashboard |
| V1.13 | Tela "Análise por Conversa" no dashboard | Timeline + wins/mistakes/next_actions |
| V1.14 | Corrigir cálculo de taxa de conversão | Já iniciado nos commits recentes |

### V2 — Inteligência Avançada + LGPD + Observabilidade (Semana 7-12)
**Critério de pronto:** Sistema auditável, observável, LGPD-compliant, RAG funcionando.

| # | Tarefa | Detalhe |
|---|--------|---------|
| V2.1 | Dashboard follow-up inteligente | Alerta leads inativos > 48h com sugestão |
| V2.2 | RAG: busca por objeção similar | "Como outros vendedores superaram objeção de preço?" |
| V2.3 | Métricas Prometheus + Grafana | Latência, tokens/custo, jobs por status |
| V2.4 | Reprocessamento de conversas antigas | Admin trigger para re-rodar análise com modelo novo |
| V2.5 | Anonimização automática após N dias | Job cron: LGPD data retention |
| V2.6 | Webhook signature verification HMAC | Validar assinatura do Evolution API |
| V2.7 | Multi-instância dinâmica | CRUD no dashboard para gerenciar instance_map |
| V2.8 | Tela de métricas IA (precisão/recall) | Com conjunto de teste anotado |
| V2.9 | A/B testing de prompts | Comparar resultados entre versões de prompt |
| V2.10 | Exportação CSV/XLSX de conversas | Para análise manual e treinamento |

---

## 9. Observabilidade + Idempotência + Retentativa

### Idempotência

**Webhook:**
```
raw_events.whatsapp_id = key.id do Evolution API
→ ON CONFLICT (whatsapp_id) DO NOTHING
→ Qualquer re-delivery é descartado silenciosamente
```

**Messages:**
```
messages.whatsapp_message_id = key.id
→ ON CONFLICT (conversation_id, whatsapp_message_id) DO NOTHING
→ Inserção idempotente garantida
```

**BullMQ Jobs:**
```
Queue:analyze: jobId = `analyze-${conversationId}` (já implementado)
Queue:vision:  jobId = `vision-${messageId}`
Queue:stt:     jobId = `stt-${messageId}`
→ deduplicação por jobId evita processamento duplo
```

### Retentativa (Retry Policy)

```javascript
// Config padrão para todos os workers
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,   // 2s, 4s, 8s
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
};

// STT e Vision: mais tentativas (download pode falhar)
const mediaJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 3000 },
};
```

### Observabilidade

**Logs estruturados (Pino):**
```javascript
log.info({
  traceId,         // propagado do raw_event até o audit_log
  jobId,
  conversationId,
  messageId,
  duration_ms,
  model,
  tokens,
  cost_cents,
  decision,
}, '[Classify] Completed');
```

**Trace ID:** gerado no webhook, propagado por todos os jobs

**Métricas (V2):**
```
supervisor_webhook_received_total{instance, event}
supervisor_job_duration_ms{queue, status}
supervisor_llm_tokens_total{model, task}
supervisor_llm_cost_cents_total{model, task}
supervisor_stt_duration_ms{provider}
supervisor_vision_result{result: comprovante|nao_comprovante}
```

**DLQ:**
```
Queue:dlq → alertas via governance.notify (Slack/webhook)
Registro em audit_log com decision = 'dlq'
Payload preservado para reprocessamento manual via Admin API
```

---

## 10. Testes e Métricas

### Estratégia de Testes

**Camada 1 — Testes Unitários:**
```
packages/llm:
  - isSale(): casos borda (mensagens curtas, sem confirmação)
  - isLost(): falsos negativos críticos
  - hasPaymentConfirmation(): regex coverage

packages/governance:
  - decideOutcome(): limites de custo
  - detectMensalidade(): edge cases

packages/vision (novo):
  - heurísticas pré-OCR
  - parseComprovante()
```

**Camada 2 — Testes de Integração:**
```
Webhook pipeline:
  - Envia payload Evolution → verifica raw_event + message criados
  - Re-envia mesmo payload → verifica que NÃO duplicou
  - Payload inválido → 200 ok ignorado silenciosamente

Worker STT:
  - Audio real (fixture ogg) → verifica transcrição
  - Base64 inválido → vai para DLQ

Worker Classify:
  - Texto "Já fiz o pix de R$500" → closed_won + sales_outcome
  - Texto "Quanto custa?" → negociacao
  - Texto "Ok" → lead (não é venda)
```

**Camada 3 — Golden Dataset (QA):**
```
Dataset:
  - 50 conversas reais anonimizadas
  - Labels manuais: etapa final, outcome, objeção principal
  - 10+ comprovantes reais com valor anotado

Métricas alvo:
  Classificação de intent:    precision >= 0.85, recall >= 0.80
  Detecção de venda:          precision >= 0.90, recall >= 0.85
  Detecção de perda:          precision >= 0.80, recall >= 0.75
  OCR de comprovante:         precision >= 0.95, recall >= 0.90
  Extração de valor:          RMSE <= R$5,00 para valores < R$1000

Execução:
  - Cron semanal: re-roda golden dataset, compara com baseline
  - Alerta se qualquer métrica cair > 5pp em relação à semana anterior
```

**Detecção de Regressão:**
```
scripts/eval-golden.ts
  1. Carrega fixtures de infra/test-fixtures/
  2. Processa cada conversa via pipeline real (modo dry-run)
  3. Compara com labels_expected
  4. Gera relatório JSON com precision/recall/F1 por classe
  5. Exit code 1 se threshold não atingido (bloqueia CI)
```

### Dataset de Testes (Estrutura)

```
infra/test-fixtures/
  conversations/
    conv_001_nova_venda.json    ← conversa + expected labels
    conv_002_mensalidade.json
    conv_003_objection_preco.json
    conv_004_closed_lost.json
    conv_050_...json
  comprovantes/
    comprovante_pix_50reais.jpg + .expected.json
    comprovante_ted_1500reais.jpg + .expected.json
    foto_produto.jpg + .expected.json (não é comprovante)
```

---

## 11. Riscos LGPD e Mitigação

### Dados Pessoais Identificados

| Dado | Tabela/Campo | Classificação | Retenção |
|------|-------------|---------------|----------|
| Número de telefone | `contacts.phone_e164` | PII sensível | 2 anos após último contato |
| Nome | `contacts.display_name` | PII | 2 anos |
| Áudio (voz) | `messages.media_url` | PII sensível (biometria) | 6 meses |
| Transcrição de voz | `audio_transcripts.transcript` | PII | 1 ano |
| Mensagens de texto | `messages.text` | PII | 1 ano |
| Valor de pagamento | `sales_outcomes.value_cents` | Dado financeiro | 5 anos (fiscal) |
| Comprovante (imagem) | `messages.media_url` | PII financeiro | 5 anos |

### Medidas de Segurança

**1. Criptografia em repouso:**
```
- PostgreSQL: full disk encryption (infra level)
- Redis: TLS em trânsito
- Mídia (áudio/imagem): armazenar em S3 com SSE-S3 (não em disco local)
- Chaves de API: vault/secrets manager (não em .env commitado)
```

**2. Segregação de dados:**
```
- Separar dados de cada instância (seller) por row-level security (PG RLS)
- Dashboard exige seller_id no token JWT
- Admin API separada com autenticação própria
```

**3. Retenção e Anonimização:**
```sql
-- Job cron mensal: anonimizar contatos inativos > 2 anos
UPDATE contacts
SET
  display_name = 'ANONIMIZADO',
  phone_e164 = 'ANON-' || md5(phone_e164)  -- hash irreversível
WHERE last_interaction_at < NOW() - INTERVAL '2 years';

-- Deletar transcrições de áudio > 1 ano
DELETE FROM audio_transcripts
WHERE created_at < NOW() - INTERVAL '1 year';
```

**4. Prevenção de Duplicidade e Idempotência:**
```
- raw_events.whatsapp_id: UNIQUE INDEX
- messages.whatsapp_message_id: UNIQUE INDEX por conversation
- BullMQ jobId dedup por messageId
- Logs de duplicatas no audit_log
```

**5. Logs e Auditoria:**
```
- audit_log: registra TODA decisão IA (append-only, nunca deletar)
- Não armazena PII nos logs — apenas hashes e IDs
- trace_id: rastreabilidade fim a fim
- Acesso admin ao audit_log logado separadamente
```

**6. Controle de Acesso:**
```
- Webhook: EVOLUTION_WEBHOOK_SECRET obrigatório (nunca fallback vazio)
- Dashboard API: JWT com seller_id embedded
- Admin API: token separado com MFA
- Evolution API Key: variável de ambiente obrigatória sem fallback
```

**7. Riscos Residuais:**
```
RISCO: Chave Groq/Kimi vazar em logs
MITIGAÇÃO: nunca logar Authorization headers; audit_log só armazena model/tokens

RISCO: Transcrição de áudio exposta na resposta da API
MITIGAÇÃO: endpoint de transcript requer permissão explícita; dado paginado

RISCO: Comprovante com dados bancários armazenado em media_url externa
MITIGAÇÃO: fazer proxy/re-encrypt via próprio storage S3 com signed URLs temporários

RISCO: LLM recebe PII (nome + mensagem)
MITIGAÇÃO: não incluir número de telefone no prompt; usar contactName apenas
```

---

## 12. Perguntas Finais

1. **Volume esperado:** Quantas mensagens/dia por instância (Multivix, Instituto-Vendas)? Isso define se Redis cache de 30s é suficiente ou precisa de SSE em tempo real.

2. **Mídia externa:** Os áudios/imagens ficam no CDN da Evolution API por quanto tempo? Se expiram rápido, precisamos de storage próprio (S3/Supabase Storage) imediatamente.

3. **Mensalidade vs nova venda:** Existe algum produto com valores fixos conhecidos (ex: pacote básico = R$49, avançado = R$199)? Isso elimina ambiguidade na classificação.

4. **Revisão humana:** Existe fluxo de revisão hoje? Um vendedor ou supervisor revisa comprovantes antes de confirmar no sistema? Se sim, precisamos de uma fila de aprovação.

5. **Retenção de dados:** A empresa já tem política de retenção definida? Ou precisa de recomendação padrão para LGPD?

6. **Infra atual:** O sistema roda em VPS, Docker, Kubernetes? Quais são os recursos disponíveis (RAM/CPU) para dimensionar workers?

7. **Múltiplos vendedores por instância:** Uma instância do Evolution pode ter mais de um vendedor? Ou é sempre 1 instância = 1 vendedor?

8. **Acesso ao dashboard:** Quem acessa o dashboard? Apenas gestores ou os próprios vendedores também? Isso define controle de acesso por seller_id.

---

## Resumo Executivo

| Item | Status Atual | Próxima Ação |
|------|-------------|--------------|
| Ingestão webhook | ✅ Funcionando | Adicionar raw_events + dedup |
| Deduplicação | 🔴 Desabilitada | Habilitar migration 009 |
| STT (áudio) | ✅ Funcionando | Adicionar contexto de conversa |
| Vision (imagem) | ⚠️ Síncrono/bloqueante | Mover para Queue:vision |
| OCR PDF | ❌ Não existe | Implementar em packages/vision |
| Classificação LLM | ✅ Funcionando | Melhorar roteamento por custo |
| Detecção venda | ⚠️ Falsos positivos | Adicionar regras mensalidade |
| Funil | ✅ Avança corretamente | Adicionar colunas faltantes |
| Insights conversa | ⚠️ Só quality_score | Implementar wins/mistakes LLM |
| Dashboard | ✅ KPIs funcionando | Adicionar SSE real-time |
| RAG | ❌ TODO | Implementar embeddings |
| Observabilidade | ⚠️ Só console.log | Pino + trace_id + audit_log DB |
| LGPD | ❌ Não implementado | Anonimização + retention jobs |
| Testes | ❌ Sem testes | Golden dataset + unit tests |
