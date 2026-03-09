# Plano de Implementação - Supervisor Comercial v2.0

> Transformar o supervisor de ferramenta reativa em sistema deliberativo com rastreabilidade.

---

## Situação Atual

| Componente | Status | Observação |
|------------|--------|------------|
| Worker BullMQ | ✅ OK | Classificação, STT, RAG |
| Dashboard | ✅ OK | KPIs, funil, alertas |
| Memória PostgreSQL | ✅ OK | Conversas, mensagens, labels |
| RAG pgvector | ✅ OK | Bíblia de Vendas |
| Router LLM | ✅ OK | GLM-5 → fallbacks |
| **Ralph Loop** | ❌ Ausente | Sistema reativo, não deliberativo |
| **JSONL Auditoria** | ❌ Ausente | Sem rastreabilidade |
| **Lanes explícitas** | ❌ Ausente | Concorrência não segregada |
| **Sandbox/Limites** | ❌ Ausente | Sem governança de custo |

---

## Fase 1: Base de Auditoria e Rastreabilidade (1-2 dias)

**Objetivo:** Tornar todas as decisões da IA rastreáveis.

### 1.1 JSONL Logger

```typescript
// packages/audit/src/logger.ts
interface AuditEntry {
  timestamp: string;        // ISO 8601
  traceId: string;          // Correlação entre jobs
  jobId: string;            // ID do job BullMQ
  task: 'classify' | 'analyze' | 'rag' | 'report';
  action: string;           // Ação executada
  input: {                  // Input (truncado se grande)
    text?: string;
    context?: object;
  };
  output: {                 // Output
    result: string;
    confidence?: number;
  };
  model: string;            // Modelo usado
  tokens: {                 // Contagem
    input: number;
    output: number;
    total: number;
  };
  costCents: number;        // Custo em centavos
  durationMs: number;       // Tempo de execução
  decision: 'success' | 'fallback' | 'error' | 'rejected';
  reason?: string;          // Motivo se fallback/error
}
```

**Entregáveis:**
- [x] `packages/audit/src/logger.ts` ✅
- [x] `logs/audit-YYYY-MM-DD.jsonl` (rotação diária) ✅
- [x] Integrar no worker de classificação ✅

### 1.2 Trace ID por conversa

```typescript
// Cada conversa gera um traceId único
// Todos os jobs daquela conversa compartilham o traceId
// Permite rastrear: "quais decisões levaram a essa venda?"
```

**Status:** ✅ CONCLUÍDO (2026-02-26)

---

## Fase 2: Ralph Loop - Sistema Deliberativo (2-3 dias)

**Objetivo:** Planejar antes de executar, com gap analysis.

**Status:** ✅ CONCLUÍDO (2026-02-26)

### 2.1 Estrutura do Loop

```typescript
// packages/planner/src/ralph-loop.ts

interface PlanStep {
  id: string;
  action: 'classify' | 'extract_value' | 'check_objection' | 'update_stage';
  input: object;
  expectedOutput: object;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: object;
}

interface Gap {
  type: 'missing_info' | 'low_confidence' | 'contradiction' | 'rule_violation';
  description: string;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
}

interface RalphState {
  traceId: string;
  conversationId: string;
  iteration: number;
  maxIterations: number;
  plan: PlanStep[];
  executedSteps: string[];
  gaps: Gap[];
  finalDecision: 'won' | 'lost' | 'in_progress' | 'needs_human';
  confidence: number;
  auditLog: AuditEntry[];
}
```

### 2.2 Fluxo do Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    RALPH LOOP                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ 1. PLAN  │───►│2. EXECUTE│───►│3. OBSERVE│              │
│  └──────────┘    └──────────┘    └────┬─────┘              │
│       ▲                               │                     │
│       │                         ┌─────▼─────┐              │
│       │                         │4. GAP     │              │
│       │                         │  ANALYSIS │              │
│       │                         └─────┬─────┘              │
│       │                               │                     │
│       │         ┌─────────────────────┼────────────────┐    │
│       │         │                     │                │    │
│       │    gaps > 0?             gaps == 0?           iter > max? │
│       │         │                     │                │    │
│       └─────────┘                     ▼                ▼    │
│                               ┌──────────┐      ┌──────────┐│
│                               │  DONE    │      │ ESCALATE ││
│                               │ decision │      │  human   ││
│                               └──────────┘      └──────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Entregáveis:**
- [x] `packages/planner/src/ralph-loop.ts` ✅
- [x] `packages/planner/src/gap-analyzer.ts` ✅
- [x] `packages/planner/src/types.ts` ✅
- [x] Integrar no worker de classificação ✅
- [x] Testado com mensagem de exemplo ✅

---

## Fase 3: Lanes Explícitas (1 dia)

**Objetivo:** Segregar processamento por criticidade.

**Status:** ✅ CONCLUÍDO (2026-02-26)

### 3.1 Definição das Lanes

| Lane | Concorrência | Timeout | Jobs |
|------|--------------|---------|------|
| **fast** | 10 | 10s | Classificação simples, intent básico |
| **slow** | 3 | 60s | Análise profunda, RAG, embeddings |
| **critical** | 1 | 120s | Won/Lost final, relatórios |
| **stt** | 2 | 30s | Transcrição de áudio |

