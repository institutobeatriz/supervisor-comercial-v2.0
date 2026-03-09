# 03 - Analise Arquivo a Arquivo

## Escopo e criterio
Esta secao consolida a leitura tecnica por arquivo/diretorio, com foco em:
- finalidade e responsabilidade;
- dependencias de entrada/saida;
- fluxo interno;
- regras implicitas;
- relacao com outros arquivos;
- riscos e ambiguidades.

### Arquivos considerados "relevantes" nesta auditoria
- codigo-fonte em `apps/**/src` e `packages/**/src`;
- configuracoes de build/execucao (`package.json`, tsconfig, Vite, Tailwind, Docker, compose, PM2);
- migrations SQL (`infra/migrations/*.sql`);
- scripts operacionais e de diagnostico (`scripts/*` e raiz `*.cjs/*.mjs/*.ps1/*.cmd/*.sh`);
- documentacao estrategica (`*.md`, `docs/**`, `.claude/**`).

### Exclusoes deliberadas (com justificativa)
- `node_modules/**`: dependencias de terceiros, nao definem logica autoral.
- `dist/**` e artefatos `*.js/*.d.ts/*.map` gerados de TS: redundantes ao fonte em `src`.
- `logs/**`: evidencia operacional, nao definicao de comportamento.
- JSONs massivos de dados (`multivix-*.json`, `instituto-vendas-messages.json`): insumo de operacao, nao codigo.

---

## 1) Raiz do repositorio

### `/AGENTS.md`
- Finalidade: politica global de orquestracao de "agentes" e padrao de qualidade.
- Responsabilidade: definir postura/processo, nao comportamento de runtime.
- Dependencias: nenhuma no codigo.
- Risco: baixo tecnico; alto de alinhamento (pode divergir da implementacao real).

### `/README.md`
- Finalidade: onboarding, stack, rotas/jobs esperados.
- Entradas/saidas: referencia humana.
- Relacao: deveria refletir `apps/api`, `apps/worker`, `packages/*`, `infra/*`.
- Risco: contem partes desatualizadas (ver divergencias no arquivo `05-divergencias-doc-vs-codigo.md`).

### `/IMPLEMENTATION_PLAN.md`, `/ROADMAP.md`, `/STATUS-v2.md`, `/STRUCTURE.md`, `/STT-RESOLUCAO.md`, `/WEBHOOK-BUG-FIX.md`
- Finalidade: intencao, roadmap e registro de sessoes.
- Observacao forense: usados como fonte de "intencao"; varias declaracoes nao batem 100% com codigo atual.

### `/package.json`
- Finalidade: orquestracao de workspaces e scripts de build/dev/start.
- Dependencias de entrada: workspaces `apps/*` e `packages/*`.
- Saida: comandos para dev local, docker, migrate/reset e lint.
- Risco: coexistencia de scripts antigos e novos de worker/entrypoint.

### `/.env.example`
- Finalidade: contrato de variaveis de ambiente.
- Risco: drift com implementacao (`EVOLUTION_API_URL` no exemplo vs `EVOLUTION_URL` em partes do codigo).

### `/docker-compose.yml`
- Finalidade: stack local (postgres, redis, api, worker) com perfis.
- Dependencias: Dockerfiles em `infra/docker/`.
- Risco: se variaveis divergirem do runtime local, comportamento inconsistente.

### `/ecosystem.config.cjs`
- Finalidade: PM2 dev para API e worker.
- Risco: caminho fixo absoluto (acoplamento a maquina).

### `/tsconfig*.json`
- Finalidade: compilacao TS no monorepo.
- Observacao: ha diferenca de rigor entre `tsconfig.base.json` (strict true) e `tsconfig.json` raiz (strict false) -> aumenta tolerancia a erros de tipo.

### Scripts de bootstrap operacional (`start.ps1`, `stop.ps1`, `status.ps1`, `start-api.ps1`, `start-worker.ps1`, `run-worker.*`, `worker-entry.mjs`, `run-api-fresh.sh`)
- Finalidade: iniciar/parar processos localmente e manter keep-alive.
- Risco critico: coexistem scripts apontando para `dist/worker.mjs` enquanto o pacote atual usa `apps/worker/dist/index.js`.
- Impacto: falha de inicializacao dependendo do script usado.

