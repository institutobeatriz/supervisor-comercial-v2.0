# 06 - Riscos Tecnicos

## Escopo
Riscos priorizados por impacto operacional, corretude de negocio, seguranca e manutencao.

Escala usada:
- `Critico`: pode quebrar fluxo principal ou comprometer dados/seguranca.
- `Alto`: pode gerar erro recorrente, metrica incorreta ou fragilidade grave.
- `Medio`: gera inconsistencias relevantes, mas com impacto controlavel.
- `Baixo`: melhoria recomendada e debito tecnico de menor urgencia.

---

## 1) Riscos criticos

| ID | Risco | Evidencia | Impacto | Mitigacao recomendada |
|---|---|---|---|---|
| R-CRIT-01 | Segredos hardcoded em codigo | `packages/llm/src/index.ts`, `apps/api/src/routes/reviews.ts`, `apps/dashboard/src/pages/Reviews.tsx`, scripts sync/test | Exposicao de credenciais, acesso indevido, risco de vazamento em VCS/log | remover fallbacks sensiveis, exigir env obrigatoria, rotacionar chaves, auditar historico Git |
| R-CRIT-02 | Drift schema x SQL no fluxo de revisao humana | migration `002_human_reviews.sql` usa `reviewed_by/review_notes`; queries usam `reviewer/notes` | aprovacao/rejeicao pode falhar em runtime ou gravar incorretamente | alinhar DDL/SQL, adicionar migration de compatibilidade, criar testes de integracao do fluxo review |
| R-CRIT-03 | Endpoint de conversa detalhada consulta colunas inexistentes | `apps/api/src/routes/conversations.ts` (`role`, `media_type`, `sentiment`, `is_purchase_intent` em `messages`) | erro 500 em detalhe de conversa, UI quebrada, perda de rastreabilidade operacional | corrigir SQL para usar schema real (`messages` + `message_labels`) e adicionar teste de endpoint |
| R-CRIT-04 | Credencial de admin no frontend | `apps/dashboard/src/pages/Reviews.tsx` | qualquer cliente com bundle pode obter chave e operar revisoes | remover chave do frontend, usar auth server-side com sessao/JWT e permissao de perfil |

---

## 2) Riscos altos

| ID | Risco | Evidencia | Impacto | Mitigacao recomendada |
|---|---|---|---|---|
| R-ALT-01 | Deduplicacao incompleta no fluxo webhook->message | `insertMessage` pode retornar vazio em conflito; webhook continua usando `msg.id` | crash intermitente, fila inconsistente, perda de eventos | tratar conflito explicitamente (buscar msg existente ou abortar processamento) |
| R-ALT-02 | Formula de conversao inconsistente entre camadas | DB usa `won/(won+lost)`; API KPI usa `won/leads_received` | KPI divergente por endpoint, decisao gerencial errada | padronizar formula unica e centralizar calculo em camada DB/service |
| R-ALT-03 | Escala de sentimento inconsistente | `message_labels.sentiment` smallint; consultas usam thresholds `30/40/80` em alguns pontos | alertas e analises semanticas incorretas | normalizar escala (1-5 ou 0-100) e revisar SQL/typing em API e frontend |
| R-ALT-04 | `alert_history` sem migration no repositorio | `/alerts/history` consulta tabela nao versionada | endpoint falha em ambientes novos | versionar migration da tabela ou remover rota ate existir suporte |
| R-ALT-05 | Caminho absoluto para logs em metricas | `apps/api/src/routes/metrics.ts` | quebra fora da maquina de desenvolvimento | usar caminho relativo/configuravel (`AUDIT_LOG_DIR`) |
| R-ALT-06 | Entrypoints legados de worker apontam artefato errado | `run-worker.cmd`, `run-worker.ps1`, `worker-entry.mjs` -> `dist/worker.mjs` | falha de start/restart em operacao local | unificar runbook e remover scripts obsoletos |
| R-ALT-07 | `ADMIN_API_KEY` opcional em `/admin` | se env ausente, auth e ignorada (`checkAdminAuth`) | acesso nao autenticado a rotas administrativas | tornar auth obrigatoria em producao e falhar no boot sem chave |

---

## 3) Riscos medios

| ID | Risco | Evidencia | Impacto | Mitigacao recomendada |
|---|---|---|---|---|
| R-MED-01 | Branch PDF do vision parcialmente desconectada | worker exige `job.data.base64`, webhook nao envia `base64` no job vision | cobertura incompleta de documentos PDF | padronizar payload do job e/ou remover branch morta |
| R-MED-02 | `withGovernance` sem integracao clara no pipeline principal | funcao existe, nao encontrada em uso direto | limite/governanca pode nao ser aplicado de forma uniforme | integrar wrapper em todos os workers criticos e testar |
| R-MED-03 | `STRUCTURE.md` e docs de arquitetura desatualizados | caminhos nao existem e status divergentes | onboarding tecnico enganoso, aumento de erro de manutencao | atualizar docs com CI de validacao minima de paths |
| R-MED-04 | Armazenamento de uso/alertas em memoria no governance | `limits.ts`, `alerts.ts` | perda de estado em restart e nao distribuido | mover para Redis/DB para consistencia entre instancias |
| R-MED-05 | Logger de auditoria depende de `process.cwd()` | `packages/audit/src/logger.ts` | logs podem ir para diretorio inesperado | resolver caminho por env explicita + fallback robusto |
| R-MED-06 | Tipos e comentarios em `types.ts` nao refletem uso real | ex.: escala de sentimento e estagios | falso senso de contrato de dados | revisar tipos com base nas migrations e queries reais |
| R-MED-07 | `.claude/settings.json` invalido | JSON misturado com markdown apos fechamento | tooling que depende desse arquivo pode falhar | separar conteudo explicativo e manter JSON valido |

---

## 4) Riscos baixos (debitos tecnicos)

| ID | Risco | Evidencia | Impacto | Mitigacao recomendada |
|---|---|---|---|---|
| R-LOW-01 | Codigo residual/nao usado no frontend | `App.tsx` (`API_BASE`, `buildQuery`), coexistencia de hooks legados | ruído de manutencao | limpeza e padronizacao de client API |
| R-LOW-02 | Scripts utilitarios sem governanca formal | dezenas de scripts ad-hoc na raiz e `scripts/` | operacao dependente de conhecimento tacito | documentar runbook e classificar scripts oficiais |
| R-LOW-03 | Endpoint admin `/ui` embute HTML extenso em string | `apps/api/src/routes/admin.ts` | manutencao dificil, mistura de responsabilidades | mover UI admin para arquivo/template dedicado |

---

## 5) Priorizacao de correcoes sugerida

1. **Seguranca e integridade**
- remover segredos hardcoded + rotacionar chaves;
- corrigir auth de admin obrigatoria;
- alinhar schema/SQL de revisao humana.

2. **Corretude de dados e KPIs**
- corrigir `conversations/:id`;
- padronizar formula de conversao e escala de sentimento;
- resolver dedup e tratamento de conflito de mensagem.

3. **Confiabilidade operacional**
- corrigir `metrics` path absoluto;
- unificar scripts de start/worker;
- versionar `alert_history` (ou remover endpoint).

4. **Governanca e manutencao**
- integrar middleware de governanca no pipeline principal;
- atualizar documentacao estrutural;
- consolidar scripts operacionais oficiais.
