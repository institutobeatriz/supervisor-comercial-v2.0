# Dashboard Comercial WhatsApp — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evoluir o dashboard comercial de WhatsApp para ser confiável, idempotente, com pipeline de mídia completo, análises IA de qualidade, observabilidade e compliance LGPD.

**Architecture:** Monorepo TypeScript (Fastify + BullMQ + PostgreSQL 16 + pgvector + Redis). Adiciona raw_events append-only, move processamento de mídia para filas dedicadas, adiciona SSE real-time, Pino logging estruturado com trace_id, e testes com golden dataset. Segue event-driven com idempotência garantida por índices únicos no banco.

**Tech Stack:** Node.js/TypeScript, Fastify, BullMQ, PostgreSQL 16 + pgvector, Redis 7, Groq Whisper, Kimi Vision (Moonshot), GLM-5-FP8/Kimi K2.5/DeepSeek, React/Vite/Tailwind, pdf-parse, pino

---

## Fase 0 — Limpeza Cirúrgica (Crítico, Semana 1)

### Task 0.1: Habilitar Migration de Deduplicação

**Contexto:** `infra/migrations/009_message_deduplication.sql.skip` tem o `.skip` impedindo a deduplicação. Sistema está duplicando eventos.

**Files:**
- Rename: `infra/migrations/009_message_deduplication.sql.skip` → `infra/migrations/009_message_deduplication.sql`
- Read: `infra/migrations/009_message_deduplication.sql.skip` (para entender o conteúdo antes)

**Step 1: Leia o conteúdo da migration**

```bash
cat infra/migrations/009_message_deduplication.sql.skip
```

**Step 2: Renomear o arquivo**

```bash
mv infra/migrations/009_message_deduplication.sql.skip \
   infra/migrations/009_message_deduplication.sql
```

**Step 3: Verificar se o SQL já cobre o necessário**

O arquivo deve ter algo como:
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_dedup
    ON messages (conversation_id, whatsapp_message_id)
    WHERE whatsapp_message_id IS NOT NULL;
```

Se não tiver, adicione esses comandos.

**Step 4: Aplicar migration**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
# ou se tiver script:
# npm run migrate -w packages/db
```

**Step 5: Commit**

```bash
git add infra/migrations/009_message_deduplication.sql
git commit -m "fix: enable message deduplication migration (remove .skip)"
```

---

### Task 0.2: Corrigir API Key Hardcoded

**Contexto:** `apps/api/src/routes/webhook.ts:17` tem `EVOLUTION_API_KEY = 'evolution-api-key-2024'` como fallback. Risco de segurança.

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`

**Step 1: Localizar e corrigir**

Em `apps/api/src/routes/webhook.ts`, linha ~17:

Antes:
```typescript
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'evolution-api-key-2024';
```

Depois:
```typescript
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
if (!EVOLUTION_KEY) {
  throw new Error('EVOLUTION_API_KEY environment variable is required');
}
```

**Step 2: Verificar se EVOLUTION_API_KEY está no .env.example**

Abra `.env.example` e confirme que contém:
```
EVOLUTION_API_KEY=your-evolution-api-key-here
```

Se não tiver, adicione.

**Step 3: Commit**

```bash
git add apps/api/src/routes/webhook.ts .env.example
git commit -m "security: remove hardcoded EVOLUTION_API_KEY fallback"
```

---

### Task 0.3: Corrigir Colunas Faltantes em conversation_insights

**Contexto:** `apps/api/src/routes/conversations.ts:62` faz query de `ci.temperature` e `ci.urgency_score` que não existem na migration 001.

**Files:**
- Create: `infra/migrations/007_insights_missing_cols.sql`

**Step 1: Criar migration**

```sql
-- infra/migrations/007_insights_missing_cols.sql
-- Adicionar colunas que são referenciadas na API mas não existem no schema
ALTER TABLE conversation_insights
    ADD COLUMN IF NOT EXISTS temperature TEXT NULL;
    -- 'hot' | 'warm' | 'cold'

ALTER TABLE conversation_insights
    ADD COLUMN IF NOT EXISTS urgency_score SMALLINT NULL;
    -- 0-100
```

**Step 2: Aplicar**

```bash
# Rodar migration
node -e "require('./packages/db/dist/migrate.js').migrate()"
```

**Step 3: Commit**

```bash
git add infra/migrations/007_insights_missing_cols.sql
git commit -m "fix: add missing temperature and urgency_score columns to conversation_insights"
```

---

## Fase 1 — Raw Events Append-Only (Semana 1)

### Task 1.1: Migration raw_events

**Contexto:** Eventos do webhook vão direto para `messages.raw_event JSONB`. Se a mensagem for deletada, o evento original se perde. Precisamos de uma tabela imutável append-only.

**Files:**
- Create: `infra/migrations/005_raw_events.sql`

**Step 1: Criar migration**

```sql
-- infra/migrations/005_raw_events.sql
-- APPEND-ONLY: nunca deletar, nunca atualizar registros desta tabela
CREATE TABLE IF NOT EXISTS raw_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event           TEXT NOT NULL,
    instance        TEXT NOT NULL,
    data            JSONB NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ID do WhatsApp extraído do payload para deduplicação
    whatsapp_id     TEXT NULL,
    -- Ponteiro para a mensagem criada a partir deste evento (nullable)
    message_id      UUID NULL REFERENCES messages(id) ON DELETE SET NULL
);

-- Índice de deduplicação por whatsapp_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_events_whatsapp_id
    ON raw_events (whatsapp_id) WHERE whatsapp_id IS NOT NULL;