### Scripts de diagnostico na raiz (`check-*`, `debug-*`, `test-*`, `verify-*`, `fix-*`, etc.)
- Finalidade: investigacao ad-hoc de KPIs/SQL/duplicidade e verificacoes pontuais.
- Dependencias: banco Postgres e, em varios casos, `packages/db/dist`.
- Risco: scripts utilitarios sem contrato formal de uso; podem refletir estado historico, nao pipeline principal.

---

## 2) API (`/apps/api/src`)

### `/apps/api/src/index.ts`
- Finalidade: bootstrap da API Fastify.
- Responsabilidades:
  - carrega env;
  - configura logger, helmet, cors;
  - aplica middleware de tempo de resposta;
  - registra rotas;
  - testa DB e roda migrations no startup.
- Dependencias de entrada:
  - `@supervisor/db` (`ping`, `migrate`);
  - rotas de `./routes/*`.
- Dependencias de saida:
  - expoe endpoints HTTP;
  - depende de Postgres no startup.
- Fluxo logico:
  1. monta app com plugins;
  2. registra rotas com prefixes;
  3. `ping()` no banco;
  4. `migrate()`;
  5. `listen()`.
- Riscos:
  - migrations no startup podem aumentar tempo de boot e acoplamento runtime/schema.

### `/apps/api/src/routes/health.ts`
- Finalidade: healthcheck (`/health`).
- Fluxo: chama `ping()` e retorna healthy/unhealthy.
- Risco: baixo.

### `/apps/api/src/routes/webhook.ts` (arquivo critico)
- Finalidade: ingestao de eventos Evolution (`POST /webhooks/evolution`).
- Responsabilidades:
  - validar autorizacao opcional por `EVOLUTION_WEBHOOK_SECRET`;
  - validar payload com Zod;
  - persistir `raw_events`;
  - disparar processamento assinc via `setImmediate`;
  - criar mensagem/conversa/contato;
  - enfileirar `stt`, `classify` e `vision`.
- Entradas:
  - body webhook Evolution;
  - env (`EVOLUTION_URL`, `EVOLUTION_API_KEY`, segredo).
- Saidas:
  - inserts em `raw_events`, `contacts`, `conversations`, `messages`;
  - jobs BullMQ.

#### Analise por blocos logicos
1. **Validação e auth**
- Header `Authorization` so e exigido se segredo estiver configurado.
- Payload invalido retorna `200 ignored` (estrategia tolerante).

2. **Persistencia de evento bruto**
- usa `insertRawEvent` antes do processamento.
- observacao: deduplicacao fica incompleta no uso atual, porque duplicatas podem retornar ID existente e seguir processamento.

3. **`processMessage`**
- resolve seller por `instance_seller_map` com fallback para seller default;
- cria/atualiza contato e conversa;
- insere mensagem em `messages`;
- atualiza `last_message_at`.

4. **Roteamento por tipo de midia**
- audio: tenta base64 descriptografado via Evolution; fallback por `mediaKey`; enfileira STT.
- texto inbound: enfileira classify.
- imagem/documento inbound: enfileira vision.

#### Regras implicitas
- webhook deve responder rapido (`timeout` config de 150ms).
- processamento pesado e assinc.

#### Riscos/bugs observados
- risco de null em dedup de mensagem: `insertMessage` usa `DO NOTHING RETURNING *`; se conflito, `msg` pode vir indefinido e ainda ser referenciado.
- `whatsapp_message_id` e extraido no webhook, mas nao e enviado explicitamente para `insertMessage` nesse ponto.
- variavel de ambiente divergente (`EVOLUTION_URL` no codigo vs `EVOLUTION_API_URL` em docs/env example).

### `/apps/api/src/routes/dashboard.ts` (arquivo critico, 1100+ linhas)
- Finalidade: API agregadora de dashboard (`/api/dashboard/*`).
- Responsabilidades:
  - parse de periodo (dia/mes);
  - consultas analiticas no DB;
  - cache curto em Redis;
  - endpoints executivos, funil, performance, produtos, perdas, comparativos.
- Entradas:
  - query params (`sellerId`, `periodMode`, `date`, `month`);
  - DB queries do pacote `@supervisor/db` e SQL inline.
- Saidas:
  - payloads prontos para frontend.

#### Blocos internos principais
1. **Helpers de periodo e cache key**
- normalizam datas para recortes de consulta.

2. **Endpoints KPIs e funil**
- `kpis`, `funnel`, `ranking`, `losses`, `sellers/full`, `products/comparison`, `kpis-comparison`, `pipeline-weighted`.

3. **Cache Redis**
- TTL curto; invalidado por eventos SSE em `events.ts`.

