# 45 - Fase 34 - Validacao

## Escopo da fase
Industrializar a trilha live da observabilidade backend-first para uso recorrente e CI-friendly, cobrindo:
1. endurecimento de shape/contrato dos endpoints observability live;
2. promovendo a Fase 33 a motor reutilizavel com evidencias estruturadas;
3. consolidacao em uma camada oficial de governanca runtime com artefatos executivos.

## Entregas principais
1. Novo fluxo oficial da fase:
- `scripts/phase34-observability-live-governance.mjs`
2. Evolucao do motor live:
- `scripts/phase33-observability-live-runtime-validation.mjs`
3. Smoke estruturado com contrato:
- `scripts/ci-api-smoke.mjs`
4. Integracao operacional:
- `package.json`
- `.github/workflows/ci.yml`
5. Documentacao:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`
- `docs/fullcycle-connectors-observability-live-governance.md`

## Contrato implementado
### Smoke estruturado
1. `scripts/ci-api-smoke.mjs` agora gera `smoke-report.json`.
2. O relatorio inclui:
- `okChecks`
- `failChecks`
- `validatedContractChecks`
- `contractFailChecks`
- `checks[]` com `statusOk`, `contractEvaluated`, `contractOk`, `contractErrors`, `contentType` e `bodyPreview`.
3. Endpoints observability live passaram a ter validadores explicitos para:
- `stream`
- `api-sla`
- `incidents`
- `alerts`
- `backend/report`
- `backend/analytics`
- `realtime/panel`
- `backend/dashboard`

### Motor live evoluido
1. `phase33-observability-live-runtime-validation.mjs` agora:
- consome o report estruturado do smoke;
- falha quando houver `contractFailChecks > 0`;
- expõe `runtimeProfile`, `infraMode`, `browserArgs`, `smokeValidatedContractChecks` e `smokeContractFailChecks`;
- aceita `FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_ARGS`;
- inclui `/usr/bin/google-chrome-stable` no discovery;
- desliga `FULLCYCLE_CONNECTOR_OBS_PANEL_AUTO_CONNECT` no dataset controlado para reduzir ruido inicial.

### Governanca live oficial
1. A Fase 34 encapsula a Fase 33 em um wrapper recorrente.
2. O wrapper:
- decide `docker-bootstrap` ou `external-services`;
- consolida status, contratos obrigatorios, artifacts e violacoes;
- publica:
  - report JSON;
  - dashboard markdown;
  - audit trail JSONL.
3. `monitor:fullcycle:observability:live` passa a apontar para a Fase 34.

## Integracao CI
1. A pipeline oficial agora possui envs dedicadas `FULLCYCLE_CONNECTOR_OBS_LIVE_*` para Fase 34.
2. Em CI:
- `FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA=false`
- Postgres/Redis sao reaproveitados dos `services`
- browser args default: `--no-sandbox,--disable-dev-shm-usage`
3. O job executa:
- `npm run test:phase34`
4. Artefatos adicionais:
- `logs/monitoring/ci-phase34-live/**`
- `ci-observability-live-governance-report.json`
- `ci-observability-live-governance.md`
- `ci-observability-live-governance-audit.jsonl`

## Validacoes executadas
1. Sintaxe:
- `node --check scripts/ci-api-smoke.mjs` => sucesso
- `node --check scripts/phase33-observability-live-runtime-validation.mjs` => sucesso
- `node --check scripts/phase34-observability-live-governance.mjs` => sucesso
2. Build:
- `npm run build -w @supervisor/api` => sucesso
3. Regressao:
- `npm run test:phase31` => sucesso
- `npm run test:phase32` => sucesso
- `npm run test:phase33` => sucesso
4. Fase principal:
- `npm run test:phase34` => sucesso
5. Alias operacional:
- `npm run monitor:fullcycle:observability:live` => sucesso

## Resultado observado
1. Status final: `pass`
2. Runtime profile validado neste turno: `desktop`
3. Infra mode validado neste turno: `docker-bootstrap`
4. Smoke:
- `smokeOk=28`
- `smokeFail=0`
- `contractValidated=16`
- `contractFail=0`
5. Checks obrigatorios da trilha live:
- `18/18` aprovados
6. Browser/headless:
- `browserConnection=connected`
- `browserExceptions=0`
7. Endpoint executivo:
- `/api/observability/connectors/backend/analytics` => `200`

## Evidencias
1. `scripts/ci-api-smoke.mjs`
2. `scripts/phase33-observability-live-runtime-validation.mjs`
3. `scripts/phase34-observability-live-governance.mjs`
4. `logs/monitoring/phase34-live/live-validation-report.json`
5. `logs/monitoring/phase34-live/smoke-report.json`
6. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
7. `docs/fullcycle-connectors-observability-live-governance.md`
8. `.github/workflows/ci.yml`

## Riscos residuais
1. O caminho CI da Fase 34 foi configurado, mas nao foi executado em runner GitHub neste turno.
2. Alguns endpoints legados da camada observability anterior ainda podem responder `503` em runtime live:
- `/api/observability/connectors/summary`
- `/api/observability/connectors/feed`
- `/api/observability/connectors/history`
- `/api/observability/connectors/dashboard`
3. Os dashboards HTML internos continuam com assets inline e dependem de CSP route-scoped permissivo.
4. O on-call segue file-based (`rotation/calendar`) sem provedor externo real nesta fase.

## Proxima fase sugerida
1. Fase 35 - convergir os endpoints legados de observabilidade para o backend-first ou garantir materializacao automatica dos payloads antigos, removendo a tolerancia atual a `503` no gate live.
