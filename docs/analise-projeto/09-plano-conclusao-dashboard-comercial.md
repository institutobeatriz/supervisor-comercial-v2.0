# 09 - Plano de Conclusao do Dashboard Comercial

## 1) Objetivo
Concluir o dashboard comercial com padrao de software house premium, garantindo:
- corretude de dados ponta a ponta;
- estabilidade de APIs e webhooks;
- funcionamento real dos pipelines de IA (LLM, STT, Vision, RAG);
- seguranca operacional;
- cobertura de testes automatizados e validacao manual guiada;
- documentacao e operacao sustentaveis.

Base deste plano: relatorios forenses `00` a `08` em `docs/analise-projeto`.

## 2) Escopo de conclusao
Inclui:
- API (`apps/api`) e worker (`apps/worker`);
- dashboard web (`apps/dashboard`);
- banco e migrations (`infra/migrations`, `packages/db`);
- pacotes IA (`llm`, `stt`, `vision`, `rag`, `embeddings`, `governance`, `planner`);
- scripts operacionais e de validacao;
- Docker/compose e pipeline CI minima.

Nao inclui:
- app mobile nativo (escopo atual e web dashboard).

## 3) Governanca de execucao (equipe premium)
Atuacao coordenada por trilhas:

1. Tech Lead
- priorizacao, sequenciamento, criterios de aceite e controle de risco.

2. Arquiteto
- padronizacao de contratos API/DB, limites entre camadas, eliminacao de drift.

3. Backend + Banco
- correcoes de schema/queries/webhooks/workers e integridade de dados.

4. Frontend + UI/UX
- fechamento visual/profissional, estados completos, consistencia com APIs reais.

5. QA
- estrategia de teste, matriz de cobertura, regressao e evidencias.

6. DevOps
- ambientes, logs, variaveis, compose, CI, observabilidade e runbook.

7. Seguranca/Performance
- segredos, auth, hardening, gargalos e limites.

## 4) Priorizacao macro
`P0` (bloqueante): seguranca, integridade de dados, erros de runtime e drift de schema.
`P1` (alto impacto): corretude de KPI, confiabilidade de pipelines IA, cobertura de testes e observabilidade.
`P2` (evolucao): refinamentos de UX, performance avancada, limpeza tecnica residual.

## 5) Fases de execucao

## Fase 0 - Baseline e controle de mudanca (Dia 1)
Objetivo: criar baseline reproduzivel para validar cada correcao.

Entregas:
1. Congelar contrato de ambiente (`.env`) e unificar `EVOLUTION_URL` vs `EVOLUTION_API_URL`.
2. Definir comando oficial unico de subida local (API + worker + DB + Redis).
3. Gerar snapshot baseline:
- health da API;
- filas BullMQ ativas;
- contagem de eventos/mensagens/labels/outcomes;
- screenshot dos principais paines do dashboard.
4. Criar board de execucao com IDs de issue (`P0-*`, `P1-*`, `P2-*`).

Critério de aceite:
- ambiente sobe de forma padrao em 1 comando documentado;
- baseline registrado e replicavel.

## Fase 1 - Correcao P0 de seguranca e schema (Dias 1-3)
Objetivo: eliminar riscos criticos identificados.

Backlog P0:
1. `P0-SEC-01` remover segredos hardcoded:
- `packages/llm/src/index.ts`;
- `apps/api/src/routes/reviews.ts`;
- `apps/dashboard/src/pages/Reviews.tsx`;
- scripts com chaves default.

2. `P0-SEC-02` corrigir autenticacao admin:
- sem chave em frontend;
- auth obrigatoria no backend em ambiente nao-dev;
- negar bootstrap se variavel obrigatoria faltar.

3. `P0-DB-01` alinhar `human_reviews`:
- corrigir drift `reviewed_by/review_notes` vs `reviewer/notes`;
- migration de compatibilidade;
- ajuste em queries e rotas.

4. `P0-API-01` corrigir `/api/conversations/:id`:
- remover colunas inexistentes;
- consolidar dados de `messages` com `message_labels`;
- garantir contrato estavel para frontend.

5. `P0-API-02` corrigir deduplicacao segura:
- tratar conflito em `insertMessage`;
- nunca referenciar `msg.id` nulo;
- garantir idempotencia fim-a-fim no webhook.