#### Regras implicitas
- periodizacao mensal usa timezone local esperada pelo frontend.
- varios endpoints fazem fallback para zero em ausencia de dados.

#### Riscos/ambiguidades
- formula de conversao em `/dashboard/kpis` diverge da formula usada em `packages/db` (`won / leads_received` vs `won / (won+lost)`).
- limiares de sentimento usam escala 0-100 em algumas queries, mas `message_labels.sentiment` no schema e `SMALLINT`.
- parte relevante de metricas esta em SQL inline (manutenibilidade e consistencia mais dificil).

### `/apps/api/src/routes/conversations.ts` (critico para detalhamento de conversa)
- Finalidade: listagem paginada e detalhe (`/api/conversations`, `/api/conversations/:id`).
- Responsabilidades:
  - busca por nome/telefone/vendedor;
  - filtros por etapa e periodo;
  - detalhe com timeline de mensagens.
- Riscos criticos:
  - consulta referencia colunas nao presentes em `messages` (`role`, `media_type`, `sentiment`, `is_purchase_intent`).
  - usa semantica textual de sentimento (`positive/negative`) divergente do schema numerico em `message_labels`.

### `/apps/api/src/routes/alerts.ts`
- Finalidade: alertas REST + SSE (`/api/alerts`, `/api/alerts/stream`, `/api/alerts/history`).
- Responsabilidades:
  - construir alertas por regras SQL (quentes sem resposta, urgencia, estagnacao, etc.);
  - stream SSE com keepalive.
- Risco:
  - query de historico usa `alert_history`, tabela sem migration versionada no repositorio.

### `/apps/api/src/routes/events.ts`
- Finalidade: canal SSE geral (`/events`) e emissao interna (`/internal/emit`).
- Responsabilidades:
  - manter clientes conectados;
  - emitir eventos e invalidar caches Redis ao receber `conversation_updated`.
- Risco:
  - store de clientes em memoria local (sem pub/sub distribuido).

### `/apps/api/src/routes/reviews.ts`
- Finalidade: fluxo de revisao humana (`/api/reviews*`).
- Responsabilidades:
  - listar pendencias;
  - aprovar/rejeitar;
  - estatisticas.
- Riscos:
  - `ADMIN_KEY` com fallback hardcoded.
  - contrato de retorno (`review`) e booleano pode gerar ambiguidade no frontend.

### `/apps/api/src/routes/admin.ts`
- Finalidade: rotas administrativas legadas (`/admin/*`) + UI HTML.
- Responsabilidades:
  - listar/detalhar conversas;
  - setar outcome manual;
  - consultas de relatorios e RAG.
- Riscos:
  - auth pode ser bypass se `ADMIN_API_KEY` nao estiver configurada.
  - TODO explicito ao setar outcome manual (nao dispara pipeline complementar).

### `/apps/api/src/routes/metrics.ts`
- Finalidade: agregar metricas de uso de IA por leitura de JSONL.
- Dependencias: arquivos em disco.
- Risco critico operacional:
  - caminho absoluto fixo de logs (`C:\Users\user\.openclaw\logs`).

---

## 3) Worker (`/apps/worker/src`)

### `/apps/worker/src/index.ts` (arquivo central critico)
- Finalidade: orquestracao de filas BullMQ e cron jobs.
- Workers implementados:
  - `classify`
  - `stt`
  - `analyze`
  - `vision`
  - `rag-index`
  - `report`
- Dependencias:
  - `@supervisor/db`, `@supervisor/llm`, `@supervisor/stt`, `@supervisor/vision`, `@supervisor/embeddings`, `@supervisor/governance`, `@supervisor/planner`, `@supervisor/audit`.

#### Blocos logicos
1. **Config de lanes/concurrency**
- separa criticidade por filas.

2. **Classify worker**
- classifica texto;
- roda loop/planner;
- aplica regras de governanca para outcomes;
- persiste labels/outcomes;
- enfileira `analyze`.

3. **STT worker**
- transcreve por base64/url/url criptografada;
- atualiza texto da mensagem;
- enfileira classify.

4. **Analyze worker**
- agrega sinais da conversa;
- calcula quality score;
- salva insights;
- emite evento SSE interno;
- enfileira `rag-index`.

5. **Vision worker**
- heuristica pre-OCR;
- branch PDF com `analyzePdf` se `job.data.base64` existir;
- download de base64 na Evolution;
- deteccao de comprovante, `sale_type` e fechamento de venda.

