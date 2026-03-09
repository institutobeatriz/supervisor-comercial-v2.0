# 08 - Matriz de Rastreabilidade

## Legenda de status
- `Alto`: comportamento bem rastreado no codigo.
- `Medio`: entendimento funcional bom, com lacunas de uso/ambiente.
- `Baixo`: entendimento preliminar ou dependente de validacao externa.

---

## Matriz principal

| Arquivo | Finalidade | Depende de | E usado por | Fluxo relacionado | Status de entendimento | Duvidas |
|---|---|---|---|---|---|---|
| `package.json` | scripts workspace/build/dev | npm workspaces, apps/packages | operadores, CI local | bootstrap | Alto | nenhuma |
| `.env.example` | contrato de env | docs operacionais | api/worker/devops | todos | Alto | drift de nomes Evolution |
| `docker-compose.yml` | sobe postgres/redis/api/worker | Dockerfiles, `.env` | dev local | bootstrap infra | Alto | nenhuma |
| `ecosystem.config.cjs` | PM2 dev | npm scripts | operacao local | runtime local | Alto | caminho absoluto fixo |
| `apps/api/src/index.ts` | bootstrap API Fastify | `@supervisor/db`, rotas | processo API | bootstrap | Alto | nenhuma |
| `apps/api/src/routes/webhook.ts` | ingestao Evolution + enqueue | `@supervisor/db`, BullMQ, env Evolution | Evolution API | F01/F02/F03 | Alto | dedup efetiva no fluxo |
| `apps/api/src/routes/dashboard.ts` | endpoints analiticos dashboard | `@supervisor/db`, Redis | frontend dashboard | F07 | Alto | escala sentiment/conversao |
| `apps/api/src/routes/conversations.ts` | lista/detalhe conversas | SQL inline, tabelas core | frontend Conversas | F07 | Alto | colunas inexistentes em `messages` |
| `apps/api/src/routes/alerts.ts` | alertas REST/SSE | SQL, tabelas analiticas | frontend Alertas | F07 | Alto | existencia de `alert_history` |
| `apps/api/src/routes/events.ts` | SSE geral + invalidacao cache | Redis, memoria local | worker (`/internal/emit`), frontend | F05/F07 | Alto | multi-instancia sem pub/sub |
| `apps/api/src/routes/reviews.ts` | revisao humana API | `@supervisor/db` | frontend Reviews | F09 (review) | Alto | chave admin hardcoded |
| `apps/api/src/routes/admin.ts` | admin API/HTML legado | `@supervisor/db` | operador/admin | admin/rag/reports | Alto | auth opcional sem chave |
| `apps/api/src/routes/metrics.ts` | agrega custo/tokens de audit log | FS, path absoluto | frontend MetricsIA | F07 | Alto | path hardcoded |
| `apps/api/src/routes/health.ts` | health check DB | `@supervisor/db` | docker/ops | bootstrap | Alto | nenhuma |
| `apps/worker/src/index.ts` | orquestracao BullMQ + cron | db/llm/stt/vision/rag/audit/governance/planner | processo worker | F02/F03/F04/F05/F06/F08 | Alto | report TODO; branch PDF |
| `apps/worker/src/comprovante-detector.js` | detector legado | modulo ocr legado | sem uso claro | legado | Medio | dependencia faltante |
| `apps/dashboard/src/main.tsx` | bootstrap React | App.tsx | browser | F07 | Alto | nenhuma |
| `apps/dashboard/src/App.tsx` | shell UI + filtros globais | paginas/hook fetch | browser | F07 | Alto | IDs produtos fixos |
| `apps/dashboard/src/hooks/useApi.ts` | fetch hook generico | fetch API | paginas dashboard | F07 | Alto | headers fora da dependencia |
| `apps/dashboard/src/hooks/useDashboardData.ts` | hook legado agregado | `services/api.ts` | possivel uso legado | F07 | Medio | uso atual parcial |
| `apps/dashboard/src/services/api.ts` | client tipado legacy | fetch relativo `/api` | hooks legados | F07 | Medio | coexistencia com `useApi` direto |
| `apps/dashboard/src/pages/Executivo.tsx` | visao executiva | `/dashboard/kpis*` | App.tsx | F07 | Alto | depende da formula de conversao API |
| `apps/dashboard/src/pages/Funil.tsx` | funil comercial | `/dashboard/funnel` | App.tsx | F07 | Alto | nenhuma |
| `apps/dashboard/src/pages/Performance.tsx` | ranking vendedor | `/dashboard/sellers/full` | App.tsx | F07 | Alto | nenhuma |
| `apps/dashboard/src/pages/Produtos.tsx` | comparativo produto | `/dashboard/products/comparison` | App.tsx | F07 | Alto | nenhuma |
| `apps/dashboard/src/pages/LossAnalysis.tsx` | analise de perdas | `/dashboard/loss-stats` | App.tsx | F07 | Alto | escala de sentimento no backend |
| `apps/dashboard/src/pages/Conversas.tsx` | busca/lista/detalhe conversa | `/api/conversations*` | App.tsx | F07 | Alto | backend detalhe com drift de colunas |
| `apps/dashboard/src/pages/FollowUp.tsx` | follow-up operacional | `/dashboard/followup/full` | App.tsx | F07 | Alto | nenhuma |
| `apps/dashboard/src/pages/Reviews.tsx` | aprovacao/rejeicao humana | `/reviews*`, `apiPost` | App.tsx | F09 | Alto | chave admin hardcoded |
| `apps/dashboard/src/pages/MetricsIA.tsx` | consumo de custo/tokens | `/metrics/usage` | App.tsx | F07 | Alto | depende path logs backend |
| `apps/dashboard/src/pages/Alertas.tsx` | stream de alertas | `/api/alerts`, `/api/alerts/stream` | App.tsx | F07 | Alto | nenhuma |
| `apps/dashboard/src/pages/Relatorios.tsx` | export PDF/XLSX browser-side | endpoints dashboard + libs jsPDF/XLSX | App.tsx | F07 (saida) | Alto | API base hardcoded localhost |
| `packages/db/src/pool.ts` | conexao/transacao PG | env DB | todo repositorio backend/worker | todos | Alto | nenhuma |
| `packages/db/src/migrate.ts` | aplica migrations | FS + pool | API startup, comandos db | F09 | Alto | encoding/comentarios degradados |
| `packages/db/src/types.ts` | tipos de dominio | schema SQL pretendido | db queries + TS | todos | Alto | drift pontual com uso real |
| `packages/db/src/queries.ts` | repositorio SQL principal | pool, schema migrations | api e worker | todos | Alto | varios drifts pontuais |
| `packages/db/src/queries-extended.ts` | consultas auxiliares | pool/query | uso secundario | analitico | Medio | cobertura de uso |
| `packages/db/src/objection-resolution.ts` | logica auxiliar de objecao | db query | endpoints analiticos | F07 | Medio | uso efetivo completo |
| `packages/llm/src/index.ts` | classificacao LLM + fallback | fetch providers, env | worker classify | F04 | Alto | token hardcoded fallback |
| `packages/stt/src/index.ts` | transcricao audio + decrypt | Groq, crypto | worker stt | F02 | Alto | MAC check incompleto |
| `packages/vision/src/index.ts` | parse PDF + detector comprovante | `pdf-parse` | worker vision | F03 | Alto | branch depende `base64` job |
| `packages/embeddings/src/index.ts` | embeddings RAG | provider embedding, env | worker rag, package rag | F06 | Alto | nenhuma |
| `packages/rag/src/index.ts` | busca vetorial/textual | db + embeddings | admin/rag consumers | F06 | Alto | nenhuma |
| `packages/governance/src/rules.ts` | regras deterministicas outcome | regex/regras | decision, possivel worker | F04 | Alto | nenhuma |
| `packages/governance/src/decision.ts` | decisao final + review task | rules + audit + db | worker classify | F04/F09 | Alto | mapping de `pending` para review |
| `packages/governance/src/middleware.ts` | enforce de limites | limits+alerts+audit | sem uso direto encontrado | F04 | Medio | integracao real no pipeline |
| `packages/governance/src/limits.ts` | limites de custo/tokens | armazenamento em memoria | middleware/alerts | F04 | Alto | persistencia multi-instancia |
| `packages/governance/src/alerts.ts` | alertas de governanca | limits usage | scheduler worker | F08 | Alto | persistencia volatil |
| `packages/governance/src/notify.ts` | notificacao Telegram | env bot/chat | decision/review | F09 | Alto | ambiente real configurado? |
| `packages/planner/src/ralph-loop.ts` | loop deliberativo | gap-analyzer + audit | worker classify | F04 | Alto | coexistencia com loops simplificados |
| `packages/planner/src/simple-loop.ts` | loop simplificado | governance | possivel uso worker | F04 | Alto | sobreposicao com `ralph-loop` |
| `packages/planner/src/gap-analyzer.ts` | detecao de gaps | plan steps/context | ralph loop | F04 | Alto | nenhuma |
| `packages/planner/src/feedback.ts` | feedback/adaptacao threshold | db table `ralph_feedback` | rotina analitica | F08/F09 | Medio | uso operacional recorrente |
| `packages/evolution/src/index.ts` | normalizacao payload Evolution | zod | modulo evolution | ingestao auxiliar | Medio | nao e caminho principal webhook |
| `packages/evolution/src/normalizer.ts` | normalizador alternativo legado | zod | modulo evolution | ingestao auxiliar | Medio | duplicidade com `index.ts` |
| `packages/audit/src/logger.ts` | auditoria JSONL + DB | pino + pg + FS | worker/governance/decision | F04/F05/F08 | Alto | destino de log por CWD |
| `infra/migrations/001_init.sql` | schema base | PG extensions | db layer | todos | Alto | nenhuma |
| `infra/migrations/002_human_reviews.sql` | tabela review humana | PG | reviews/queries | F09 | Alto | drift com SQL atual |
| `infra/migrations/003_add_monthly_goal.sql` | meta mensal seller | PG | dashboard KPI | F07 | Alto | nenhuma |
| `infra/migrations/004_seed_sellers.sql` | seed vendedores exemplo | PG | dev bootstrap | suporte | Alto | seed de exemplo em ambiente real |
| `infra/migrations/005_raw_events.sql` | append-only raw events | PG | webhook/queries | F01 | Alto | dedup na orquestracao |
| `infra/migrations/006_messages_raw_event_fk.sql` | coluna/index raw_event_id | PG | queries/webhook | F01 | Alto | sem FK constraint explicita |
| `infra/migrations/007_insights_missing_cols.sql` | colunas extras insights | PG | conversations/alerts | F07 | Alto | nenhuma |
| `infra/migrations/008_ralph_feedback.sql` | tabela feedback planner | PG | planner feedback | F08/F09 | Alto | nenhuma |
| `infra/migrations/009_message_deduplication.sql` | dedup de mensagens | PG | webhook/queries | F01 | Alto | tratamento de conflito no app |
| `infra/migrations/010_instance_seller_map.sql` | mapa instancia->seller | PG | webhook | F01 | Alto | seeds dependem UUID existente |
| `infra/migrations/011_sales_outcomes_sale_type.sql` | sale_type e evidencias | PG | worker vision/dashboard | F03/F07 | Alto | nenhuma |
| `infra/migrations/012_sellers_email.sql` | email sellers | PG | seed/admin | suporte | Alto | nenhuma |
| `infra/migrations/013_audit_log.sql` | trilha persistente audit | PG | package audit | F04/F08 | Alto | nenhuma |
| `infra/migrations/014_lgpd_retention.sql` | funcao anonymize LGPD | PG | cron worker | F08 | Alto | cobertura de politicas adicionais |
| `infra/migrations/015_rag_chunks.sql` | redefine rag_chunks 1536 | PG + pgvector | worker rag | F06 | Alto | conflito com 001 (1024) |
| `scripts/sync-messages.mjs` | sincronizacao historica Evolution | fetch Evolution + PG | operador | ingestao suporte | Medio | chave fallback hardcoded |
| `scripts/sync-correct.mjs` | sincronizacao/correcao historica | fetch Evolution + PG | operador | ingestao suporte | Medio | chave fallback hardcoded |
| `scripts/eval-golden.ts` | avaliacao de classificacao por fixtures | LLM + fixtures | QA manual | validacao | Medio | integracao CI ausente |
| `scripts/queue-classify.ts` | enfileirar classificacao manual | BullMQ | operador/QA | suporte | Medio | uso oficial indefinido |
| `run-worker.cmd` | start/restart worker legado | node dist legacy | operador local | operacao | Alto | target incorreto |
| `run-worker.ps1` | start/restart worker legado | node dist legacy | operador local | operacao | Alto | target incorreto |
| `worker-entry.mjs` | entrypoint legado worker | import dist legacy | operador local | operacao | Alto | target incorreto |
| `.claude/settings.json` | config local de ferramenta | leitor JSON | tooling local | suporte | Alto | arquivo invalido |

---

## Observacao final
A matriz acima foi priorizada para arquivos com efeito direto no runtime, no contrato de dados e na operacao. Arquivos gerados (`*.js`, `*.d.ts`, `*.map`) foram rastreados como derivados e nao duplicados na matriz para evitar ruido.