Critério de aceite:
- zero segredos em codigo;
- fluxo de review aprovado/rejeitado sem erro SQL;
- detalhe de conversa responde 200 com payload valido;
- eventos duplicados nao quebram pipeline.

## Fase 2 - Estabilizacao de dados e metricas (Dias 3-5)
Objetivo: garantir que o dashboard reflete dados corretos e consistentes.

Backlog P1:
1. `P1-DATA-01` padronizar formula de conversao em todo sistema.
2. `P1-DATA-02` normalizar escala de sentimento e thresholds de alerta.
3. `P1-DATA-03` revisar `reports_weekly` (`week_start` vs queries `period_*`).
4. `P1-DATA-04` tratar `alert_history`:
- criar migration oficial; ou
- remover endpoint ate suporte real.
5. `P1-DATA-05` resolver dimensao `rag_chunks.embedding` (1024 vs 1536).

Critério de aceite:
- mesmos numeros de conversao em endpoints e telas equivalentes;
- consultas nao usam colunas inexistentes;
- migrations novas sobem em banco limpo sem falha.

## Fase 3 - Testes de APIs e contratos (Dias 5-7)
Objetivo: cobrir todas APIs com testes automatizados de contrato e integracao.

Suite a implementar:
1. Testes de contrato HTTP (status/schema) para:
- `/health`;
- `/webhooks/evolution`;
- `/api/conversations` e `/api/conversations/:id`;
- `/api/dashboard/*` (todos endpoints expostos);
- `/api/alerts`, `/api/alerts/stream`, `/api/alerts/history`;
- `/api/reviews*`;
- `/api/metrics/usage`;
- `/events`, `/events/stats`, `/internal/emit`;
- `/admin/*` (com auth).

2. Testes de integracao DB:
- ingestao webhook grava `raw_events`, `messages`, `conversations`;
- workers geram `message_labels`, `conversation_insights`, `sales_outcomes`;
- rotas de dashboard retornam agregados corretos para fixture conhecida.

3. Testes de regressao para bugs forenses:
- dedup;
- review SQL;
- detalhe conversa;
- formula de conversao;
- alert history.

Critério de aceite:
- cobertura de contrato para 100% dos endpoints ativos;
- sem regressao nos casos P0/P1.

## Fase 4 - Testes de webhooks e pipelines assinc (Dias 7-9)
Objetivo: validar funcionamento real dos eventos e filas.

Matriz webhook obrigatoria:
1. `messages.upsert` texto inbound.
2. `send.message` texto outbound relevante.
3. Audio inbound:
- com base64 disponivel;
- sem base64 com fallback `mediaKey`.
4. Image inbound com comprovante.
5. Document PDF inbound.
6. Evento duplicado (mesmo `whatsapp_message_id`).
7. Evento invalido e evento nao suportado.
8. Auth webhook com e sem segredo.

Matriz fila obrigatoria:
1. `classify`, `stt`, `vision`, `analyze`, `rag-index`, `report`.
2. retry/backoff e comportamento em falha externa (LLM/STT/Evolution).
3. garantia de nao travamento em payload invalido.

Critério de aceite:
- todos cenarios executados com evidencias (logs + asserts DB);
- nenhuma fila critica com erro nao tratado.

## Fase 5 - Validacao de LLM/STT/Vision/RAG (Dias 9-12)
Objetivo: confirmar que cada IA faz seu papel com metrica minima.

Trilha LLM (`packages/llm`):
1. validar schema de saida em 100% das respostas (sem parse fragil).
2. testar fallback entre provedores com indisponibilidade simulada.
3. medir precisao com fixtures reais:
- expandir `infra/test-fixtures`;
- evoluir `scripts/eval-golden.ts` para avaliacao real de classificacao.

Trilha STT (`packages/stt`):
1. suite com audios curtos/longos/ruidosos.
2. validar caminho base64, URL e URL criptografada.
3. revisar seguranca de decrypt (MAC check).

Trilha Vision (`packages/vision` + worker):
1. validar comprovante verdadeiro/falso (matriz de falsos positivos).
2. ajustar branch PDF para caminho real (sem dependencia morta de `job.data.base64`).