6. **RAG worker**
- chunking de texto;
- embeddings opcionais;
- insert idempotente em `rag_chunks`.

7. **Report worker + cron**
- cron diario enfileira report;
- implementacao do report ainda placeholder (`TODO`).

8. **Cron LGPD**
- anonimiza contatos inativos;
- limpa transcricoes antigas.

#### Riscos/ambiguidades
- branch PDF depende de `job.data.base64`, mas webhook de vision nao envia `base64` no payload do job.
- `report` permanece nao implementado (retorna sucesso sem geracao real).

### `/apps/worker/src/comprovante-detector.js`
- Finalidade: detector legado.
- Risco: dependencia `./ocr-kimi` inexistente nesse diretorio (arquivo legado/desconectado).

---

## 4) Frontend dashboard (`/apps/dashboard/src`)

### `/apps/dashboard/src/main.tsx`
- Finalidade: bootstrap React.

### `/apps/dashboard/src/App.tsx`
- Finalidade: shell do dashboard (sidebar, filtros globais, roteamento por aba).
- Responsabilidades:
  - estado global de produto/periodo/aba;
  - configuracao estatico-local de produtos (`PRODUCTS`);
  - lazy load de `Relatorios`.
- Dependencias:
  - paginas em `/pages/*`;
  - fetch de alertas para badge.
- Riscos:
  - IDs de produto/seller hardcoded no frontend.
  - `API_BASE` e `buildQuery` declarados e nao usados (codigo residual).

### `/apps/dashboard/src/hooks/useApi.ts`
- Finalidade: hook de fetch simples.
- Risco:
  - dependencia de `useEffect` nao inclui `headers` (possivel stale fetch);
  - base URL hardcoded para localhost.

### `/apps/dashboard/src/hooks/useDashboardData.ts`
- Finalidade: hook legado agregador de varios endpoints.
- Observacao: coexistencia com paginas que ja usam `useApi` individualmente.
- Risco: possivel sobreposicao/obsolescencia de padrao.

### `/apps/dashboard/src/services/api.ts`
- Finalidade: client tipado para endpoints de dashboard.
- Observacao: mistura de contrato legado (`/dashboard/alerts`) e implementacao atual das paginas (varias usam endpoints diferentes).

### Paginas (`/apps/dashboard/src/pages/*.tsx`)

#### `Executivo.tsx`
- Consome `kpis`, `kpis-comparison`, `daily-evolution`, `pipeline-weighted`.
- Renderiza KPIs executivos, comparativos e pipeline ponderado.

#### `Funil.tsx`
- Consome `/dashboard/funnel`.
- Exibe distribuicao por estagio e indicadores de conversao.

#### `Performance.tsx`
- Consome `/dashboard/sellers/full`.
- Ranking, tendencia semanal, funil por vendedor, horarios melhores.

#### `Produtos.tsx`
- Consome `/dashboard/products/comparison`.
- Cards por produto, metas, objecoes/perdas, chart comparativo.

#### `LossAnalysis.tsx`
- Consome `/dashboard/loss-stats`.
- Analise por estagio/motivo de perda.

#### `Conversas.tsx`
- Consome `/api/conversations` e `/api/conversations/:id`.
- Busca + filtros + paginação + drawer de detalhes.
- Dependente de campos hoje inconsistentes com backend/schema (sentiment/media_type/purchase_intent).

#### `FollowUp.tsx`
- Consome `/dashboard/followup/full`.
- Priorizacao de contatos por criticidade.

#### `Reviews.tsx`
- Consome `/reviews*` com header `x-admin-key`.
- Risco critico: `ADMIN_KEY` hardcoded no frontend.

#### `MetricsIA.tsx`
- Consome `/metrics/usage`.

#### `Alertas.tsx`
- Consome REST `/api/alerts` + SSE `/api/alerts/stream`.
- Inclui fallback/reconnect.

#### `Relatorios.tsx`
- Gera PDF e XLSX no browser (`jspdf`, `xlsx`).
- Risco:
  - `API_BASE` hardcoded para `http://localhost:3000/api` (ignora proxy relativo e dificulta deploy fora localhost).

### `/apps/dashboard/src/index.css`, `tailwind.config.js`, `postcss.config.js`, `vite.config.ts`
- Finalidade: tema/estilo e build frontend.
- Observacao: Vite possui plugin para stub de `core-js` no bundle de `jspdf/canvg`.

---

## 5) Camada de banco (`/packages/db/src`)