### 3.2 Implementação

```typescript
// apps/worker/src/index.ts

const LANE_CONFIG = {
  fast: { concurrency: 10, timeout: 10000 },
  slow: { concurrency: 3, timeout: 60000 },
  critical: { concurrency: 1, timeout: 120000 },
  stt: { concurrency: 2, timeout: 30000 },
};
```

**Entregáveis:**
- [x] Lanes configuradas no worker ✅
- [x] Rate limiting por lane ✅
- [x] Log de lanes no startup ✅

---

## Fase 4: Sandbox e Limites (1 dia)

**Objetivo:** Governança de custo e contenção de risco.

### 4.1 Limites por Tarefa

```typescript
// packages/governance/src/limits.ts

interface TaskLimits {
  maxTokensPerTask: number;
  maxTokensPerDay: number;
  maxCostCentsPerTask: number;
  maxCostCentsPerDay: number;
  maxRetries: number;
  fallbackModel?: string;
  escalateOnLimit: boolean;
}

export const LIMITS: Record<string, TaskLimits> = {
  classify: {
    maxTokensPerTask: 500,
    maxTokensPerDay: 500000,
    maxCostCentsPerTask: 1,
    maxCostCentsPerDay: 100,
    maxRetries: 2,
    fallbackModel: 'kimi',
    escalateOnLimit: false,
  },
  
  analyze: {
    maxTokensPerTask: 2000,
    maxTokensPerDay: 100000,
    maxCostCentsPerTask: 5,
    maxCostCentsPerDay: 50,
    maxRetries: 1,
    fallbackModel: 'deepseek',
    escalateOnLimit: false,
  },
  
  report: {
    maxTokensPerTask: 5000,
    maxTokensPerDay: 50000,
    maxCostCentsPerTask: 20,
    maxCostCentsPerDay: 100,
    maxRetries: 1,
    fallbackModel: 'deepseek',
    escalateOnLimit: true, // Se estourar, escalar para humano
  },
  
  won_lost: {
    maxTokensPerTask: 1000,
    maxTokensPerDay: 50000,
    maxCostCentsPerTask: 10,
    maxCostCentsPerDay: 50,
    maxRetries: 3,
    fallbackModel: 'opus', // Won/Lost usa melhor modelo
    escalateOnLimit: true,
  },
};
```

### 4.2 Middleware de Governança

```typescript
// packages/governance/src/middleware.ts

async function enforceLimits(task: string, tokens: number, cost: number): Promise<boolean> {
  const limits = LIMITS[task];
  const usage = await getTodayUsage(task);
  
  // Check daily limits
  if (usage.tokens + tokens > limits.maxTokensPerDay) {
    await logAudit({
      decision: 'rejected',
      reason: `Daily token limit exceeded: ${usage.tokens}/${limits.maxTokensPerDay}`,
    });
    return false;
  }
  
  if (usage.costCents + cost > limits.maxCostCentsPerDay) {
    await logAudit({
      decision: 'rejected',
      reason: `Daily cost limit exceeded: ${usage.costCents}/${limits.maxCostCentsPerDay}`,
    });
    return false;
  }
  
  return true;
}
```

### 4.3 Alertas

```typescript
// packages/governance/src/alerts.ts

interface Alert {
  type: 'limit_warning' | 'limit_exceeded' | 'cost_spike' | 'error_rate_high';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  context: object;
}

async function checkAndAlert(): Promise<void> {
  const usage = await getTodayUsage();
  
  // Warning at 80%
  if (usage.costCents > LIMITS.daily.maxCostCentsPerDay * 0.8) {
    await sendAlert({
      type: 'limit_warning',
      severity: 'warning',
      message: `Cost at ${usage.costCents}/${LIMITS.daily.maxCostCentsPerDay} cents`,
      context: { usage },
    });
  }
}
```

**Entregáveis:**
- [ ] `packages/governance/src/limits.ts`
- [ ] `packages/governance/src/middleware.ts`
- [ ] `packages/governance/src/alerts.ts`
- [ ] Integrar no worker
- [ ] Painel de uso no dashboard

---

## Fase 5: Middleware Determinístico (1-2 dias)

**Objetivo:** Regras explícitas para ações críticas, LLM só decide semântica.

### 5.1 Separação de Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                    DECISÃO DE VENDA                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LLM (Semântica)          Middleware (Execução)             │
│  ───────────────          ──────────────────                │
│  - Classificar intenção   - Validar regras                  │
│  - Detectar sentimento    - Aplicar limites                 │
│  - Extrair valor          - Confirmar com humano            │
│  - Sugerir estágio        - Log obrigatório                 │
│                                                             │
│  Output: sugestão          Output: decisão final            │
│  Confidence: 0-100%        Motivo: documentado              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Regras Determinísticas