Trilha RAG (`packages/rag` + `embeddings`):
1. validar indexacao por chunks e busca vetorial/textual.
2. fallback textual quando embedding indisponivel.
3. consistencia de dimensao e custos.

Critério de aceite:
- metrica minima definida e atingida por trilha;
- fallback funcional em falha de provider externo.

## Fase 6 - Fechamento do dashboard comercial (Dias 12-14)
Objetivo: concluir produto visual e funcional no frontend.

Backlog:
1. remover hardcodes de ambiente (`API_BASE`) e chave admin.
2. alinhar todos contratos de tela com payload real da API.
3. estados completos por tela:
- loading;
- vazio;
- erro;
- sucesso;
- desabilitado.
4. consistencia visual:
- tipografia, espacamento, hierarquia;
- padrao de componentes;
- feedback de acao.
5. validacao de exportacao PDF/XLSX com dados reais.

Critério de aceite:
- dashboard navegavel fim-a-fim sem erro de console;
- dados consistentes com DB nos modulos Executivo, Funil, Performance, Produtos, Conversas, Alertas, Reviews e Relatorios.

## Fase 7 - DevOps, observabilidade e CI (Dias 14-16)
Objetivo: tornar entrega sustentavel fora da maquina local.

Entregas:
1. padronizar logs:
- remover caminhos absolutos;
- `AUDIT_LOG_DIR` configuravel.
2. healthchecks e readiness para API/worker.
3. pipeline CI minima:
- lint;
- typecheck;
- build;
- testes de contrato/integracao essenciais.
4. runbook operacional:
- start/stop oficial;
- rollback;
- troubleshooting webhook/filas/LLM.
5. desativar scripts legados ambigos de worker.

Critério de aceite:
- CI bloqueia merge com falha;
- novo ambiente sobe sem ajustes manuais ocultos.

## Fase 8 - Performance frontend e custo de carregamento (Pos Fase 7)
Objetivo: reduzir custo de carregamento inicial do dashboard sem regressao funcional.

Entregas:
1. code splitting por modulo/pagina;
2. imports dinamicos para bibliotecas pesadas de exportacao;
3. eliminacao de dependencias circulares que prejudiquem chunking;
4. validacao de build sem warning de chunk > 500kb.

Critério de aceite:
- build do dashboard sem warning de chunk > 500kb;
- lint/typecheck/build globais passando;
- exportacoes PDF/XLSX preservadas.

## 6) Matriz de validacao de dados ponta a ponta
Para cada evento de teste, validar rastreabilidade:

1. Entrada
- registro em `raw_events` com `event_type`, `instance_name`, `whatsapp_id`.

2. Persistencia operacional
- `contacts`, `conversations`, `messages` com chaves consistentes.

3. Processamento IA
- `message_labels` preenchido;
- `conversation_insights` atualizado;
- `sales_outcomes` quando aplicavel.

4. Exposicao API
- endpoints retornam os mesmos totais esperados para o caso.

5. UI
- card/grafico/tabela refletem os mesmos valores.

6. Auditoria
- `audit_log` e JSONL com `trace_id` correlacionavel.

## 7) Criterios de pronto (Definition of Done)
So considerar concluido quando:
1. `P0` e `P1` fechados.
2. API e worker com testes automatizados passando.
3. Webhooks validados em todos os cenarios principais e de falha.
4. LLM/STT/Vision/RAG com metricas minimas e fallback comprovado.
5. Dashboard sem hardcodes sensiveis e sem erros de contrato.
6. CI ativa com gates de qualidade.
7. Documentacao operacional e tecnica atualizada.

## 8) Plano de execucao imediato (proxima iteracao)
Sequencia recomendada para iniciar agora:
1. Fase 0 completa.
2. Fase 1 completa.
3. Fase 2 em paralelo com inicio da Fase 3.
4. Fase 4 e Fase 5 com fixtures controladas.
5. Fase 6 e Fase 7 para fechamento de entrega.
6. Fase 8 para consolidacao de performance frontend.

Resultado esperado ao final:
- dashboard comercial pronto para operacao real com dados confiaveis;
- pipelines IA auditaveis e estaveis;
- base tecnica sustentavel para novas features sem retrabalho estrutural.
