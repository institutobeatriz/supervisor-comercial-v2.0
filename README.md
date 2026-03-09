# Supervisor Comercial WhatsApp

Sistema de monitoramento shadow de conversas WhatsApp com IA para análise comercial e RAG (Bíblia de Vendas).

> **Shadow Monitoring:** O sistema NÃO envia mensagens. Apenas observa, analisa e gera insights.

## Arquitetura

```
Evolution API → POST /webhooks/evolution → Postgres → BullMQ → Worker
                                              ↓
                 STT (Groq) → Classify → Analyze → RAG Index → Reports
```

## Stack

| Componente | Tecnologia |
|------------|------------|
| API | Fastify + TypeScript |
| Worker | BullMQ + Redis |
| DB | PostgreSQL 16 + pgvector |
| STT | Groq (whisper-large-v3-turbo) |
| LLM Chat | GLM-5 → Kimi → DeepSeek → Opus/GPT |
| Embeddings | OpenAI-compatible provider |
| RAG | pgvector (similaridade cosseno) |

---

## Quick Start

### Pré-requisitos

- Node.js 20+
- Docker & Docker Compose
- Conta no Groq (para STT)
- Conta em pelo menos um provider LLM (GLM-5, Kimi, ou DeepSeek)

### Modo A: Tudo em Docker

```bash
# 1. Clonar
git clone <repo>
cd supervisor-comercial

# 2. Configurar
cp .env.example .env
# Editar .env com suas chaves

# 3. Subir tudo
docker compose --profile all-in-docker up -d --build

# 4. Ver logs
docker compose logs -f
```

### Modo B: Infra em Docker, API/Worker Local

```bash
# 1. Subir PostgreSQL + Redis
docker compose --profile infra-only up -d

# 2. Configurar .env (manter localhost)
cp .env.example .env
# Editar DATABASE_URL e REDIS_URL se necessário

# 3. Instalar dependências
npm install

# 4. Build
npm run build

# 5. Rodar API + Worker local (comando oficial)
npm run local:up
```

---

## Variáveis de Ambiente

Ver `.env.example` para referência completa.

### Obrigatórias

```env
# Database
DATABASE_URL=postgresql://app:app@localhost:5432/sales_supervisor
REDIS_URL=redis://localhost:6379

# Evolution API
EVOLUTION_URL=http://localhost:8080
# Alias legado (compatibilidade)
EVOLUTION_API_URL=
EVOLUTION_API_KEY=sua-chave

# STT (Groq - APENAS para transcrição)
GROQ_STT_API_KEY=sua-chave-groq

# LLM (pelo menos um)
GLM5_API_KEY=sua-chave

# Embeddings (RAG)
EMBEDDING_API_KEY=sua-chave-openai
```

---

## Webhook Evolution API

### Configurar Webhook

**Se Evolution roda no mesmo PC:**
```bash
curl -X POST "http://localhost:8080/webhook/set/SUA-INSTANCIA" \
  -H "apikey: SUA-API-KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:3000/webhooks/evolution"}'
```

**Se Evolution roda em container:**
```bash
# Opção 1: host.docker.internal
-d '{"url": "http://host.docker.internal:3000/webhooks/evolution"}'

# Opção 2: IP do host
-d '{"url": "http://172.x.x.x:3000/webhooks/evolution"}'
```

### Testar Webhook

```bash
curl -X POST http://localhost:3000/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "test",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "test-msg-123"
      },
      "message": {
        "conversation": "Olá, quero saber sobre o produto"
      },
      "messageTimestamp": 1700000000,
      "pushName": "João"
    }
  }'
```

Resposta esperada: `{"status":"queued","processingTime":X}`

---

## Providers

### STT - Groq (APENAS)

```env
GROQ_STT_BASE_URL=https://api.groq.com/openai/v1
GROQ_STT_API_KEY=sua-chave
GROQ_STT_MODEL=whisper-large-v3-turbo
```