-- Índices para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_raw_events_received_at
    ON raw_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_instance
    ON raw_events (instance, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_event
    ON raw_events (event, received_at DESC);
```

**Step 2: Aplicar migration**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
```

**Step 3: Adicionar FK em messages para raw_events**

Criar `infra/migrations/006_messages_raw_event_fk.sql`:

```sql
-- infra/migrations/006_messages_raw_event_fk.sql
-- Liga message ao raw_event que a originou
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS raw_event_id UUID REFERENCES raw_events(id) ON DELETE SET NULL;

-- Índice para rastreabilidade
CREATE INDEX IF NOT EXISTS idx_messages_raw_event_id
    ON messages (raw_event_id) WHERE raw_event_id IS NOT NULL;
```

**Step 4: Aplicar**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
```

**Step 5: Commit**

```bash
git add infra/migrations/005_raw_events.sql infra/migrations/006_messages_raw_event_fk.sql
git commit -m "feat: add raw_events append-only table with FK from messages"
```

---

### Task 1.2: Persistir raw_event antes de processar

**Contexto:** Atualmente o webhook processa tudo via `setImmediate`. Precisamos salvar o evento bruto ANTES de qualquer processamento.

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`
- Modify: `packages/db/src/queries.ts`

**Step 1: Adicionar função insertRawEvent em queries.ts**

Em `packages/db/src/queries.ts`, adicione após as funções existentes:

```typescript
// ============================================================
// RAW EVENTS — append-only
// ============================================================

export async function insertRawEvent(input: {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  whatsapp_id?: string | null;
}): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO raw_events (event, instance, data, whatsapp_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (whatsapp_id) DO NOTHING
     RETURNING id`,
    [input.event, input.instance, input.data, input.whatsapp_id || null]
  );
  // Se ON CONFLICT (duplicata), buscar o existente
  if (result.rows.length === 0 && input.whatsapp_id) {
    const existing = await query<{ id: string }>(
      'SELECT id FROM raw_events WHERE whatsapp_id = $1',
      [input.whatsapp_id]
    );
    return existing.rows[0];
  }
  return result.rows[0];
}
```

**Step 2: Exportar em packages/db/src/index.ts**

```typescript
export { insertRawEvent } from './queries.js';
```

**Step 3: Modificar webhook.ts para salvar raw_event imediatamente**

Em `apps/api/src/routes/webhook.ts`, dentro do handler `fastify.post('/evolution', ...)`:

Antes de `setImmediate`:
```typescript
// Extrair whatsapp_id para deduplicação
const whatsappId = Array.isArray(parsed.data.data)
  ? null
  : (parsed.data.data as any)?.key?.id || null;

// Salvar raw_event ANTES de processar (append-only, idempotente)
const rawEvent = await insertRawEvent({
  event: parsed.data.event,
  instance: parsed.data.instance,
  data: parsed.data.data as Record<string, unknown>,
  whatsapp_id: whatsappId,
});

// Se já processamos este evento (deduplicação), ignorar
if (!rawEvent) {
  return { status: 'duplicate', time: Date.now() - start };
}

if (event === 'messages.upsert' || event === 'send.message') {
  setImmediate(() => processMessage(instance, data, fastify, rawEvent.id));
}
```

**Step 4: Atualizar assinatura de processMessage para receber rawEventId**

```typescript
async function processMessage(
  instance: string,
  data: unknown,
  fastify: any,
  rawEventId?: string  // novo parâmetro
) {
  // ... código existente
  const msg = await insertMessage({
    // ... campos existentes
    raw_event_id: rawEventId,  // novo campo
  });
```

**Step 5: Adicionar raw_event_id em InsertMessageInput (types.ts)**

```typescript
export interface InsertMessageInput {
  // ... campos existentes
  raw_event_id?: string;
}
```

**Step 6: Atualizar insertMessage em queries.ts**

Incluir `raw_event_id` na query de INSERT:
```typescript
// Adicionar $N para raw_event_id no INSERT INTO messages
```

**Step 7: Rebuild packages**

```bash
npm run build -w packages/db
npm run build -w apps/api
```

**Step 8: Commit**

```bash
git add packages/db/src/ apps/api/src/routes/webhook.ts
git commit -m "feat: persist raw_events before processing, idempotent dedup by whatsapp_id"
```

---

## Fase 2 — Instance→Seller Map no Banco (Semana 1)

### Task 2.1: Migration instance_seller_map

**Contexto:** O mapeamento instance→seller está hardcoded em `webhook.ts:8-13`. Isso impede gerenciar instâncias pelo dashboard.

**Files:**
- Create: `infra/migrations/010_instance_seller_map.sql`

**Step 1: Criar migration**

```sql
-- infra/migrations/010_instance_seller_map.sql
CREATE TABLE IF NOT EXISTS instance_seller_map (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance    TEXT NOT NULL UNIQUE,
    seller_id   UUID NOT NULL REFERENCES sellers(id),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instance_seller_map_instance
    ON instance_seller_map (instance) WHERE active = TRUE;

-- Seed com dados atuais (substitua os UUIDs pelos reais)
INSERT INTO instance_seller_map (instance, seller_id) VALUES
    ('Multivix',        '80a50431-8f36-477c-9072-f0adcba3696e'),
    ('Multivix-Alunos', '80a50431-8f36-477c-9072-f0adcba3696e'),
    ('Instituto-Vendas','6f875432-5dea-4fcf-972e-b278eb2c1d5b'),
    ('instituto-vendas','6f875432-5dea-4fcf-972e-b278eb2c1d5b')
ON CONFLICT (instance) DO NOTHING;
```

**Step 2: Aplicar**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
```

**Step 3: Commit**

```bash
git add infra/migrations/010_instance_seller_map.sql
git commit -m "feat: add instance_seller_map table, seed with current hardcoded values"
```

---

### Task 2.2: Usar instance_seller_map do banco no webhook

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`
- Modify: `packages/db/src/queries.ts`

**Step 1: Adicionar query getSellerByInstance em queries.ts**

```typescript
export async function getSellerByInstance(instance: string): Promise<Seller | null> {
  const result = await query<Seller>(
    `SELECT s.* FROM sellers s
     JOIN instance_seller_map ism ON ism.seller_id = s.id
     WHERE ism.instance = $1 AND ism.active = TRUE AND s.active = TRUE
     LIMIT 1`,
    [instance]
  );
  return result.rows[0] || null;
}
```

**Step 2: Exportar em index.ts**

```typescript
export { getSellerByInstance } from './queries.js';
```

**Step 3: Substituir hardcoded map em webhook.ts**

Remover:
```typescript
// INSTANCIA → SELLER MAPPING
const INSTANCE_SELLER_MAP: Record<string, string> = {
  'Multivix': '80a50431-...',
  // ...
};
```

Substituir em `processMessage`:
```typescript
// Antes (hardcoded):
const sellerId = INSTANCE_SELLER_MAP[instance];
let seller = sellerId ? await getSellerById(sellerId) : await getDefaultSeller();

// Depois (do banco):
let seller = await getSellerByInstance(instance) || await getDefaultSeller();
```

**Step 4: Build e commit**

```bash
npm run build -w packages/db
npm run build -w apps/api
git add packages/db/src/ apps/api/src/routes/webhook.ts
git commit -m "feat: load instance→seller mapping from database instead of hardcoded map"
```

---

## Fase 3 — Vision OCR Assíncrono (Semana 1-2)

### Task 3.1: Mover Vision para Queue:vision

**Contexto:** Atualmente a análise de comprovante via Kimi Vision é feita **de forma síncrona** dentro do `processMessage` do webhook, podendo causar timeout. Precisa ir para uma fila dedicada.

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`
- Modify: `apps/worker/src/index.ts`

**Step 1: Adicionar Queue:vision em webhook.ts**

Em `apps/api/src/routes/webhook.ts`, adicionar `visionQueue`:

```typescript
let visionQueue: Queue | null = null;

function getQueues() {
  if (!classifyQueue) {
    classifyQueue = new Queue('classify', { connection });
    sttQueue = new Queue('stt', { connection });
    visionQueue = new Queue('vision', { connection });
  }
  return { classifyQueue, sttQueue, visionQueue };
}
```

**Step 2: Substituir bloco síncrono por enfileiramento**

Em `processMessage`, substituir o bloco `if ((type === 'image' || type === 'document') && dir === 'inbound')` **inteiro** por:

```typescript
// Processar imagem/PDF de forma ASSÍNCRONA — nunca bloquear webhook handler
if ((type === 'image' || type === 'document') && dir === 'inbound') {
  const q = getQueues();
  await q.visionQueue!.add('analyze-media', {
    messageId: msg.id,
    conversationId: conv.id,
    sellerId: seller.id,
    instance,
    messageKeyId: key.id,
    messageKeyRemoteJid: key.remoteJid,
    mime: mime || 'image/jpeg',
    type,
  }, {
    jobId: `vision-${msg.id}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });
  fastify.log.info({ msg: 'Vision job queued', messageId: msg.id, conversationId: conv.id });
}
```

**Step 3: Adicionar Vision Worker em worker/index.ts**

Adicionar interface e worker após o `analyzeWorker`:

```typescript
interface VisionJobData {
  messageId: string;
  conversationId: string;
  sellerId: string;
  instance: string;
  messageKeyId: string;
  messageKeyRemoteJid: string;
  mime: string;
  type: 'image' | 'document';
}

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