```typescript
// packages/governance/src/rules.ts

interface Rule {
  id: string;
  name: string;
  condition: (input: ClassificationInput) => boolean;
  action: 'accept' | 'reject' | 'escalate';
  reason: string;
}

export const WON_RULES: Rule[] = [
  {
    id: 'payment_confirmation_required',
    name: 'Confirmação de pagamento obrigatória',
    condition: (input) => !hasPaymentConfirmation(input.text),
    action: 'reject',
    reason: 'Mensagem não contém confirmação de pagamento explícita',
  },
  {
    id: 'minimum_message_length',
    name: 'Tamanho mínimo de mensagem',
    condition: (input) => input.text.length < 10,
    action: 'reject',
    reason: 'Mensagem muito curta para ser venda',
  },
  {
    id: 'high_value_needs_confirmation',
    name: 'Valores altos precisam confirmação',
    condition: (input) => (input.suggestedValue || 0) > 100000, // R$ 1000+
    action: 'escalate',
    reason: 'Venda de alto valor requer confirmação humana',
  },
  {
    id: 'low_confidence_escalate',
    name: 'Baixa confiança requer análise',
    condition: (input) => input.confidence < 0.7,
    action: 'escalate',
    reason: 'Classificação com baixa confiança',
  },
];
```

### 5.3 Fluxo de Decisão

```typescript
// packages/governance/src/decision.ts

async function decideOutcome(
  input: ClassificationInput,
  llmSuggestion: LLMResult
): Promise<FinalDecision> {
  // 1. Aplicar regras determinísticas
  for (const rule of WON_RULES) {
    if (rule.condition(input)) {
      if (rule.action === 'reject') {
        return {
          outcome: 'rejected',
          reason: rule.reason,
          rule: rule.id,
          humanReview: false,
        };
      }
      
      if (rule.action === 'escalate') {
        await createHumanReviewTask(input, llmSuggestion, rule);
        return {
          outcome: 'pending',
          reason: rule.reason,
          rule: rule.id,
          humanReview: true,
        };
      }
    }
  }
  
  // 2. Se passou todas as regras, aceitar sugestão da LLM
  return {
    outcome: llmSuggestion.stage,
    reason: 'Approved by deterministic rules',
    rule: null,
    humanReview: false,
    confidence: llmSuggestion.confidence,
  };
}
```

**Entregáveis:**
- [ ] `packages/governance/src/rules.ts`
- [ ] `packages/governance/src/decision.ts`
- [ ] Endpoint para revisão humana
- [ ] Tabela `human_reviews` no banco
- [ ] UI de revisão no dashboard

---

## Estrutura Final de Pacotes

```
supervisor-comercial/
├── apps/
│   ├── api/
│   ├── worker/
│   │   ├── src/
│   │   │   ├── lanes.ts         # NOVO
│   │   │   └── index.ts
│   │   └── ...
│   └── dashboard/
├── packages/
│   ├── db/
│   ├── llm/
│   ├── stt/
│   ├── embeddings/
│   ├── rag/
│   ├── evolution/
│   ├── audit/                   # NOVO - Fase 1
│   │   ├── src/
│   │   │   ├── logger.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── planner/                 # NOVO - Fase 2
│   │   ├── src/
│   │   │   ├── ralph-loop.ts
│   │   │   ├── gap-analyzer.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── governance/              # NOVO - Fase 4+5
│       ├── src/
│       │   ├── limits.ts
│       │   ├── middleware.ts
│       │   ├── alerts.ts
│       │   ├── rules.ts
│       │   ├── decision.ts
│       │   └── index.ts
│       └── package.json
├── logs/
│   ├── audit.jsonl              # NOVO
│   └── governance.jsonl         # NOVO
└── IMPLEMENTATION_PLAN.md       # Este arquivo
```

---

## Timeline

| Fase | Duração | Prioridade | Entregável Principal |
|------|---------|------------|---------------------|
| **Fase 1** | 1-2 dias | 🔴 Alta | JSONL Auditoria |
| **Fase 2** | 2-3 dias | 🔴 Alta | Ralph Loop |
| **Fase 3** | 1 dia | 🟡 Média | Lanes explícitas |
| **Fase 4** | 1 dia | 🟡 Média | Sandbox/Limites |
| **Fase 5** | 1-2 dias | 🔴 Alta | Middleware determinístico |

**Total: 6-9 dias** (pode ser paralelizado com agentes)

---

## Métricas de Sucesso

| Métrica | Atual | Meta v2.0 |
|---------|-------|-----------|
| **Rastreabilidade** | 0% | 100% (todas as decisões logadas) |
| **Falsos positivos (won)** | ~30% | < 5% |
| **Custo diário previsível** | ❌ | ✅ Limites configurados |
| **Tempo de debug** | Alto (sem logs) | Baixo (audit trail) |
| **Revisão humana** | Manual | Automática para casos críticos |

---

## Próximos Passos

1. **Imediato:** Implementar Fase 1 (JSONL Auditoria)
2. **Curto prazo:** Implementar Fase 2 (Ralph Loop)
3. **Médio prazo:** Implementar Fases 3-5 em paralelo
4. **Documentação:** Atualizar README e criar docs de arquitetura

---

*Documento criado em 2026-02-26*
*Versão: 1.0.0*
