# 46 - Fase 35 - Validacao

## Escopo da fase
Convergir a trilha legada de observability (`summary`, `feed`, `history`, `dashboard`) com a arquitetura backend-first, garantindo:
1. materializacao automatica dos payloads antigos a partir dos artefatos oficiais da Fase 32;
2. eliminacao da tolerancia a `503` desses endpoints no smoke/gate live;
3. consolidacao da compatibilidade como camada operacional rastreavel.

## Entregas principais
1. Novo materializador oficial da fase:
- `scripts/phase35-observability-legacy-convergence.mjs`
2. Motor live integrado com a compatibilidade:
- `scripts/phase33-observability-live-runtime-validation.mjs`
3. Smoke endurecido:
- `scripts/ci-api-smoke.mjs`
4. Integracao operacional:
- `package.json`
- `.github/workflows/ci.yml`
5. Documentacao:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`
- `docs/fullcycle-connectors-observability-compat.md`

## Contrato implementado
### Materializacao legacy a partir do backend-first
1. `phase35-observability-legacy-convergence.mjs` reaproveita:
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE`
2. A partir disso, materializa:
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE`
3. A fase tambem publica:
- `FULLCYCLE_CONNECTOR_OBS_COMPAT_REPORT_FILE`
- `FULLCYCLE_CONNECTOR_OBS_COMPAT_DASHBOARD_FILE`
- `FULLCYCLE_CONNECTOR_OBS_COMPAT_AUDIT_FILE`

### Compatibilidade separada da saude operacional
1. A fase deixou de reprovar quando o backend reporta `warn` ou `fail`.
2. O status operacional continua registrado em `backendStatus` e `legacyStatus`.
3. O `status=pass` da Fase 35 agora significa:
- artefatos legados materializados;
- trilha antiga apta a responder `200`;
- contrato de compatibilidade satisfeito.

### Gate live endurecido
1. `scripts/ci-api-smoke.mjs` passou a exigir `200` para:
- `/api/observability/connectors/summary`
- `/api/observability/connectors/feed`
- `/api/observability/connectors/history`
- `/api/observability/connectors/dashboard`
2. `phase33-observability-live-runtime-validation.mjs` agora:
- prepara fixtures dos arquivos legados e dos artefatos `FULLCYCLE_CONNECTOR_OBS_COMPAT_*`;
- executa `phase35-observability-legacy-convergence.mjs` entre o backend da Fase 32 e o painel da Fase 31;
- inclui `compat` em `commands`, `runs`, `summary` e `artifacts`.

## Integracao CI e operacao
1. `package.json` recebeu:
- `test:phase35`
- `monitor:fullcycle:observability:compat`
2. `.github/workflows/ci.yml` passou a:
- provisionar `FULLCYCLE_CONNECTOR_OBS_COMPAT_*`;
- executar `npm run test:phase35` antes do gate live da Fase 34.
3. O fluxo oficial `monitor:fullcycle:observability:live` continua sendo o wrapper da Fase 34, mas agora embute a convergencia legada da Fase 35.

## Validacoes executadas
1. Sintaxe:
- `node --check scripts/phase35-observability-legacy-convergence.mjs` => sucesso
- `node --check scripts/phase33-observability-live-runtime-validation.mjs` => sucesso
- `node --check scripts/ci-api-smoke.mjs` => sucesso
2. Build:
- `npm run build -w @supervisor/api` => sucesso
3. Regressao:
- `npm run test:phase32` => sucesso
- `npm run test:phase33` => sucesso
- `npm run test:phase34` => sucesso
4. Fase principal:
- `npm run test:phase35` => sucesso
5. Operacao:
- `npm run monitor:fullcycle:observability:compat` => sucesso
- `npm run monitor:fullcycle:observability:live` => sucesso

## Resultado observado
1. Fase 35 standalone:
- `status=pass`
- `compatibilityMode=materialized_from_backend_first`
- `backendStatus=warn`
- `legacyStatus=warn`
- `generatedFiles=5`
2. Gate live oficial:
- `status=pass`
- `smokeOk=28`
- `smokeFail=0`
- `smokeValidatedContractChecks=20`
- `smokeContractFailChecks=0`
- `requiredChecks=18/18`
- `legacyCompatStatus=pass`
- `browserPanelConnection=connected`
- `analyticsStatus=200`
3. Endpoints legados endurecidos no smoke live:
- `observability_summary` => `200`
- `observability_feed` => `200`
- `observability_history` => `200`
- `observability_dashboard` => `200`

## Evidencias
1. `scripts/phase35-observability-legacy-convergence.mjs`
2. `scripts/phase33-observability-live-runtime-validation.mjs`
3. `scripts/ci-api-smoke.mjs`
4. `docs/fullcycle-connectors-observability-compat.md`
5. `logs/monitoring/fullcycle-connector-observability-compat-report.json`
6. `logs/monitoring/phase34-live/live-validation-report.json`
7. `logs/monitoring/phase34-live/smoke-report.json`
8. `.github/workflows/ci.yml`

## Riscos residuais
1. O caminho das Fases 34/35 foi preparado para CI, mas ainda nao foi executado em runner GitHub real neste turno.
2. O painel headless ainda registra requisicoes `401` no bootstrap inicial antes da aplicacao do `adminKey`; o refresh autenticado subsequente corrige o estado, mas o ruido permanece no log.
3. Os dashboards HTML internos continuam com assets inline e seguem dependentes de CSP route-scoped permissivo.
4. O on-call permanece file-based (`rotation/calendar`) sem provedor externo real.

## Proxima fase sugerida
1. Fase 36 - validar a trilha live/compat em runner GitHub real e reduzir o ruido de autenticacao inicial do painel, consolidando o gate como referencia final de CI.