async function downloadBase64ForVision(
  instance: string,
  keyId: string
): Promise<string | null> {
  if (!EVOLUTION_KEY) return null;
  try {
    const response = await fetch(
      `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instance}`,
      {
        method: 'POST',
        headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: { id: keyId } }, convertToMp4: false }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json() as { base64?: string; message?: { base64?: string } };
    return data.base64 || data.message?.base64 || null;
  } catch {
    return null;
  }
}

async function analyzeComprovanteKimi(
  base64: string,
  mime: string
): Promise<{
  isComprovante: boolean;
  valorReais: number | null;
  tipoTransacao: string | null;
  nomeBanco: string | null;
} | null> {
  const kimiKey = process.env.KIMI_API_KEY;
  if (!kimiKey) return null;
  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${kimiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'moonshot-v1-8k-vision-preview',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analise esta imagem. É um comprovante de pagamento PIX/TED/boleto/transferência?

Se SIM, retorne APENAS JSON:
{"isComprovante":true,"valorReais":99.90,"tipoTransacao":"pix","nomeBanco":"Nubank","dataTransacao":"2026-03-05"}

Se NÃO, retorne:
{"isComprovante":false}`,
            },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 150,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  } catch {
    return null;
  }
}

// Heurísticas pré-OCR para detectar comprovante sem custo
function comprovanteHeuristicScore(
  conversationStage: string,
  type: string,
  mime: string
): number {
  let score = 0;
  if (['proposta', 'negociacao', 'fechamento'].includes(conversationStage)) score += 2;
  if (['image/jpeg', 'image/png', 'application/pdf'].includes(mime)) score += 1;
  if (type === 'document') score += 1; // PDFs são mais prováveis comprovantes
  return score;
}

const visionWorker = new Worker<VisionJobData>(
  'vision',
  async (job: Job<VisionJobData>) => {
    const { messageId, conversationId, instance, messageKeyId, mime, type } = job.data;
    console.log('[Vision] Processing media:', messageId);

    try {
      // 1. Verificar estágio da conversa (heurística pre-OCR)
      const stageResult = await db.query<{ funnel_stage: string }>(
        'SELECT funnel_stage FROM conversations WHERE id = $1',
        [conversationId]
      );
      const stage = stageResult.rows[0]?.funnel_stage || 'lead';
      const heuristicScore = comprovanteHeuristicScore(stage, type, mime);

      console.log('[Vision] Heuristic score:', heuristicScore, 'stage:', stage);

      // Se score < 2, imagem não é provável comprovante — pular OCR (economiza custo)
      if (heuristicScore < 2) {
        console.log('[Vision] Score too low, skipping OCR');
        return { success: true, skipped: true, reason: 'heuristic_score_low' };
      }

      // 2. Baixar base64 da Evolution API
      const base64 = await downloadBase64ForVision(instance, messageKeyId);
      if (!base64) {
        console.log('[Vision] Failed to download media, skipping');
        return { success: true, skipped: true, reason: 'download_failed' };
      }

      // 3. Analisar com Kimi Vision
      const result = await analyzeComprovanteKimi(base64, mime);
      if (!result) {
        console.log('[Vision] Vision API unavailable, falling back to text');
        // Fallback: buscar valor em mensagens de texto recentes
        return { success: true, skipped: true, reason: 'vision_unavailable' };
      }

      if (!result.isComprovante) {
        console.log('[Vision] Not a comprovante');
        return { success: true, isComprovante: false };
      }

      const valueCents = result.valorReais ? Math.round(result.valorReais * 100) : null;
      console.log('[Vision] ✓ Comprovante detected! Value:', result.valorReais);

      // 4. Determinar tipo: nova_venda ou mensalidade
      // (ver regras em docs/plans/2026-03-05-arquitetura-dashboard-comercial.md seção 7)
      const previousSales = await db.query<{ outcome: string; updated_at: Date }>(
        `SELECT outcome, updated_at FROM sales_outcomes
         WHERE conversation_id IN (
           SELECT id FROM conversations WHERE contact_id = (
             SELECT contact_id FROM conversations WHERE id = $1
           ) AND id != $1
         ) AND outcome = 'won'
         ORDER BY updated_at DESC LIMIT 1`,
        [conversationId]
      );
      const hasRecentWin = previousSales.rows.length > 0 &&
        (Date.now() - previousSales.rows[0].updated_at.getTime()) < 35 * 24 * 60 * 60 * 1000;
      const saleType = hasRecentWin ? 'mensalidade' : 'nova_venda';

      // 5. Registrar label na mensagem
      await db.query(
        `INSERT INTO message_labels
           (id, message_id, intent, objection, urgency, sentiment, funnel_stage,
            language, needs_attention, attention_reason)
         VALUES
           (gen_random_uuid(), $1, 'compra', '', 5, 4, 'closed_won', 'pt', false,
            'Comprovante de pagamento detectado por OCR')
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId]
      );

      // 6. Atualizar funil
      await db.query(
        `UPDATE conversations SET funnel_stage = 'closed_won'
         WHERE id = $1 AND funnel_stage NOT IN ('closed_won', 'closed_lost')`,
        [conversationId]
      );

      // 7. Registrar venda com sale_type
      await db.query(
        `INSERT INTO sales_outcomes
           (id, conversation_id, outcome, value_cents, sale_type, evidence_message_ids,
            comprovante_analyzed_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'won', $2, $3, ARRAY[$4::uuid]::uuid[], NOW(), NOW())
         ON CONFLICT (conversation_id) DO UPDATE SET
           outcome = 'won',
           value_cents = COALESCE($2, sales_outcomes.value_cents),
           sale_type = $3,
           evidence_message_ids = ARRAY[$4::uuid]::uuid[],
           comprovante_analyzed_at = NOW(),
           updated_at = NOW()`,
        [conversationId, valueCents, saleType, messageId]
      );

      console.log('[Vision] ✓ Sale recorded:', conversationId, saleType, valueCents);
      return { success: true, isComprovante: true, valueCents, saleType };

    } catch (error) {
      console.error('[Vision] Error:', error);
      throw error;
    }
  },
  {
    connection,
    concurrency: LANE_CONFIG.slow.concurrency,
  }
);
```

**Step 4: Adicionar visionWorker ao array de workers**

```typescript
const workers = [classifyWorker, sttWorker, analyzeWorker, visionWorker, ragWorker, reportWorker];
```

**Step 5: Build e testar**

```bash
npm run build -w apps/api
npm run build -w apps/worker
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/webhook.ts apps/worker/src/index.ts
git commit -m "feat: move vision/OCR to async Queue:vision worker, remove sync blocking from webhook"
```

---

## Fase 4 — Logging Estruturado com Trace ID (Semana 2)

### Task 4.1: Substituir console.log por Pino

**Contexto:** O código usa `console.log` espalhados sem trace_id. Dificulta rastrear um evento de ponta a ponta.

**Files:**
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/api/src/routes/webhook.ts`