### `/packages/db/src/pool.ts`
- Finalidade: pool PG, helper `query/transaction`, wrapper `db`.
- Risco:
  - helpers genericos (`insert/update`) montam SQL dinamico por nome de tabela/colunas (uso cuidadoso necessario).

### `/packages/db/src/migrate.ts`
- Finalidade: runner de migrations (`_migrations`).
- Fluxo:
  1. garante `_migrations`;
  2. le `.sql` ordenado;
  3. aplica pendentes em transacao;
  4. registra arquivo aplicado.
- Risco:
  - strings e comentarios com encoding degradado em alguns pontos;
  - `reset()` e destrutivo (esperado para dev).

### `/packages/db/src/types.ts`
- Finalidade: contrato de tipos do dominio.
- Risco de drift:
  - comentarios/escalas em alguns campos divergem do uso real em queries e frontend.

### `/packages/db/src/queries.ts` (arquivo critico, 1600+ linhas)
- Finalidade: repositorio SQL principal do sistema.
- Blocos:
  1. sellers/instance map/raw events;
  2. contatos/conversas/mensagens;
  3. STT/labels/insights/outcomes;
  4. RAG/reports;
  5. consultas admin/dashboard;
  6. followup/reviews/human review.

#### Pontos forenses relevantes
- `insertMessage` com dedup `ON CONFLICT ... DO NOTHING RETURNING *` retorna `rows[0]` sem fallback.
- `getWeeklyReport` consulta `period_start/period_end`, enquanto schema usa `week_start`.
- `approveReview/rejectReview` usam colunas `reviewer/notes`, divergentes de migration `reviewed_by/review_notes`.
- `approveReview` recebe parametro `outcome`, mas ignora no SQL (usa `suggested_outcome`).

### `/packages/db/src/queries-extended.ts`, `/repos.ts`, `/objection-resolution.ts`
- Finalidade: extensoes e experimentos de consulta.
- Uso: secundario frente a `queries.ts` (camada principal).

---

## 6) Pacotes de dominio IA e suporte

### `/packages/llm/src/index.ts`
- Finalidade: classificacao de mensagem com provedores LLM.
- Roteamento: `LLM_PROVIDER` (`kimi`, `deepseek`, `glm5`).
- Riscos:
  - fallback de chave hardcoded para GLM5.
  - sem validacao forte de schema de resposta alem de parse JSON basico.

### `/packages/stt/src/index.ts`
- Finalidade: STT via Groq; suporte a base64, URL e URL criptografada (HKDF).
- Risco:
  - fluxo de decrypt com verificacao MAC incompleta (comentada como ignorada para debug).

### `/packages/embeddings/src/index.ts`
- Finalidade: gerar embeddings com provider OpenAI-compat.
- Regras: requer `RAG_VECTOR=true` e chave configurada.

### `/packages/rag/src/index.ts`
- Finalidade: busca vetorial/textual na base de chunks.
- Fluxo: se vetorial falhar, fallback textual.

### `/packages/vision/src/index.ts`
- Finalidade: extracao textual de PDF e heuristica de comprovante sem custo de API de visao.

### `/packages/governance/src/*`
- Finalidade: regras deterministicas, limites, alertas, decisao final e notificacao.
- Observacao forense:
  - `withGovernance` existe, mas nao ha evidencia de uso direto no pipeline principal atual.
  - storage de uso/alerta em memoria (volatil, nao distribuido).

### `/packages/planner/src/*`
- Finalidade: Ralph Loop (simples e completo), analise de gaps e feedback.
- Observacao:
  - coexistem variantes (`ralphLoop`, `ralphLoopFull`, `simpleRalphLoop`), sugerindo evolucao incremental.

### `/packages/evolution/src/*`
- Finalidade: normalizacao de payload Evolution API.
- Observacao forense:
  - existe modulo duplicado/alternativo (`index.ts` e `normalizer.ts`) com sobreposicao de responsabilidade.
  - pacote nao e o caminho principal do webhook atual (API processa payload diretamente).

### `/packages/audit/src/*`
- Finalidade: logging estruturado e auditoria (`JSONL` + `audit_log` em DB).
- Risco:
  - path de logs usa composicao por `process.cwd()` e subida de diretorio, sensivel ao modo de execucao.

---

## 7) Infraestrutura e schema (`/infra`)

