# 00 - Visão Geral do Sistema

## Escopo da análise
Esta análise foi feita com foco forense de entendimento, rastreabilidade e confronto entre intenção (documentação) e implementação real (código/configuração).

### O que foi coberto
- Código-fonte backend, worker, frontend e pacotes compartilhados.
- Banco de dados (migrations).
- Configurações de execução/build (package, tsconfig, docker, pm2, vite/tailwind).
- Scripts operacionais, debug, sincronização, testes e manutenção.
- Documentação estratégica (`README`, planos, roadmap, status, notas técnicas, docs de pacote).

### O que foi deliberadamente excluído (com justificativa)
- `node_modules/**`: dependências de terceiros, sem lógica autoral do projeto.
- `dist/**` e `.js/.d.ts` gerados de TS: artefatos compilados redundantes ao `src`.
- `logs/**`: dados de execução, não definem comportamento de código.
- JSONs massivos de dados (`multivix-*.json`, `instituto-vendas-messages.json`): dados operacionais, não estrutura de software.

## Objetivo do produto (inferido)
Sistema de monitoramento comercial de conversas WhatsApp (modo shadow monitoring: observa, classifica, mede e recomenda) com:
- ingestão via webhook Evolution API,
- processamento assíncrono (BullMQ),
- classificação/extração por IA (LLM/STT/Vision),
- persistência analítica em PostgreSQL,
- painel React para operação comercial e gestão.

## Inventário estrutural (ETAPA 1)

### Diretórios principais
- `.claude/`
- `apps/`
  - `api/`
  - `worker/`
  - `dashboard/`
- `packages/`
  - `db/`, `llm/`, `stt/`, `embeddings/`, `rag/`, `vision/`, `audit/`, `governance/`, `planner/`, `evolution/`
- `infra/`
  - `migrations/`, `docker/`, `test-fixtures/`
- `scripts/`
- `docs/`
  - `plans/`
  - `analise-projeto/` (criado nesta auditoria)

### Arquivos centrais por domínio

#### Backend/API
- `apps/api/src/index.ts`
- `apps/api/src/routes/webhook.ts`
- `apps/api/src/routes/dashboard.ts`
- `apps/api/src/routes/conversations.ts`
- `apps/api/src/routes/alerts.ts`
- `apps/api/src/routes/events.ts`
- `apps/api/src/routes/reviews.ts`
- `apps/api/src/routes/metrics.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/health.ts`

#### Worker / filas / automações
- `apps/worker/src/index.ts`
- `apps/worker/src/comprovante-detector.js` (legado)
- `worker-entry.mjs`

#### Frontend
- `apps/dashboard/src/App.tsx`
- `apps/dashboard/src/hooks/useApi.ts`
- `apps/dashboard/src/services/api.ts`
- `apps/dashboard/src/pages/*.tsx` (11 páginas)

#### Banco de dados
- `infra/migrations/001_init.sql ... 015_rag_chunks.sql`
- `packages/db/src/queries.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/objection-resolution.ts`

#### Integrações
- Evolution API: `webhook.ts`, `scripts/sync-*.mjs`
- STT: `packages/stt/src/index.ts`
- LLM: `packages/llm/src/index.ts`
- Vision/OCR: `packages/vision/src/index.ts`, `packages/llm/src/ocr-*.js`
- RAG: `packages/rag/src/index.ts`, `packages/embeddings/src/index.ts`

#### Infra/execução
- `docker-compose.yml`
- `infra/docker/Dockerfile.api`
- `infra/docker/Dockerfile.worker`
- `ecosystem.config.cjs`
- `start.ps1`, `stop.ps1`, `status.ps1`, `run-worker.*`

#### CI/CD
- Não existe pasta `.github/workflows` no estado atual.

## Tecnologias efetivamente detectadas
- Node.js 20+, TypeScript, Fastify, BullMQ, Redis, PostgreSQL 16 + pgvector.
- Frontend React + Vite + Tailwind + Recharts.
- STT via Groq (código atual), LLMs com fallback chain (GLM/Kimi/DeepSeek/Opus via OpenAI-compatible HTTP).
- OCR/PDF parsing (`pdf-parse`) e módulo Vision dedicado.

## Panorama operacional
- Arquitetura orientada a eventos com webhook + filas está presente.
- Existe separação por pacotes de domínio, mas há sinais de deriva entre documentação e código (estrutura, fórmulas, variáveis de ambiente e partes legadas).
- Há volume relevante de scripts utilitários ad-hoc para diagnóstico e correções emergenciais.

## Classificação dos `.md` relevantes

### Visão geral
- `README.md`
- `STRUCTURE.md`
- `docs/EvolutionEvents.md`

### Plano
- `IMPLEMENTATION_PLAN.md`
- `docs/plans/2026-03-05-arquitetura-dashboard-comercial.md`
- `docs/plans/2026-03-05-implementacao-dashboard-comercial.md`

### Arquitetura
- `.claude/ARCHITECTURE_REVIEW.md`
- `docs/plans/2026-03-05-arquitetura-dashboard-comercial.md`

### Tarefas pendentes / status
- `ROADMAP.md`
- `STATUS-v2.md`
- `packages/audit/IMPLEMENTATION_SUMMARY.md`

### Instruções operacionais
- `AGENTS.md`
- `WEBHOOK-BUG-FIX.md`
- `infra/test-fixtures/README.md`

### Documentação técnica
- `STT-RESOLUCAO.md`
- `packages/audit/README.md`

### Observação
- `docs/DASHBOARD_AUDIT.md`: placeholder (conteúdo atual: `Audit completed`).