> ⚠️ **PROIBIDO** usar Groq para chat/completions.

### Chat LLM - NUNCA Groq, NUNCA Ollama

```env
# Primário
PRIMARY_CHAT_PROVIDER=glm5
GLM5_BASE_URL=https://api.modal.com/v1
GLM5_API_KEY=sua-chave
GLM5_MODEL_CHEAP=zai-org/GLM-5-FP8
GLM5_MODEL_SMART=zai-org/GLM-5-FP8

# Fallbacks
FALLBACK_CHAT_PROVIDERS=kimi,deepseek

# Premium (uso controlado)
PREMIUM_CHAT_PROVIDER=opus
PREMIUM_MODE=auto
```

**Quando Premium é usado:**
- Relatórios diários/semanais
- Conversas won/lost
- JSON inválido persistente

### Embeddings - Provider SEPARADO

```env
RAG_VECTOR=true
EMBEDDING_PROVIDER_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sua-chave
EMBEDDING_MODEL=text-embedding-3-small
```

> ⚠️ **NUNCA** usar Groq para embeddings.

---

## Testando STT

```bash
# Com arquivo .ogg
curl -X POST https://api.groq.com/openai/v1/audio/transcriptions \
  -H "Authorization: Bearer SUA-KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file="@audio.ogg" \
  -F model="whisper-large-v3-turbo"
```

---

## Admin UI

Acesse: `http://localhost:3000/admin/ui`

Header: `x-admin-key: SUA-ADMIN-KEY`

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |
| GET | `/admin/conversations` | Lista conversas |
| GET | `/admin/conversations/:id` | Detalhe da conversa |
| POST | `/admin/outcomes` | Define won/lost |
| GET | `/admin/reports/daily` | Relatório diário |
| GET | `/admin/reports/weekly` | Relatório semanal |
| GET | `/admin/ui` | Interface HTML |

---

## Jobs (BullMQ)

| Job | Descrição |
|-----|-----------|
| `stt` | Transcrição de áudio (Groq) |
| `classify` | Classificação de intenção/sentimento |
| `analyze` | Análise de conversa |
| `rag-index` | Indexação na Bíblia de Vendas |
| `daily` | Relatório diário (23:55) |
| `weekly` | Relatório semanal (domingo 23:58) |

---

## Estrutura

```
supervisor-comercial/
├── apps/
│   ├── api/                 # Fastify API
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── webhook.ts
│   │       │   ├── admin.ts
│   │       │   └── health.ts
│   │       └── index.ts
│   └── worker/              # BullMQ Worker
│       └── src/
│           ├── jobs/
│           │   ├── stt.ts
│           │   ├── classify.ts
│           │   ├── analyze.ts
│           │   ├── rag-index.ts
│           │   └── report.ts
│           └── index.ts
├── packages/
│   ├── db/                  # Database layer
│   ├── stt/                 # STT (Groq)
│   ├── llm/                 # LLM providers + router
│   └── embeddings/          # Embeddings
├── infra/
│   ├── migrations/          # SQL migrations
│   └── docker/              # Dockerfiles
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Comandos

```bash
# Desenvolvimento
npm run local:up         # API + Worker local (oficial)
npm run dev              # API + Worker (modo atual do workspace)
npm run dev:api          # Só API
npm run dev:worker       # Só Worker

# Banco de dados
npm run db:migrate       # Aplicar migrações
npm run db:reset         # Resetar banco

# Docker
docker compose --profile all-in-docker up -d
docker compose --profile infra-only up -d
docker compose down -v

