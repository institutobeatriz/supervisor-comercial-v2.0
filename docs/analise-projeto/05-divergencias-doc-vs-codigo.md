# 05 - Divergencias Documentacao vs Implementacao

## Legenda de classificacao
- `implementado conforme o plano`
- `implementado parcialmente`
- `implementado de forma diferente`
- `nao implementado`
- `contraditorio`
- `indefinido`

---

## Matriz de confronto

| ID | Fonte .md | Declaracao da documentacao | Implementacao observada no codigo | Classificacao |
|---|---|---|---|---|
| D01 | `README.md` | Estrutura do worker em `src/jobs/*.ts` | Worker real e centralizado em `apps/worker/src/index.ts` com todos os workers no mesmo arquivo | implementado de forma diferente |
| D02 | `README.md` | Jobs de relatorio diario e semanal disponiveis | Worker agenda apenas `daily` (23:55) e `report` esta com `TODO` (sem geracao real) | implementado parcialmente |
| D03 | `README.md` | Variavel Evolution principal `EVOLUTION_API_URL` | Webhook usa `EVOLUTION_URL`; scripts usam combinacao de `EVOLUTION_API_URL` e `EVOLUTION_URL` | implementado de forma diferente |
| D04 | `README.md` | STT em Groq | `packages/stt/src/index.ts` usa Groq `/audio/transcriptions` | implementado conforme o plano |
| D05 | `STT-RESOLUCAO.md` | "Atual: OpenAI Whisper-1" | Codigo STT atual aponta para Groq (`whisper-large-v3-turbo`) | contraditorio |
| D06 | `STRUCTURE.md` | Mapa de diretorios com `apps/api/src/app.ts`, `config/`, `worker/src/queues/jobs/*` | Esses caminhos nao existem no estado atual do repositorio | contraditorio |
| D07 | `ROADMAP.md` | Fases de dashboard concluidas com dados reais em revisoes | Frontend revisoes funciona, mas backend de review tem drift de colunas (`reviewer/notes` vs `reviewed_by/review_notes`) | implementado parcialmente |
| D08 | `ROADMAP.md` | Conversas detalhadas com sentiment/purchase_intent por mensagem | Endpoint `/conversations/:id` consulta colunas que nao existem em `messages` | contraditorio |
| D09 | `STATUS-v2.md` | Fase 4/5 (governanca/middleware deterministico) concluida | Pacotes existem, mas `withGovernance` nao aparece integrado no pipeline principal | implementado parcialmente |
| D10 | `IMPLEMENTATION_PLAN.md` | Fase 4 e 5 marcadas como pendentes | Codigo contem `limits.ts`, `rules.ts`, `decision.ts`, `alerts.ts`, `middleware.ts` | implementado de forma diferente |
| D11 | `docs/plans/2026-03-05-arquitetura-dashboard-comercial.md` | Migration `009` estava `.skip` (dedup desligada) | Repo atual possui `009_message_deduplication.sql` ativo | implementado de forma diferente |
| D12 | `docs/plans/2026-03-05-arquitetura-dashboard-comercial.md` | Vision sincrono no webhook | Webhook atual enfileira `vision` assincronamente | implementado de forma diferente |
| D13 | `docs/plans/2026-03-05-arquitetura-dashboard-comercial.md` | Sem `raw_events` table | Migration `005_raw_events.sql` e uso em webhook/queries presentes | implementado conforme o plano |
| D14 | `docs/plans/2026-03-05-implementacao-dashboard-comercial.md` | Formula correta de conversao: `won / (won+lost)` | `/dashboard/kpis` usa `sales_won / leads_received`; DB usa formula diferente | contraditorio |
| D15 | `docs/EvolutionEvents.md` | Eventos `messages.update`, `connection.update`, `status.instance` processados | Webhook principal trata apenas `messages.upsert` e `send.message` para pipeline; demais nao entram no mesmo fluxo | implementado parcialmente |
| D16 | `WEBHOOK-BUG-FIX.md` | Schema deve aceitar `data` como objeto ou array | `WebhookPayloadSchema` atual usa `z.union([record,array])` | implementado conforme o plano |
| D17 | `packages/audit/README.md` | Logs em `logs/audit-YYYY-MM-DD.jsonl` | Logger grava em JSONL com caminho relativo por `process.cwd()` e tambem tenta persistir em `audit_log` DB | implementado de forma diferente |
| D18 | `docs/DASHBOARD_AUDIT.md` | Espera-se auditoria documentada | Arquivo contem apenas "Audit completed" sem evidencia tecnica | nao implementado |
| D19 | `.claude/ARCHITECTURE_REVIEW.md` | Sistema "maduro" com varias capacidades em producao | Codigo mostra inconsistencias estruturais (reviews, conversao, schemas, segredos hardcoded) | contraditorio |
| D20 | `.claude/ARCHITECTURE_REVIEW.md` | Pipeline com DLQ formal e idempotencia robusta | Nao ha implementacao explicita de DLQ no codigo lido; idempotencia existe mas com lacunas de fluxo | implementado parcialmente |

---

## Divergencias de configuracao (doc x runtime)

1. `EVOLUTION_API_URL` vs `EVOLUTION_URL`
- Documentacao principal usa `EVOLUTION_API_URL`.
- Webhook usa `EVOLUTION_URL`.
- Resultado: risco de ambiente configurado "conforme doc" mas com webhook apontando para outro host.

2. STT provider declarado em docs tecnicas
- `STT-RESOLUCAO.md` diverge do codigo executavel.
- Impacto: referencia operacional enganosa para troubleshooting.

3. Status de features "concluidas"
- Documentos de status/roadmap marcam varias frentes como concluidas.
- Implementacao atual mostra pontos inacabados/derivados (report TODO, governance parcial no pipeline, contratos SQL com drift).

---

## Itens indefinidos (necessitam validacao externa)

1. Ambiente real de producao
- Alguns conflitos podem nao ocorrer se schema em producao tiver colunas adicionais nao versionadas neste repositorio.
- Classificacao: `indefinido` ate validar DDL real do banco em uso.

2. Uso efetivo de scripts legados
- Ha muitos scripts de operacao local; sem historico de execucao, nao e possivel concluir quais fazem parte do runbook atual.
- Classificacao: `indefinido`.
