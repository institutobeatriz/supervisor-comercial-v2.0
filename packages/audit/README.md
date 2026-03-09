# @supervisor/audit

Sistema de auditoria JSONL para rastreabilidade de todas as decisões da IA no Supervisor Comercial.

## Objetivo

Fornecer rastreabilidade completa de todas as decisões tomadas pela IA, permitindo:
- Debug de falsos positivos/negativos
- Análise de custos por conversa/tarefa
- Auditoria de decisões críticas (won/lost)
- Compliance e governança

## Características

- **Logs estruturados em JSONL**: Cada linha é um JSON completo
- **Roteação diária automática**: Arquivos separados por data
- **Baixo overhead**: Escrita assíncrona, não bloqueante
- **Truncamento automático**: Textos muito longos são truncados
- **Correlação por traceId**: Rastreie todas as decisões de uma conversa

## Instalação

Como parte do workspace do Supervisor Comercial, o pacote já está incluído.

```bash
# No workspace raiz
npm install
```

## Uso Básico

```typescript
import { createAuditEntry, logAudit } from '@supervisor/audit';

// Criar entrada de auditoria
const auditEntry = createAuditEntry({
  traceId: 'conv-12345',
  jobId: 'job-67890',
  task: 'classify',
  action: 'intent_classification',
  input: {
    text: 'Paguei o pacote via PIX',
    context: { userId: 'user-001' }
  },
  output: {
    result: 'purchase_confirmation',
    confidence: 0.95
  },
  model: 'glm-5',
  tokens: { input: 150, output: 50, total: 200 },
  costCents: 2,
  durationMs: 1250,
  decision: 'success'
});

// Registrar no arquivo JSONL
await logAudit(auditEntry);
```

## Estrutura da Entrada de Auditoria

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `timestamp` | string | ISO 8601 da decisão |
| `traceId` | string | ID para correlacionar jobs da mesma conversa |
| `jobId` | string | ID do job BullMQ |
| `task` | enum | `classify`, `analyze`, `rag`, `report` |
| `action` | string | Ação específica executada |
| `input` | object | Input da tarefa (texto e contexto) |
| `output` | object | Output da tarefa (resultado e confiança) |
| `model` | string | Modelo de IA utilizado |
| `tokens` | object | Contagem de tokens {input, output, total} |
| `costCents` | number | Custo em centavos (R$ * 100) |
| `durationMs` | number | Tempo de execução em ms |
| `decision` | enum | `success`, `fallback`, `error`, `rejected` |
| `reason` | string | Motivo para fallback/error (opcional) |

## Localização dos Arquivos

Os logs são armazenados em `logs/audit-YYYY-MM-DD.jsonl` na raiz do projeto.

Exemplo de estrutura:
```
logs/
├── audit-2026-02-25.jsonl
├── audit-2026-02-26.jsonl
└── audit-2026-02-27.jsonl
```

## Exemplo de Linha JSONL

```json
{
  "timestamp": "2026-02-26T10:30:45.123Z",
  "traceId": "conv-12345",
  "jobId": "job-67890",
  "task": "classify",
  "action": "intent_classification",
  "input": {
    "text": "Paguei o pacote de 500 reais via PIX",
    "context": { "userId": "user-001", "platform": "whatsapp" }
  },
  "output": {
    "result": "purchase_confirmation",
    "confidence": 0.95
  },
  "model": "glm-5",
  "tokens": { "input": 150, "output": 50, "total": 200 },
  "costCents": 2,
  "durationMs": 1250,
  "decision": "success"
}
```

## Funções Disponíveis

### `createAuditEntry(partialEntry: Partial<AuditEntry>): AuditEntry`
Cria uma entrada de auditoria completa com valores padrão para campos opcionais.

### `logAudit(entry: AuditEntry): Promise<void>`
Registra a entrada no arquivo JSONL com rotação diária.

### `truncateText(text: string, maxLength = 1000): string`
Trunca texto muito longo para evitar arquivos enormes.

## Integração com Workers

Para integrar com workers BullMQ:

```typescript
import { createAuditEntry, logAudit } from '@supervisor/audit';

async function processJob(job: Job) {
  const startTime = Date.now();
  
  try {
    // Processamento da tarefa...
    const result = await processTask(job.data);
    
    // Registrar sucesso
    await logAudit(createAuditEntry({
      traceId: job.data.conversationId,
      jobId: job.id,
      task: 'classify',
      action: job.name,
      input: { text: job.data.text, context: job.data },
      output: { result: result.intent, confidence: result.confidence },
      model: result.modelUsed,
      tokens: result.tokenUsage,
      costCents: calculateCost(result.tokenUsage),
      durationMs: Date.now() - startTime,
      decision: 'success'
    }));
    
    return result;
  } catch (error) {
    // Registrar erro
    await logAudit(createAuditEntry({
      traceId: job.data.conversationId,
      jobId: job.id,
      task: 'classify',
      action: job.name,
      input: { text: job.data.text, context: job.data },
      output: { result: 'error' },
      model: 'unknown',
      tokens: { input: 0, output: 0, total: 0 },
      costCents: 0,
      durationMs: Date.now() - startTime,
      decision: 'error',
      reason: error.message
    }));
    
    throw error;
  }
}
```

## Análise dos Logs

Para analisar os logs, você pode usar ferramentas como `jq`:

```bash
# Contar decisões por tipo
jq -s 'group_by(.decision) | map({decision: .[0].decision, count: length})' logs/audit-2026-02-26.jsonl

# Calcular custo total do dia
jq -s 'map(.costCents) | add' logs/audit-2026-02-26.jsonl

# Encontrar todas as decisões de uma conversa específica
jq 'select(.traceId == "conv-12345")' logs/audit-2026-02-26.jsonl
```

## Próximos Passos

1. **Integração com workers**: Modificar workers existentes para usar auditoria
2. **Dashboard de auditoria**: Visualização dos logs no dashboard
3. **Alertas automáticos**: Alertas para padrões suspeitos
4. **Retenção configurável**: Políticas de retenção de logs

## Licença

Parte do projeto Supervisor Comercial.