# Testes
npm test
npm run lint
npm run test:ci:api-smoke
npm run test:phase10      # Probe/SLO monitor
npm run test:phase11      # Chaos drills (incident response)
npm run test:phase12      # Drill de confiabilidade (MTTD/MTTR)
npm run test:phase13      # Drill de automacao (dashboard + postmortem)
npm run test:phase14      # Drill de integracao paging/ITSM
npm run test:phase15      # Drill executivo on-call/SLA
npm run test:phase16      # Drill de governanca enterprise
npm run test:phase17      # Drill de governanca full-cycle
npm run test:phase18      # Drill de execucao ativa full-cycle
npm run test:phase19      # Drill do loop de convergencia full-cycle
npm run test:phase20      # Drill de adapters/contratos/telemetria de conectores
npm run test:phase21      # Drill de runtime SLO/alerta por conector
npm run test:phase22      # Drill de readiness/homologacao sandbox+prod dos conectores
npm run test:phase23      # Drill de consolidacao produtiva (segregacao env + postmortem executivo)
npm run test:phase24      # Drill do observability layer industrial (store central + UI + correlacao executiva)
npm run test:phase25      # Drill de productizacao (endpoint interno + RBAC + retention/archive)
npm run test:phase26      # Drill de governanca da API interna (contrato + RBAC + auth + SLA de latencia)
npm run test:phase27      # Drill de observabilidade realtime (stream de eventos + politicas executivas)
npm run test:phase28      # Drill de alerting realtime (fanout multicanal + historico SLA + dedupe)
npm run test:phase29      # Drill do painel operacional interativo (SSE + API SLA + filtros)
npm run test:phase30      # Drill do backend dedicado de incidents/alerts (consolidacao + roteamento por equipe)
npm run test:phase31      # Drill do painel backend-first (incidents/alerts + SSE + SLA + filtros por equipe)
npm run test:phase32      # Drill do backend com owner dinamico on-call + analytics historico
npm run test:phase33      # Validacao live da API interna + painel headless + analytics executivo
npm run test:phase34      # Governanca live recorrente (CI-friendly) com contrato estruturado + browser/headless
npm run test:phase35      # Convergencia da trilha legada de observability a partir do backend-first (summary/feed/history/dashboard)
npm run monitor:check     # Mesmo comando (uso operacional)
npm run monitor:chaos     # Alias operacional dos chaos drills
npm run monitor:reliability # Sumário de confiabilidade operacional
npm run monitor:dashboard # Dashboard markdown de confiabilidade
npm run monitor:postmortem # Templates de postmortem por incidente
npm run monitor:itsm      # Sync incidente -> paging/ticketing (idempotente)
npm run monitor:oncall    # Dashboard executivo + KPI SLA + trilha auditável
npm run monitor:governance # Owner dinâmico + reconciliação ITSM + enforcement SLO
npm run monitor:fullcycle # Lifecycle bidirecional + calendário + analytics histórico
npm run monitor:fullcycle:execute # Execucao ativa das acoes de remediacao full-cycle
npm run monitor:fullcycle:loop # Loop fechado de convergencia (planejar->executar->replanejar)
npm run monitor:fullcycle:connectors # SLO/runtime de conectores + incidente/alerta por integracao
npm run monitor:fullcycle:readiness # Readiness de homologacao + tuning final de thresholds por conector
npm run monitor:fullcycle:consolidation # Consolidacao por ambiente + serie temporal + acoplamento postmortem executivo
npm run monitor:fullcycle:observability # Observability layer centralizado + dashboard UI multiambiente + correlacao incidente/postmortem
npm run monitor:fullcycle:productization # Productizacao com payload estavel para API + retention/arquivamento + trilha de compliance
npm run monitor:fullcycle:observability:api # Gate da API interna (contrato de endpoint + RBAC/auth + freshness de payload)
npm run monitor:fullcycle:observability:realtime # Motor de stream realtime + trilha de eventos + gate executivo
npm run monitor:fullcycle:observability:alerting # Alerting proativo do realtime + historico SLA da API interna
npm run monitor:fullcycle:observability:backend # Consolida incidents/alerts com owner dinamico on-call + analytics historico
npm run monitor:fullcycle:observability:panel # Publica painel operacional backend-first (incidents/alerts + timeline realtime + SLA)
npm run monitor:fullcycle:observability:compat # Materializa payload legado de observability a partir do backend-first
npm run monitor:fullcycle:observability:live # Fluxo oficial das Fases 34/35: governanca live + contrato + painel headless + convergencia legada
```

## Operação (Runbook)

- Runbook oficial: `docs/runbook-operacional.md`
- Monitoramento externo: `docs/monitoramento-externo.md`
- Playbook de incidentes: `docs/playbook-incidentes.md`
- Dashboard de confiabilidade: `docs/reliability-dashboard.md`
- Dashboard de on-call: `docs/oncall-dashboard.md`
- Dashboard de governanca: `docs/executive-governance.md`
- Dashboard de governanca full-cycle: `docs/fullcycle-governance.md`
- Dashboard de execucao full-cycle: `docs/fullcycle-execution.md`
- Dashboard de convergencia full-cycle: `docs/fullcycle-convergence.md`
- Dashboard de conectores full-cycle: `docs/fullcycle-connectors.md`
- Dashboard runtime de conectores: `docs/fullcycle-connectors-runtime.md`
- Dashboard de readiness de conectores: `docs/fullcycle-connectors-readiness.md`
- Dashboard de consolidacao de conectores: `docs/fullcycle-connectors-operations.md`
- Dashboard UI de observability de conectores: `docs/fullcycle-connectors-observability.html`
- Feed JSON de observability de conectores: `docs/fullcycle-connectors-observability.json`
- Dashboard de productizacao de conectores: `docs/fullcycle-connectors-productization.md`
- Dashboard de governanca da API interna de observability: `docs/fullcycle-connectors-observability-api-governance.md`
- Dashboard de observability realtime de conectores: `docs/fullcycle-connectors-observability-realtime.md`
- Dashboard de alerting realtime de conectores: `docs/fullcycle-connectors-observability-alerting.md`
- Dashboard de SLA da API interna: `docs/fullcycle-connectors-observability-api-sla.md`
- Dashboard de governanca live da observabilidade: `docs/fullcycle-connectors-observability-live-governance.md`
- Dashboard operacional interativo realtime: `docs/fullcycle-connectors-observability-ops-panel.html`
- Dashboard backend de incidents/alerts: `docs/fullcycle-connectors-observability-backend.md`
- Postmortems assistidos: `docs/postmortems/`
- Postmortems de conectores: `docs/postmortems/connectors/`
- Sync paging/ITSM: `scripts/phase14-itsm-paging-sync.mjs`
- Rotacao de plantao (template): `config/oncall-rotation.example.json`
- Calendario de plantao (template): `config/oncall-calendar.example.json`
- Ambientes de conectores (template): `config/connector-environments.example.json`
- Matriz de roteamento observability (template): `config/observability-routing.example.json`
- Scripts legados de worker (`run-worker.*`, `start-worker.ps1`) foram desativados para evitar operação ambígua.
- Use apenas comandos oficiais (`npm run local:up`, `npm run dev:worker`, `npm run start:worker`).

---

## Timezone

Todo o sistema usa `America/Sao_Paulo` (GMT-3).

---

## Agentes

8 agentes especializados disponíveis para tarefas do sistema:

| Agente | Foco |
|--------|------|
| `ARCHITECT` | Decisões arquiteturais, tech lead |
| `FULLSTACK` | Features completas (frontend + backend) |
| `FRONTEND` | UI/UX + código React/Vue, performance |
| `UX_DESIGNER` | Design conceitual, fluxos, handoff |
| `BACKEND` | APIs, banco, integrações |
| `QA` | Testes, qualidade |
| `DEVOPS` | Deploy, CI/CD, infra |
| `REVIEWER` | Code review, padrões |

**Uso:** `sessions_spawn --agentId <nome> --task "..."`

---

## Licença

MIT
