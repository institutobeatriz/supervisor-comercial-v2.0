# 44 - Fase 33 - Validacao

## Escopo da fase
Fechar o gap de runtime real da trilha de observabilidade backend-first por meio de:
1. smoke live da API interna com endpoints observability expandidos;
2. validacao browser/headless do painel operacional consumindo a API real;
3. prova executiva adicional do endpoint `/api/observability/connectors/backend/analytics`;
4. registro dos gaps reais encontrados em runtime e sua correcao sustentada.

## Entregas principais
1. Script oficial da fase:
- `scripts/phase33-observability-live-runtime-validation.mjs`
2. Correcao de runtime na API:
- `apps/api/src/routes/observability.ts`
3. Integracao operacional:
- `package.json`
4. Documentacao:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Gaps reais encontrados em runtime
### Gap 1 - CSP bloqueando dashboards HTML internos
1. A API estava com `helmet` global publicando CSP que bloqueava o `<script>` inline do painel.
2. Evidencia observada no browser headless:
- `Executing inline script violates the following Content Security Policy directive 'script-src 'self''`.
3. Impacto:
- o painel carregava HTML/CSS, mas o script nao executava;
- `activityLog` permanecia vazio;
- a automacao headless nunca conseguia validar `loadBackend`/`connectSse`.
4. Correcao aplicada:
- a rota de dashboards HTML internos em `apps/api/src/routes/observability.ts` passou a aplicar CSP especifico para dashboard, permitindo `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'` e `connect-src` compativel com `fetch`/SSE.

### Gap 2 - falso negativo visual por filtro local de periodo
1. O dataset controlado da fase usa timestamps historicos.
2. O painel renderiza com filtro local default `24h`.
3. Impacto:
- a API retornava `api-sla/history` corretamente em perfil `executive`;
- o painel logava `backend refresh ok ... sla=2 role=executive`;
- mas a UI exibia `slaMeta=summary only` por filtro local, nao por falha de backend.
4. Correcao aplicada:
- a automacao headless passou a fixar `period=all` antes do refresh manual.

## Contrato implementado
### Validacao live completa
1. A Fase 33 prepara fixtures controladas em `logs/monitoring/phase33-live/fixtures`.
2. Reusa os geradores oficiais:
- `scripts/phase32-observability-backend-oncall-analytics.mjs`
- `scripts/phase31-observability-panel-backend-integration.mjs`
3. Sobe infraestrutura temporaria quando habilitado:
- Postgres com `pgvector/pgvector:pg16`
- Redis `redis:7-alpine`
4. Inicializa a API buildada em porta dedicada com envs da fase.
5. Executa `scripts/ci-api-smoke.mjs` contra a API live.
6. Valida o painel em Edge/Chrome headless via CDP:
- carrega a rota `/api/observability/connectors/realtime/panel`;
- preenche `apiBase`, `adminKey`, `role=executive`, `limit` e `period=all`;
- dispara refresh e conexao SSE;
- captura screenshot, DOM e log do browser.
7. Consulta `/api/observability/connectors/backend/analytics` com RBAC executivo como prova final.

### Artefatos de auditoria
1. `logs/monitoring/phase33-live/live-validation-report.json`
2. `logs/monitoring/phase33-live/live-validation-audit.jsonl`
3. `logs/monitoring/phase33-live/panel-screenshot.png`
4. `logs/monitoring/phase33-live/panel-dom.html`
5. `logs/monitoring/phase33-live/api.log`
6. `logs/monitoring/phase33-live/browser.log`

## Validacoes executadas
1. Sintaxe:
- `node --check scripts/phase33-observability-live-runtime-validation.mjs` => sucesso
2. Build/API:
- `npm run build -w @supervisor/api` => sucesso
3. Fase principal:
- `npm run test:phase33` => sucesso
4. Regressao:
- `npm run test:phase31` => sucesso
- `npm run test:phase32` => sucesso
5. Operacao:
- `npm run monitor:fullcycle:observability:live` => sucesso

## Resultado observado
1. O smoke live concluiu com `smokeOk=28` e `smokeFail=0`.
2. O painel headless concluiu com:
- `panelConnection=connected`
- `incidentsMeta=1 visible`
- `alertsMeta=1 visible`
- `slaMeta=2 points`
- `trackedTeams=2`
3. O endpoint executivo `/api/observability/connectors/backend/analytics` respondeu `200` com `analyticsCoveragePct=100`.
4. A trilha backend-first passa a estar validada em runtime real, e nao apenas por drill/gate controlado.

## Evidencias
1. Script e contrato:
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `apps/api/src/routes/observability.ts`
- `package.json`
2. Relatorios runtime:
- `logs/monitoring/phase33-live/live-validation-report.json`
- `logs/monitoring/phase33-live/live-validation-audit.jsonl`
3. Evidencia visual/runtime:
- `logs/monitoring/phase33-live/panel-screenshot.png`
- `logs/monitoring/phase33-live/panel-dom.html`
- `logs/monitoring/phase33-live/browser.log`
- `logs/monitoring/phase33-live/api.log`

## Riscos residuais
1. A validacao live/headless ainda nao esta integrada ao CI oficial; hoje depende de browser local + Docker runtime.
2. O on-call continua file-based (`rotation/calendar`) sem provedor externo real.
3. Os dashboards HTML internos continuam dependentes de assets inline; o comportamento agora esta correto por CSP especifico de rota, mas ainda merece futura industrializacao se a politica global endurecer mais.

## Proxima fase sugerida
1. Fase 34 - industrializar a validacao live/browser da observabilidade para rotina recorrente e endurecer asserts de shape/contrato dos endpoints observability live.