**Step 1: Verificar se Pino já está disponível**

```bash
grep '"pino"' apps/worker/package.json apps/api/package.json
```

Se não estiver:
```bash
npm install pino pino-pretty -w apps/worker
npm install pino pino-pretty -w apps/api
```

**Step 2: Criar logger compartilhado em packages/audit/src/logger.ts**

O arquivo já existe. Abra e verifique se exporta uma função `createLogger(name)` com Pino. Se não, adicione:

```typescript
import pino from 'pino';

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export const logger = createLogger('supervisor');
```

**Step 3: No classify worker, substituir console.log**

Padrão a seguir:
```typescript
// Antes
console.log('[Classify] Processing message:', messageId, 'traceId:', traceId);

// Depois
const log = createLogger('classify');
log.info({ messageId, conversationId, traceId }, 'Processing message');
```

> Aplique esse padrão nos workers: classify, stt, analyze, vision, rag, report.
> Não precisa fazer tudo de uma vez — pode ser incremental.

**Step 4: Commit parcial após cada worker convertido**

```bash
git add apps/worker/src/index.ts
git commit -m "refactor: replace console.log with structured pino logging in classify worker"
```

---

## Fase 5 — Migration sales_outcomes (sale_type) (Semana 2)

### Task 5.1: Adicionar colunas sale_type e evidence

**Files:**
- Create: `infra/migrations/011_sales_outcomes_sale_type.sql`

**Step 1: Criar migration**

```sql
-- infra/migrations/011_sales_outcomes_sale_type.sql
-- Distinguir nova_venda de mensalidade/renovação
ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS sale_type TEXT NULL;
    -- 'nova_venda' | 'mensalidade' | 'renovacao' | NULL

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS evidence_message_ids UUID[] NULL;
    -- IDs das mensagens que provam a venda

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS comprovante_url TEXT NULL;
    -- URL do comprovante (se aplicável)

ALTER TABLE sales_outcomes
    ADD COLUMN IF NOT EXISTS comprovante_analyzed_at TIMESTAMPTZ NULL;
    -- Quando o comprovante foi analisado pelo Vision

CREATE INDEX IF NOT EXISTS idx_sales_outcomes_sale_type
    ON sales_outcomes (sale_type, outcome);
```

**Step 2: Aplicar**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
```

**Step 3: Commit**

```bash
git add infra/migrations/011_sales_outcomes_sale_type.sql
git commit -m "feat: add sale_type and evidence columns to sales_outcomes"
```

---

## Fase 6 — Migration sellers (email + meta mensal) (Semana 2)

### Task 6.1: Adicionar coluna email em sellers

**Contexto:** `packages/db/src/migrate.ts:144` tenta inserir `vendedor@example.com` mas a coluna não existe na migration 001.

**Files:**
- Create: `infra/migrations/012_sellers_email.sql`

**Step 1: Criar migration**

```sql
-- infra/migrations/012_sellers_email.sql
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email TEXT NULL;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS monthly_goal_cents INTEGER NOT NULL DEFAULT 5000000;
-- R$ 50.000,00 como meta padrão
```

**Step 2: Corrigir bug em migrate.ts (seed)**

Em `packages/db/src/migrate.ts:144`, a query de seed está errada:
```sql
-- Errado (3 valores, 2 colunas):
INSERT INTO sellers (name, active, monthly_goal_cents)
VALUES ('Vendedor Padrão', 'vendedor@example.com', true)
```

Corrigir para:
```sql
INSERT INTO sellers (name, email, active)
VALUES ('Vendedor Padrão', 'vendedor@example.com', true)
ON CONFLICT DO NOTHING
RETURNING id
```

**Step 3: Aplicar e commit**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
git add infra/migrations/012_sellers_email.sql packages/db/src/migrate.ts
git commit -m "fix: add email column to sellers, fix seed query bug"
```

---

## Fase 7 — Audit Log Persistente no Banco (Semana 2)

### Task 7.1: Migration audit_log

**Contexto:** O `packages/audit` existe e tem `logAudit`, mas não persiste no banco — apenas loga no console.

**Files:**
- Create: `infra/migrations/013_audit_log.sql`
- Modify: `packages/audit/src/index.ts`

**Step 1: Criar migration**

```sql
-- infra/migrations/013_audit_log.sql
-- APPEND-ONLY: nunca deletar registros desta tabela
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id    TEXT NOT NULL,
    job_id      TEXT NOT NULL,
    task        TEXT NOT NULL,       -- 'classify' | 'stt' | 'vision' | 'analyze'
    action      TEXT NOT NULL,
    model       TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    cost_cents  INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    decision    TEXT NOT NULL,       -- 'success' | 'fallback' | 'error' | 'rejected' | 'dlq'
    reason      TEXT NULL,
    input_hash  TEXT NULL,           -- sha256 do input truncado (sem PII)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON audit_log (trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_task     ON audit_log (task, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_decision ON audit_log (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log (created_at DESC);
```

**Step 2: Modificar packages/audit/src/index.ts para persistir no banco**

Abrir o arquivo e adicionar persistência opcional via `DATABASE_URL`:

```typescript
import { Pool } from 'pg';

let auditDb: Pool | null = null;

function getAuditDb(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!auditDb) {
    auditDb = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return auditDb;
}

// Modificar logAudit para também persistir no banco
export async function logAudit(entry: AuditEntry): Promise<void> {
  // Log estruturado (comportamento atual)
  console.log(JSON.stringify({ ...entry, _type: 'audit' }));

  // Persistir no banco (append-only)
  const pool = getAuditDb();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO audit_log
         (trace_id, job_id, task, action, model,
          tokens_in, tokens_out, cost_cents, duration_ms, decision, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.traceId,
        entry.jobId,
        entry.task,
        entry.action,
        entry.model,
        entry.tokens?.input || 0,
        entry.tokens?.output || 0,
        entry.costCents || 0,
        entry.durationMs || 0,
        entry.decision,
        entry.reason || null,
      ]
    );
  } catch (err) {
    // Não propagar erros de auditoria — só logar
    console.error('[Audit] Failed to persist:', err);
  }
}
```

**Step 3: Build e commit**

```bash
node -e "require('./packages/db/dist/migrate.js').migrate()"
npm run build -w packages/audit
git add infra/migrations/013_audit_log.sql packages/audit/src/index.ts
git commit -m "feat: persist audit_log to database (append-only), keep console fallback"
```

---

## Fase 8 — SSE Real-time no Dashboard (Semana 3)

### Task 8.1: Endpoint SSE no API

**Contexto:** O dashboard usa polling. Adicionar SSE (`/events`) para notificar quando dados mudam.

**Files:**
- Create: `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Criar events.ts**

```typescript
// apps/api/src/routes/events.ts
import type { FastifyPluginAsync } from 'fastify';

// Clientes SSE conectados
const clients = new Set<{
  id: string;
  sellerId: string | null;
  reply: any;
}>();

// Emite evento para todos os clientes filtrados por seller
export function emitEvent(event: string, data: unknown, sellerId?: string) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    if (!sellerId || !client.sellerId || client.sellerId === sellerId) {
      try {
        client.reply.raw.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  });
}

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', async (request, reply) => {
    const { sellerId } = request.query as { sellerId?: string };

    // Configurar SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders();

    const clientId = crypto.randomUUID();
    const client = { id: clientId, sellerId: sellerId || null, reply };
    clients.add(client);

    // Ping a cada 30s para manter conexão viva
    const ping = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(ping);
        clients.delete(client);
      }
    }, 30000);

    // Evento inicial
    reply.raw.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);

    request.raw.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
    });

    // Manter request aberto (não retornar)
    await new Promise(() => {});
  });
};

export default eventsRoutes;
```

**Step 2: Registrar em apps/api/src/index.ts**

```typescript
import eventsRoutes from './routes/events.js';
// ...
fastify.register(eventsRoutes);
```

**Step 3: Chamar emitEvent após mudanças importantes**

No `analyze worker` (worker/index.ts), após upsert de `conversation_insights`:
```typescript
// Emitir via HTTP para o API SSE endpoint
// (Em V1, pode ser via Redis pub/sub; por agora HTTP simples)
const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3000';
fetch(`${apiUrl}/internal/emit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: 'conversation_updated',
    sellerId: job.data.sellerId,
    data: { conversationId, qualityScore },
  }),
}).catch(() => {}); // Fire and forget
```

**Step 4: Endpoint interno /internal/emit em api**

Criar endpoint simples para receber eventos do worker:
```typescript
fastify.post('/internal/emit', async (request) => {
  const { event, sellerId, data } = request.body as any;
  emitEvent(event, data, sellerId);
  return { ok: true };
});
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/events.ts apps/api/src/index.ts
git commit -m "feat: add SSE endpoint /events for real-time dashboard updates"
```

---

## Fase 9 — Análise de Insights com LLM (Semana 3-4)

### Task 9.1: Completar Analyze Worker com wins/mistakes

**Contexto:** O analyze worker só calcula `quality_score` determinístico. Precisa gerar `wins`, `mistakes`, `next_best_actions` via LLM.

**Files:**
- Modify: `apps/worker/src/index.ts`

**Step 1: Adicionar prompt e chamada LLM no analyzeWorker**

Após calcular `qualityScore`, adicionar:

```typescript
// Só gera insights via LLM se quality_score mudou significativamente
// ou se nunca foi gerado (evita custo desnecessário)
const existingInsights = await db.query<{ quality_score: number; wins: unknown }>(
  'SELECT quality_score, wins FROM conversation_insights WHERE conversation_id = $1',
  [conversationId]
);
const previousScore = existingInsights.rows[0]?.quality_score;
const hasWins = existingInsights.rows[0]?.wins &&
  Array.isArray(existingInsights.rows[0].wins) &&
  (existingInsights.rows[0].wins as unknown[]).length > 0;

// Só chama LLM se score mudou > 10pts ou não tem insights ainda
if (hasWins && Math.abs((previousScore || 0) - qualityScore) < 10) {
  console.log('[Analyze] Skipping LLM insights (score similar)');
} else {
  // Buscar últimas mensagens da conversa para contexto
  const msgsResult = await db.query<{ direction: string; text: string; timestamp: Date }>(
    `SELECT direction, text, timestamp FROM messages
     WHERE conversation_id = $1 AND text IS NOT NULL
     ORDER BY timestamp ASC LIMIT 50`,
    [conversationId]
  );

  if (msgsResult.rows.length >= 3) {
    const conversation = msgsResult.rows.map(m =>
      `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.text}`
    ).join('\n');

    const llmConfig = {
      url: process.env.LLM_PROVIDER === 'deepseek'
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.us-west-2.modal.direct/v1/chat/completions',
      key: process.env.LLM_PROVIDER === 'deepseek'
        ? process.env.DEEPSEEK_API_KEY
        : process.env.GLM5_API_KEY,
      model: process.env.LLM_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'zai-org/GLM-5-FP8',
    };

    if (llmConfig.key) {
      try {
        const response = await fetch(llmConfig.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${llmConfig.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: llmConfig.model,
            messages: [
              {
                role: 'system',
                content: `Você é um coach de vendas que analisa conversas de WhatsApp.