### `/infra/docker/Dockerfile.api` e `/infra/docker/Dockerfile.worker`
- Finalidade: build e runtime de API/worker.
- Fluxo: copia package manifests -> instala deps -> copia fontes -> compila pacotes em ordem.
- Risco: build acoplado a lista manual de pacotes.

### `/infra/migrations/001_init.sql` ... `/015_rag_chunks.sql`

#### 001_init.sql
- schema base: sellers, contacts, conversations, messages, audio_transcripts, message_labels, conversation_insights, sales_outcomes, rag_chunks, reports_daily, reports_weekly.

#### 002_human_reviews.sql
- cria `human_reviews` com colunas `reviewed_by` e `review_notes`.

#### 003_add_monthly_goal.sql
- adiciona `monthly_goal_cents` em sellers.

#### 004_seed_sellers.sql
- seed de vendedores de exemplo.

#### 005_raw_events.sql
- cria append-only store `raw_events` com unique parcial por `whatsapp_id`.

#### 006_messages_raw_event_fk.sql
- adiciona coluna/index `raw_event_id` em messages (sem constraint FK explicita).

#### 007_insights_missing_cols.sql
- adiciona `temperature` e `urgency_score` em `conversation_insights`.

#### 008_ralph_feedback.sql
- cria tabela de feedback do planner.

#### 009_message_deduplication.sql
- dedup de mensagem por `(conversation_id, whatsapp_message_id)` + indice por JSON path de `raw_event`.

#### 010_instance_seller_map.sql
- mapeia instancia Evolution para seller (multi-tenant).

#### 011_sales_outcomes_sale_type.sql
- adiciona `sale_type`, `evidence_message_ids`, `comprovante_analyzed_at`.

#### 012_sellers_email.sql
- adiciona `email` em sellers.

#### 013_audit_log.sql
- cria trilha persistente de auditoria.

#### 014_lgpd_retention.sql
- cria funcao de anonimização de contatos inativos.

#### 015_rag_chunks.sql
- recria/garante `rag_chunks` com `embedding vector(1536)`.
- risco de drift: `001` define `vector(1024)`. Em base ja existente, `CREATE TABLE IF NOT EXISTS` pode nao corrigir dimensao.

### `/infra/test-fixtures/*`
- Finalidade: fixtures para avaliacao de classificacao/golden dataset.
- Estado: estrutura e alguns exemplos presentes, sem pipeline de CI integrado no repositorio.

---

## 8) Scripts (`/scripts` e raiz) — agrupamento por responsabilidade

### Grupo A: diagnostico de fila/classificacao/mensagens
- `scripts/check-*`, `scripts/process-*`, `scripts/reprocess-*`, `scripts/queue-classify.ts`.
- Finalidade: inspecao e reprocessamento operacional.

### Grupo B: sincronizacao Evolution -> banco
- `scripts/sync-messages.mjs`, `scripts/sync-correct.mjs`.
- Finalidade: importar/sincronizar mensagens historicas.
- Risco: fallback de chave API hardcoded (`evolution-api-key-2024`).

### Grupo C: saneamento de dados
- `scripts/cleanup-sellers.*`, `scripts/fix-duplicates.mjs`, `scripts/reassign-conversations.mjs`.

### Grupo D: validacao QA
- `scripts/eval-golden.ts`, `scripts/test-webhook*.mjs`, scripts de teste na raiz (`test-*`, `verify-*`).

### Observacao de rastreabilidade
- Sao scripts de operacao e suporte, nao parte obrigatoria do runtime principal de API/worker.
- Foram classificados como secundarios, mas mantidos no inventario por impacto operacional.

---

## 9) Arquivos ignorados nesta secao (e por que)
- `apps/**/src/*.js`, `*.d.ts`, `*.map`: build outputs observados como derivados dos `.ts`.
- `packages/**/src/*.js`, `*.d.ts`, `*.map`: mesmo criterio.
- `dist/**`: artefatos compilados sem logica adicional.
- `node_modules/**`: terceiros.
- `logs/**`: dados runtime.

---

## 10) Conclusao de entendimento por modulo
- API (`apps/api`): entendimento ALTO.
- Worker (`apps/worker`): entendimento ALTO.
- DB layer e migrations (`packages/db`, `infra/migrations`): entendimento ALTO.
- Pacotes IA/governance/planner/evolution/audit: entendimento ALTO.
- Frontend dashboard (`apps/dashboard`): entendimento ALTO.
- Scripts auxiliares (raiz e `scripts/`): entendimento MEDIO-ALTO (alto para finalidade operacional; medio para garantia de uso em producao).