Analise a conversa e retorne APENAS JSON válido:
{
  "wins": [{"title": "O que o vendedor fez bem", "why": "motivo"}],
  "mistakes": [{"title": "O que poderia melhorar", "why": "motivo", "fix": "como corrigir"}],
  "next_best_actions": [{"action": "próxima ação", "why": "motivo", "suggested_text": "texto sugerido"}],
  "summary": "resumo em 2 linhas"
}
Limite: 3 wins, 3 mistakes, 2 next_best_actions máximo.`,
              },
              { role: 'user', content: `Conversa:\n${conversation.substring(0, 4000)}` },
            ],
            max_tokens: 600,
            temperature: 0.3,
          }),
        });

        if (response.ok) {
          const data = await response.json() as { choices: Array<{ message: { content: string } }> };
          const content = data.choices?.[0]?.message?.content || '{}';
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const insights = JSON.parse(match[0]);
            await db.query(
              `UPDATE conversation_insights
               SET wins = $1, mistakes = $2, next_best_actions = $3, summary = $4, updated_at = NOW()
               WHERE conversation_id = $5`,
              [
                JSON.stringify(insights.wins || []),
                JSON.stringify(insights.mistakes || []),
                JSON.stringify(insights.next_best_actions || []),
                insights.summary || '',
                conversationId,
              ]
            );
            console.log('[Analyze] ✓ LLM insights generated for:', conversationId);
          }
        }
      } catch (err) {
        console.error('[Analyze] LLM insights failed (non-critical):', err);
        // Não falhar o job por erro de insights — já temos quality_score
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: add LLM-generated wins/mistakes/next_best_actions in analyze worker"
```

---

## Fase 10 — Redis Cache para KPIs (Semana 4)

### Task 10.1: Cache de 30s para endpoints pesados

**Contexto:** Endpoints de dashboard fazem queries SQL pesadas a cada request. Adicionar cache Redis com TTL de 30s.

**Files:**
- Modify: `apps/api/src/routes/dashboard.ts`

**Step 1: Adicionar helper de cache no topo de dashboard.ts**

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.connect().catch(console.error);

async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Cache miss ou Redis offline — continuar sem cache
  }
  const result = await fn();
  try {
    await redis.setEx(key, ttlSeconds, JSON.stringify(result));
  } catch {
    // Falha ao salvar cache — não crítico
  }
  return result;
}
```

**Step 2: Envolver endpoints de KPI no cache**

Para o endpoint de KPIs executivos:
```typescript
// Antes:
const kpis = await getExecutiveKpis(startDate, endDate, sellerId);

// Depois:
const cacheKey = `kpis:${sellerId || 'all'}:${startDate.toISOString().slice(0,10)}`;
const kpis = await cachedQuery(cacheKey, 30, () =>
  getExecutiveKpis(startDate, endDate, sellerId)
);
```

> Aplicar o mesmo padrão para: getFunnelStages, getSellerRanking, getLossReasons.

**Step 3: Invalidar cache quando conversa muda**

No `emitEvent` da fase 8, ao emitir `conversation_updated`:
```typescript
// Invalidar caches relevantes
const sellerId = data.sellerId;
redis.del(`kpis:${sellerId}:${today}`).catch(() => {});
redis.del(`kpis:all:${today}`).catch(() => {});
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/dashboard.ts
git commit -m "perf: add Redis cache (30s TTL) for heavy dashboard KPI queries"
```

---

## Fase 11 — RAG Worker Real (Semana 4-5)

### Task 11.1: Implementar embeddings e indexação RAG

**Contexto:** O `rag-index` worker é TODO. Precisa gerar embeddings e inserir em `rag_chunks`.

**Files:**
- Modify: `apps/worker/src/index.ts`
- Modify: `packages/embeddings/src/index.ts`

**Step 1: Verificar e implementar packages/embeddings/src/index.ts**

Abrir e verificar se tem implementação real. Se for stub, implementar:

```typescript
// packages/embeddings/src/index.ts
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.warn('[Embeddings] No API key configured, skipping');
    return null;
  }

  const url = process.env.NVIDIA_API_KEY
    ? 'https://integrate.api.nvidia.com/v1/embeddings'
    : 'https://api.openai.com/v1/embeddings';

  const model = process.env.NVIDIA_API_KEY
    ? 'nvidia/nv-embed-v1'
    : 'text-embedding-3-small';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text.substring(0, 8000) }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}
```

**Step 2: Implementar RAG Worker**

```typescript
// Em worker/index.ts, substituir o ragWorker stub:
const ragWorker = new Worker(
  'rag-index',
  async (job: Job) => {
    const { conversationId } = job.data;
    console.log('[RAG] Indexing conversation:', conversationId);

    // Buscar mensagens da conversa
    const msgs = await db.query<{ id: string; text: string; direction: string }>(
      `SELECT id, text, direction FROM messages
       WHERE conversation_id = $1 AND text IS NOT NULL AND length(text) > 20
       ORDER BY timestamp ASC`,
      [conversationId]
    );

    if (msgs.rows.length === 0) return { success: true, skipped: true };

    // Criar chunks com janela deslizante de 5 mensagens
    const allText = msgs.rows.map(m =>
      `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.text}`
    ).join('\n');

    // Chunk simples: dividir em pedaços de ~500 chars com overlap
    const chunkSize = 500;
    const overlap = 100;
    const chunks: string[] = [];
    for (let i = 0; i < allText.length; i += chunkSize - overlap) {
      const chunk = allText.slice(i, i + chunkSize);
      if (chunk.length > 50) chunks.push(chunk);
    }

    // Gerar embeddings e inserir
    for (const chunkText of chunks) {
      const { generateEmbedding } = await import('@supervisor/embeddings');
      const embedding = await generateEmbedding(chunkText);

      // Upsert — mesmo chunk (hash) não duplica
      await db.query(
        `INSERT INTO rag_chunks (conversation_id, chunk_text, embedding, metadata)
         VALUES ($1, $2, $3::vector, $4)
         ON CONFLICT DO NOTHING`,
        [
          conversationId,
          chunkText,
          embedding ? `[${embedding.join(',')}]` : null,
          JSON.stringify({ conversation_id: conversationId }),
        ]
      );
    }

    console.log('[RAG] ✓ Indexed', chunks.length, 'chunks for:', conversationId);
    return { success: true, chunksIndexed: chunks.length };
  },
  { connection, concurrency: LANE_CONFIG.slow.concurrency }
);
```

**Step 3: Commit**

```bash
npm run build -w packages/embeddings
git add packages/embeddings/src/index.ts apps/worker/src/index.ts
git commit -m "feat: implement RAG indexing worker with sliding window chunks and embeddings"
```

---

## Fase 12 — Golden Dataset e Testes (Semana 5-6)

### Task 12.1: Criar estrutura de testes com fixtures

**Files:**
- Create: `infra/test-fixtures/README.md`
- Create: `infra/test-fixtures/conversations/example.json`
- Create: `scripts/eval-golden.ts`

**Step 1: Criar estrutura de fixtures**

```bash
mkdir -p infra/test-fixtures/conversations
mkdir -p infra/test-fixtures/comprovantes
```

**Step 2: Criar formato de fixture**

`infra/test-fixtures/conversations/conv_001_nova_venda.json`:
```json
{
  "id": "test-conv-001",
  "description": "Lead qualificado que compra curso no WhatsApp",
  "messages": [
    {"direction": "outbound", "text": "Olá! Posso te ajudar com informações sobre o curso?", "timestamp": "2026-01-10T10:00:00Z"},
    {"direction": "inbound", "text": "Oi! Sim, quero saber sobre o pacote básico", "timestamp": "2026-01-10T10:01:00Z"},
    {"direction": "outbound", "text": "O pacote básico é R$ 197 com acesso por 6 meses", "timestamp": "2026-01-10T10:02:00Z"},
    {"direction": "inbound", "text": "Quanto vale? Posso parcelar?", "timestamp": "2026-01-10T10:03:00Z"},
    {"direction": "outbound", "text": "Pode pagar em 3x de R$ 65,67 no cartão ou à vista no PIX por R$ 179", "timestamp": "2026-01-10T10:05:00Z"},
    {"direction": "inbound", "text": "Vou fazer o PIX agora", "timestamp": "2026-01-10T10:10:00Z"}
  ],
  "expected": {
    "final_funnel_stage": "closed_won",
    "outcome": "won",
    "sale_type": "nova_venda",
    "last_intent": "compra",
    "has_objection": true,
    "objection_type": "preco"
  }
}
```

**Step 3: Criar script de avaliação**

`scripts/eval-golden.ts`:
```typescript
#!/usr/bin/env node
/**
 * Golden Dataset Evaluator
 * Roda conversas de teste e mede precision/recall do pipeline de classificação
 *
 * Uso: npx ts-node scripts/eval-golden.ts
 */

import fs from 'fs';
import path from 'path';
import { classifyMessage } from '../packages/llm/src/index.js';

interface Fixture {
  id: string;
  description: string;
  messages: Array<{ direction: string; text: string; timestamp: string }>;
  expected: {
    final_funnel_stage: string;
    outcome: string;
    sale_type?: string;
    last_intent: string;
    has_objection: boolean;
    objection_type?: string;
  };
}

interface EvalResult {
  fixtureId: string;
  passed: boolean;
  expected: Fixture['expected'];
  actual: Partial<Fixture['expected']>;
  errors: string[];
}

async function evalFixture(fixture: Fixture): Promise<EvalResult> {
  const errors: string[] = [];
  const actual: Partial<Fixture['expected']> = {};

  // Classificar última mensagem inbound
  const lastInbound = [...fixture.messages]
    .reverse()
    .find(m => m.direction === 'inbound');

  if (!lastInbound) {
    return { fixtureId: fixture.id, passed: false, expected: fixture.expected, actual, errors: ['No inbound messages'] };
  }

  try {
    const classification = await classifyMessage(lastInbound.text, 'Cliente Teste');
    actual.final_funnel_stage = classification.funnel_stage;
    actual.last_intent = classification.intent;

    if (classification.funnel_stage !== fixture.expected.final_funnel_stage) {
      errors.push(`funnel_stage: expected "${fixture.expected.final_funnel_stage}", got "${classification.funnel_stage}"`);
    }
    if (classification.intent !== fixture.expected.last_intent) {
      errors.push(`intent: expected "${fixture.expected.last_intent}", got "${classification.intent}"`);
    }
  } catch (err) {
    errors.push(`LLM error: ${err}`);
  }

  return {
    fixtureId: fixture.id,
    passed: errors.length === 0,
    expected: fixture.expected,
    actual,
    errors,
  };
}

async function main() {
  const fixturesDir = path.join(__dirname, '../infra/test-fixtures/conversations');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));

  console.log(`\n📊 Running Golden Dataset Evaluation (${files.length} fixtures)\n`);

  let passed = 0;
  let failed = 0;
  const results: EvalResult[] = [];

  for (const file of files) {
    const fixture: Fixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, file), 'utf-8')
    );
    const result = await evalFixture(fixture);
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${fixture.id}: ${fixture.description}`);
      passed++;
    } else {
      console.log(`❌ ${fixture.id}: ${fixture.description}`);
      result.errors.forEach(e => console.log(`   → ${e}`));
      failed++;
    }
  }

  console.log(`\nResults: ${passed}/${files.length} passed (${Math.round(passed/files.length*100)}%)`);

  // Exit 1 se abaixo de 80% de precisão
  if (passed / files.length < 0.8) {
    console.error('\n🚨 Precision below 80% threshold! Fix regressions before merging.');
    process.exit(1);
  }

  console.log('\n✅ All metrics within threshold.');
}

main().catch(console.error);
```

**Step 4: Commit**

```bash
git add infra/test-fixtures/ scripts/eval-golden.ts
git commit -m "test: add golden dataset structure and evaluation script for classification QA"
```

---

## Fase 13 — LGPD: Anonimização e Retenção (Semana 6)

### Task 13.1: Job de anonimização periódica

**Files:**
- Create: `infra/migrations/014_lgpd_retention.sql`
- Modify: `apps/worker/src/index.ts`

**Step 1: Criar migration com função de anonimização**

```sql
-- infra/migrations/014_lgpd_retention.sql
-- Função para anonimizar contatos inativos (LGPD Art. 16)
CREATE OR REPLACE FUNCTION anonymize_inactive_contacts(
    inactive_days INTEGER DEFAULT 730  -- 2 anos = 730 dias
) RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE contacts
    SET
        display_name = 'ANONIMIZADO',
        -- Hash irreversível do telefone para manter integridade referencial
        phone_e164 = 'ANON-' || encode(sha256(phone_e164::bytea), 'hex')
    WHERE
        -- Nunca foi comprador (dados de não-clientes = menos retenção necessária)
        id NOT IN (
            SELECT DISTINCT c.contact_id
            FROM conversations c
            JOIN sales_outcomes so ON so.conversation_id = c.id
            WHERE so.outcome = 'won'
        )
        -- Último contato foi há mais de N dias
        AND id IN (
            SELECT contact_id FROM conversations
            GROUP BY contact_id
            HAVING MAX(last_message_at) < NOW() - (inactive_days || ' days')::INTERVAL
        )
        -- Já não foi anonimizado
        AND phone_e164 NOT LIKE 'ANON-%';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Adicionar cron mensal no worker**

```typescript
// No worker/index.ts, adicionar após o cron diário:
cron.schedule('0 3 1 * *', async () => {
  console.log('[LGPD] Running monthly anonymization...');
  const result = await db.query<{ anonymize_inactive_contacts: number }>(
    'SELECT anonymize_inactive_contacts(730)'
  );
  const count = result.rows[0]?.anonymize_inactive_contacts || 0;
  console.log('[LGPD] Anonymized', count, 'inactive contacts');
}, { timezone: TIMEZONE });

// Limpeza de transcrições de áudio > 1 ano
cron.schedule('0 4 1 * *', async () => {
  const result = await db.query(
    `DELETE FROM audio_transcripts
     WHERE created_at < NOW() - INTERVAL '1 year'
     RETURNING id`
  );
  console.log('[LGPD] Deleted', result.rowCount, 'old audio transcripts');
}, { timezone: TIMEZONE });
```

**Step 3: Commit**

```bash
git add infra/migrations/014_lgpd_retention.sql apps/worker/src/index.ts
git commit -m "feat: add LGPD anonymization function and monthly retention cron job"
```

---

## Fase 14 — OCR de PDF (Semana 5)

### Task 14.1: Criar packages/vision para análise de PDF

**Files:**
- Create: `packages/vision/package.json`
- Create: `packages/vision/src/index.ts`

**Step 1: Criar package.json**

```json
{
  "name": "@supervisor/vision",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/pdf-parse": "^1.1.4"
  }
}
```

**Step 2: Instalar dependências**

```bash
npm install -w packages/vision
```

**Step 3: Criar packages/vision/src/index.ts**

```typescript
import pdf from 'pdf-parse';

interface ComprovanteResult {
  isComprovante: boolean;
  valorReais: number | null;
  tipoTransacao: string | null;
  method: 'text' | 'ocr' | 'none';
}

// Extrair texto de PDF
export async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  const data = await pdf(buffer);
  return data.text || '';
}

// Detectar comprovante em texto extraído de PDF
export function detectComprovanteInText(text: string): ComprovanteResult {
  const lower = text.toLowerCase();

  // Indicadores fortes de comprovante
  const isComprovante = [
    /comprovante/i,
    /pix\s*(enviado|aprovado|conclu[ií]do)/i,
    /transfer[eê]ncia\s*(realizada|conclu[ií]da)/i,
    /pagamento\s*(aprovado|realizado|confirmado)/i,
    /recibo\s*de\s*(pagamento|depósito)/i,
    /boleto\s*(pago|quitado)/i,
  ].some(r => r.test(text));

  if (!isComprovante) {
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'text' };
  }

  // Extrair valor
  const valueMatch = text.match(/R\$\s*([0-9.]+),(\d{2})/) ||
                     text.match(/([0-9.]+),(\d{2})\s*(reais|BRL)/i);
  const valorReais = valueMatch
    ? parseFloat(valueMatch[1].replace('.', '') + '.' + valueMatch[2])
    : null;

  // Detectar tipo
  let tipoTransacao: string | null = null;
  if (/\bpix\b/i.test(text)) tipoTransacao = 'pix';
  else if (/\bted\b/i.test(text)) tipoTransacao = 'ted';
  else if (/\bboleto\b/i.test(text)) tipoTransacao = 'boleto';

  return { isComprovante: true, valorReais, tipoTransacao, method: 'text' };
}

export async function analyzePdf(base64: string): Promise<ComprovanteResult> {
  try {
    const text = await extractPdfText(base64);
    if (text.length > 100) {
      // PDF com texto extraível — usar análise de texto (sem custo)
      return detectComprovanteInText(text);
    }
    // PDF escaneado — precisaria de OCR visual (futuro)
    console.warn('[Vision] PDF is scanned, text extraction failed, skipping');
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'none' };
  } catch (err) {
    console.error('[Vision] PDF parse error:', err);
    return { isComprovante: false, valorReais: null, tipoTransacao: null, method: 'none' };
  }
}
```

**Step 4: Integrar no Vision Worker**

No `visionWorker` (worker/index.ts), adicionar branch para PDF:

```typescript
// No início do vision worker job:
if (mime === 'application/pdf') {
  const { analyzePdf } = await import('@supervisor/vision');
  const pdfResult = await analyzePdf(base64);
  // ... usar pdfResult como result
  result = { isComprovante: pdfResult.isComprovante, valorReais: pdfResult.valorReais || null, ... };
}
```

**Step 5: Commit**

```bash
npm run build -w packages/vision
git add packages/vision/
git commit -m "feat: add PDF OCR via pdf-parse for comprovante detection without API cost"
```

---

## Fase 15 — Métricas de Conversão Corretas (Hotfix)

### Task 15.1: Verificar e corrigir taxa de conversão

**Contexto:** Há 5 commits recentes tentando corrigir o cálculo de taxa de conversão. Verificar o estado atual.

**Files:**
- Read: `apps/api/src/routes/dashboard.ts`

**Step 1: Localizar o cálculo atual**

```bash
grep -n "conversion_rate\|conversionRate\|taxa.*convers" apps/api/src/routes/dashboard.ts
```

**Step 2: Validar fórmula correta**

A fórmula correta para taxa de conversão é:
```
conversion_rate = (conversas com outcome = 'won' no período) / (total de conversas com outcome != 'pending' no período) * 100
```

**NÃO** usar `total de conversas` no denominador — inclui conversas ainda em andamento.

Verificar se o código atual usa essa fórmula. Se não:

```typescript
// Fórmula correta:
const conversionRate = totalClosed > 0
  ? Math.round((wonCount / totalClosed) * 100 * 10) / 10  // 1 casa decimal
  : 0;

// Onde:
// wonCount = COUNT(*) FROM conversations c JOIN sales_outcomes so WHERE outcome = 'won' AND período
// totalClosed = COUNT(*) FROM conversations c JOIN sales_outcomes so WHERE outcome IN ('won', 'lost') AND período
```

**Step 3: Se já está correto, apenas adicionar comentário explicando a fórmula**

```typescript
// Taxa de conversão = vendas ganhas / (vendas ganhas + perdas) * 100
// Exclui conversas ainda em andamento (sem outcome ou outcome = 'pending')
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/dashboard.ts
git commit -m "fix: document and verify conversion rate formula (won / (won+lost) * 100)"
```

---

## Checklist Final (antes de considerar MVP completo)

```
□ Migration 009 habilitada (deduplication)
□ raw_events table criada e sendo populada
□ Vision OCR movido para Queue:vision (assíncrono)
□ API key sem fallback hardcoded
□ instance_seller_map no banco
□ sale_type em sales_outcomes
□ colunas faltantes em conversation_insights
□ email em sellers (bug de seed corrigido)
□ audit_log persistindo no banco
□ Todos os builds passando sem erros TypeScript
□ Sistema recebe webhook sem duplicar mensagens (testar com mesmo payload 2x)
□ Sistema processa imagem e não bloqueia webhook (testar com imagem grande)
```

---

**Plano salvo em:** `docs/plans/2026-03-05-implementacao-dashboard-comercial.md`

**Duas opções de execução:**

**1. Subagent-Driven (esta sessão)** — Despacho um subagente fresco por tarefa, revisão entre tarefas, iteração rápida

**2. Sessão Paralela (separada)** — Abrir nova sessão com `executing-plans`, execução em batch com checkpoints

**Qual prefere?**
