# Runbook Operacional - Supervisor Comercial

## Objetivo
Este runbook define o procedimento oficial de operacao para API, worker, filas, webhook e observabilidade.

## Comandos oficiais
- Nao usar scripts legados de worker: `run-worker.*` e `start-worker.ps1`.
- Subida local oficial: `npm run local:up`.
- API local: `npm run dev:api` ou `npm run start:api`.
- Worker local: `npm run dev:worker` ou `npm run start:worker`.
- Infra local (somente Postgres/Redis): `npm run local:infra`.

## Modos de operacao

### Modo A - all-in-docker
1. Configurar `.env` a partir de `.env.example`.
2. Subir stack completa:
```bash
docker compose --profile all-in-docker up -d --build
```
3. Verificar status:
```bash
docker compose ps
```
4. Esperado:
- `supervisor-api` em `healthy`
- `supervisor-worker` em `healthy`
- `supervisor-postgres` em `healthy`
- `supervisor-redis` em `healthy`

### Modo B - infra em Docker + app local
1. Subir infra:
```bash
docker compose --profile infra-only up -d
```
2. Instalar deps e build:
```bash
npm install
npm run build
```
3. Subir API + worker local:
```bash
npm run local:up
```

## Health e readiness

### API
- Health: `GET /health`
- Readiness: `GET /ready`

Verificacao rapida:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### Worker
- Health interno: `GET /health` (porta `WORKER_HEALTH_PORT`, default `3002`)
- Readiness interna: `GET /ready`

No Docker, a porta do worker nao e publicada por padrao.
Verificacao pelo container:
```bash
docker compose exec -T worker node -e "fetch('http://127.0.0.1:3002/health').then(r=>r.text()).then(console.log)"
docker compose exec -T worker node -e "fetch('http://127.0.0.1:3002/ready').then(r=>r.text()).then(console.log)"
```

## Smoke de API (CI/local)
Executar:
```bash
npm run test:ci:api-smoke
```
Cobertura:
- `/health`, `/ready`
- KPIs e endpoints principais do dashboard
- conversas, alertas e metricas de uso

## Monitoramento externo e SLO
Executar probe sintetico:
```bash
npm run monitor:check
```

Comportamento:
1. grava relatorio em `logs/monitoring/last-report.json`;
2. atualiza janela SLO em `logs/monitoring/slo-state.json`;
3. atualiza lifecycle de incidentes em `logs/monitoring/incidents.json`;
4. abre incidente quando check critico falha ou quando disponibilidade cai abaixo da meta;
4. envia alerta webhook se `MONITOR_ALERT_WEBHOOK_URL` estiver configurada.

Variaveis principais:
1. `MONITOR_API_BASE`
2. `MONITOR_DOCKER_WORKER_CHECK`
3. `MONITOR_DOCKER_WORKER_CONTAINER`
4. `MONITOR_SLO_API_AVAILABILITY`
5. `MONITOR_SLO_WORKER_AVAILABILITY`
6. `MONITOR_EXIT_ON_INCIDENT`
7. `MONITOR_ALERT_SLACK_WEBHOOK_URL`
8. `MONITOR_ALERT_DISCORD_WEBHOOK_URL`
9. `MONITOR_ALERT_TELEGRAM_BOT_TOKEN`
10. `MONITOR_ALERT_TELEGRAM_CHAT_ID`

Referencia detalhada:
- `docs/monitoramento-externo.md`

Chaos drills (resposta a incidente):
```bash
npm run monitor:chaos
```

Relatorio de confiabilidade (MTTD/MTTR):
```bash
npm run monitor:reliability
```

Dashboard de confiabilidade:
```bash
npm run monitor:dashboard
```

Postmortem assistido:
```bash
npm run monitor:postmortem
```

Drill completo de automacao de confiabilidade (Fase 13):
```bash
npm run test:phase13
```

Sincronizacao com paging/ITSM (Fase 14):
```bash
npm run monitor:itsm
```

Drill de integracao paging/ITSM:
```bash
npm run test:phase14
```

Dashboard on-call executivo (Fase 15):
```bash
npm run monitor:oncall
```

Drill executivo SLA/on-call:
```bash
npm run test:phase15
```

Governanca enterprise (Fase 16):
```bash
npm run monitor:governance
```

Drill de governanca:
```bash
npm run test:phase16
```

Governanca full-cycle (Fase 17):
```bash
npm run monitor:fullcycle
```

Drill de governanca full-cycle:
```bash
npm run test:phase17
```

Execucao ativa full-cycle (Fase 18):
```bash
npm run monitor:fullcycle:execute
```

Drill de execucao ativa:
```bash
npm run test:phase18
```

Loop de convergencia full-cycle (Fase 19):
```bash
npm run monitor:fullcycle:loop
```

Drill do loop:
```bash
npm run test:phase19
```

Hardening de conectores enterprise (Fase 20):
```bash
npm run test:phase20
```

Runtime de conectores enterprise (Fase 21):
```bash
npm run test:phase21
npm run monitor:fullcycle:connectors
```

Readiness de homologacao de conectores (Fase 22):
```bash
npm run test:phase22
npm run monitor:fullcycle:readiness
```

Consolidacao produtiva de conectores (Fase 23):
```bash
npm run test:phase23
npm run monitor:fullcycle:consolidation
```

Industrializacao do observability layer (Fase 24):
```bash
npm run test:phase24
npm run monitor:fullcycle:observability
```

Productizacao da observabilidade (Fase 25):
```bash
npm run test:phase25
npm run monitor:fullcycle:productization
```

Governanca da API interna de observabilidade (Fase 26):
```bash
npm run test:phase26
npm run monitor:fullcycle:observability:api
```

Observabilidade executiva em tempo real (Fase 27):
```bash
npm run test:phase27
npm run monitor:fullcycle:observability:realtime
```

Alerting proativo da observabilidade realtime (Fase 28):
```bash
npm run test:phase28
npm run monitor:fullcycle:observability:alerting
```

Painel operacional interativo realtime (Fase 29):
```bash
npm run test:phase29
npm run monitor:fullcycle:observability:panel
```

Backend dedicado de incidents/alerts (Fase 30):
```bash
npm run test:phase30
npm run monitor:fullcycle:observability:backend
```

Painel operacional backend-first (Fase 31):
```bash
npm run test:phase31
npm run monitor:fullcycle:observability:panel
```
O comando oficial do painel passa a consumir `incidents`, `alerts`, `api-sla/summary|history` e `backend/report`, eliminando bootstrap local legado e habilitando filtro por equipe. Execute `monitor:fullcycle:observability:backend` antes do painel quando o store dedicado ainda nao tiver sido gerado na execucao corrente.

Owner dinamico + analytics historico do backend dedicado (Fase 32):
```bash
npm run test:phase32
npm run monitor:fullcycle:observability:backend
```
O backend oficial passa a resolver owner por rotacao/calendario de plantao, calcular cobertura de ownership, controlar escalations pendentes e publicar historico em `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE`.

Validacao live da API interna + painel headless (Fase 33):
```bash
npm run test:phase33
```
Capacidades:
1. gera fixtures controladas do backend/painel;
2. sobe Postgres `pgvector` e Redis temporarios via Docker quando `FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA=true`;
3. inicializa a API buildada em porta dedicada;
4. executa `scripts/ci-api-smoke.mjs` contra a API live;
5. valida o painel em Edge/Chrome headless via CDP, com screenshot, DOM e logs;
6. consulta `/api/observability/connectors/backend/analytics` como validacao executiva final.

Artefatos da Fase 33:
1. `logs/monitoring/phase33-live/live-validation-report.json`
2. `logs/monitoring/phase33-live/live-validation-audit.jsonl`
3. `logs/monitoring/phase33-live/panel-screenshot.png`
4. `logs/monitoring/phase33-live/panel-dom.html`
5. `logs/monitoring/phase33-live/api.log`
6. `logs/monitoring/phase33-live/browser.log`

Governanca live recorrente da observabilidade (Fase 34):
```bash
npm run test:phase34
npm run monitor:fullcycle:observability:live
```
Capacidades adicionais:
1. promove a validacao live da Fase 33 para um fluxo oficial e recorrente;
2. consolida governanca runtime em relatorio JSON, dashboard markdown e audit trail JSONL;
3. exige shape/contrato dos endpoints observability live via `scripts/ci-api-smoke.mjs`;
4. funciona em modo `docker-bootstrap` ou `external-services`, favorecendo CI com Postgres/Redis ja provisionados;
5. publica checks obrigatorios da trilha live em um unico artefato executivo.
6. a partir da Fase 35, materializa automaticamente `summary`, `feed`, `history` e `dashboard` da trilha legada para eliminar `503` tolerado no gate live.

Convergencia da trilha legada de observability (Fase 35):
```bash
npm run test:phase35
npm run monitor:fullcycle:observability:compat
```
Capacidades adicionais:
1. reaproveita o backend-first da Fase 32 para gerar payloads legados em runtime;
2. materializa `FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE`, `REPORT_FILE`, `FEED_FILE`, `API_PAYLOAD_FILE` e `DASHBOARD_FILE`;
3. publica relatorio/dash/audit dedicados em `FULLCYCLE_CONNECTOR_OBS_COMPAT_*`;
4. endurece o smoke/live para exigir HTTP `200` em `summary`, `feed`, `history` e `dashboard`.

Artefatos da Fase 34:
1. `logs/monitoring/phase34-live/live-validation-report.json`
2. `logs/monitoring/phase34-live/smoke-report.json`
3. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
4. `docs/fullcycle-connectors-observability-live-governance.md`
5. `logs/monitoring/fullcycle-connector-observability-live-governance-audit.jsonl`
6. `logs/monitoring/fullcycle-connector-observability-compat-report.json`
7. `docs/fullcycle-connectors-observability-compat.md`
8. `logs/monitoring/fullcycle-connector-observability-compat-audit.jsonl`

Playbook de resposta:
- `docs/playbook-incidentes.md`

Dashboard e postmortems:
- `docs/reliability-dashboard.md`
- `docs/postmortems/`

## Gate de confiabilidade no CI
A pipeline oficial executa monitoramento operacional apos o smoke da API:
1. `monitor:check` (com worker docker check desabilitado no CI);
2. `monitor:reliability` com enforcement de metas;
3. `monitor:dashboard`;
4. `monitor:postmortem`;
5. `monitor:itsm` (snapshot da automacao de incidentes);
6. `monitor:governance` (owner dinamico + reconciliacao + enforcement SLO);
7. `monitor:fullcycle` (lifecycle bidirecional + ownership por calendario + analytics historico);
8. `monitor:fullcycle:execute` (execucao ativa das acoes e rastreabilidade por actionKey);
9. `monitor:fullcycle:loop` (ciclo fechado de convergencia com KPI de reducao);
10. `monitor:fullcycle:connectors` (SLO/runtime de conectores e degradacao por integracao);
11. `monitor:fullcycle:readiness` (prontidao sandbox/prod + tuning final + alerta executivo por conector);
12. `monitor:fullcycle:consolidation` (segregacao por ambiente + serie temporal + postmortem executivo de conectores);
13. `monitor:fullcycle:observability` (storage central + UI multiambiente + correlacao automatica incidente/postmortem);
14. `monitor:fullcycle:productization` (payload estavel para endpoint interno + retention/arquivamento + trilha compliance);
15. `monitor:fullcycle:observability:api` (contrato dos endpoints internos + RBAC/auth + freshness do payload);
16. `monitor:fullcycle:observability:realtime` (stream de eventos + politicas executivas realtime);
17. `monitor:fullcycle:observability:alerting` (fanout de alertas + historico SLA da API interna);
18. `monitor:fullcycle:observability:backend` (store dedicado de incidents/alerts + matriz de escalonamento);
19. `monitor:fullcycle:observability:panel` (painel operacional backend-first com incidents/alerts + SSE + API SLA + filtro por equipe);
20. `monitor:fullcycle:observability:live` (governanca live recorrente da API observability + browser/headless + contrato estruturado);
21. `monitor:oncall` (KPI executivo de SLA + trilha de auditoria);
22. upload de artefatos em `reliability-artifacts`.

## On-call e ticketing (Fase 14)
Configurar endpoints de destino para automacao:
1. `ONCALL_PAGING_WEBHOOK_URL` para notificar equipe de plantao;
2. `ITSM_TICKET_WEBHOOK_URL` para abertura/fechamento de ticket.

Regras de SLA por severidade:
1. P1 (`critical`): `SLA_P1_ACK_MIN` / `SLA_P1_RESOLVE_MIN`.
2. P2 (`warning`): `SLA_P2_ACK_MIN` / `SLA_P2_RESOLVE_MIN`.
3. P3 (`info`): `SLA_P3_ACK_MIN` / `SLA_P3_RESOLVE_MIN`.

Painel executivo:
1. `ONCALL_DASHBOARD_FILE` (markdown de on-call).
2. `ONCALL_EXECUTIVE_REPORT_FILE` (JSON para analytics).
3. `ONCALL_AUDIT_FILE` (JSONL para trilha de auditoria).

Governanca enterprise:
1. Escala de plantao: `ONCALL_ROTATION_FILE` (exemplo: `config/oncall-rotation.example.json`).
2. Calendario oficial: `ONCALL_CALENDAR_FILE` (exemplo: `config/oncall-calendar.example.json`).
3. Snapshot ITSM: `ITSM_SNAPSHOT_FILE`.
4. Enforcement executivo: `SLO_EXECUTIVE_ENFORCE_TARGETS` + `SLO_EXEC_*`.
5. Relatorio enterprise: `GOVERNANCE_REPORT_FILE` e `GOVERNANCE_DASHBOARD_FILE`.

Governanca full-cycle:
1. Acoes de reconciliacao: `FULLCYCLE_ACTIONS_FILE`.
2. Relatorio consolidado: `FULLCYCLE_REPORT_FILE`.
3. Dashboard de operacao: `FULLCYCLE_DASHBOARD_FILE`.
4. Historico de tendencia: `GOVERNANCE_HISTORY_FILE`.

Execucao ativa full-cycle:
1. Estado da remediacao: `FULLCYCLE_EXECUTION_STATE_FILE`.
2. Relatorio por execucao: `FULLCYCLE_EXECUTION_REPORT_FILE`.
3. Dashboard de execucao: `FULLCYCLE_EXECUTION_DASHBOARD_FILE`.
4. Flags de controle:
- `FULLCYCLE_EXEC_DRY_RUN`
- `FULLCYCLE_EXEC_REQUIRE_ENDPOINTS`
- `FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR`
- `FULLCYCLE_EXEC_MAX_RETRIES`

Loop de convergencia full-cycle:
1. Relatorio de convergencia: `FULLCYCLE_CONVERGENCE_REPORT_FILE`.
2. Dashboard de convergencia: `FULLCYCLE_CONVERGENCE_DASHBOARD_FILE`.
3. Politicas de convergencia:
- `FULLCYCLE_LOOP_MAX_CYCLES`
- `FULLCYCLE_LOOP_PATCH_SNAPSHOT`
- `FULLCYCLE_LOOP_REQUIRE_IMPROVEMENT`
- `FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_ABS`
- `FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_PCT`

Hardening de conectores enterprise:
1. Telemetria de conectores: `FULLCYCLE_CONNECTOR_TELEMETRY_FILE`.
2. Dashboard de conectores: `FULLCYCLE_CONNECTOR_DASHBOARD_FILE`.
3. Providers de execucao:
- `ITSM_CONNECTOR_PROVIDER` (`generic`, `jira`, `servicenow`)
- `ONCALL_CONNECTOR_PROVIDER` (`generic`, `pagerduty`, `opsgenie`)
4. Validacao de contrato:
- `FULLCYCLE_CONNECTOR_VALIDATE_CONTRACT`
- `FULLCYCLE_CONNECTOR_ENFORCE_REQUEST_CONTRACT`
- `FULLCYCLE_CONNECTOR_ENFORCE_RESPONSE_CONTRACT`

Runtime de conectores enterprise:
1. Relatorio runtime: `FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE`.
2. Dashboard runtime: `FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE`.
3. Lifecycle de incidentes de conector: `FULLCYCLE_CONNECTOR_INCIDENTS_FILE`.
4. Metas SLO por integracao:
- `FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT`
- `FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX`
- `FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX`
- `FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS`
- `FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX`
5. Alertas:
- `FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_SLACK_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_DISCORD_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_*`

Readiness de homologacao de conectores:
1. Perfis de ambiente: `FULLCYCLE_CONNECTOR_ENVIRONMENTS_FILE` (template: `config/connector-environments.example.json`).
2. Relatorio readiness: `FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE`.
3. Dashboard readiness: `FULLCYCLE_CONNECTOR_READINESS_DASHBOARD_FILE`.
4. Tuning sugerido de thresholds: `FULLCYCLE_CONNECTOR_TUNING_OUTPUT_FILE`.
5. Politicas de readiness:
- `FULLCYCLE_CONNECTOR_READINESS_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_SANDBOX`
- `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_PROD`
- `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_NO_ACTIVE_INCIDENT`
- `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_ALERTS`
6. Alertas executivos dedicados (opcional):
- `FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_EXEC_SLACK_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_EXEC_DISCORD_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_*`

Consolidacao produtiva de conectores:
1. Ambiente de consolidacao: `FULLCYCLE_CONNECTOR_ENVIRONMENT`.
2. Serie temporal por ambiente: `FULLCYCLE_CONNECTOR_TIMESERIES_FILE`.
3. Relatorio consolidado: `FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE`.
4. Dashboard consolidado: `FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE`.
5. Trilha executiva de auditoria: `FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE`.
6. Postmortems de conectores: `FULLCYCLE_CONNECTOR_POSTMORTEM_DIR`.
7. Politicas:
- `FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS`
- `FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS`
- `FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT`
- `FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED`
- `FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT`
- `FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE`
- `FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS`
- `FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS`

Industrializacao do observability layer:
1. Store central de observabilidade: `FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE`.
2. Relatorio consolidado de observabilidade: `FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE`.
3. Feed JSON para UI interna: `FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE`.
4. Dashboard UI interno: `FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE`.
5. Trilha de auditoria de observabilidade: `FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE`.
6. Politicas:
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_OPERATIONS_PASS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_MULTI_ENV`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_MIN_ENVIRONMENTS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_POSTMORTEM_LINK`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_POSTMORTEM_SLA_HOURS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_MAX_OPEN_CRITICAL_INCIDENTS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_HISTORY_MAX_ENTRIES`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_TREND_WINDOW_POINTS`

Productizacao da observabilidade:
1. Relatorio de productizacao: `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE`.
2. Dashboard de productizacao: `FULLCYCLE_CONNECTOR_PRODUCTIZATION_DASHBOARD_FILE`.
3. Audit trail de productizacao: `FULLCYCLE_CONNECTOR_PRODUCTIZATION_AUDIT_FILE`.
4. Payload de API interna: `FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE`.
5. Arquivo de historico podado: `FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE`.
6. Politicas de retention/compliance:
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_DAYS`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_MAX_ENTRIES`
- `FULLCYCLE_CONNECTOR_OBSERVABILITY_API_HISTORY_LIMIT`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_OBSERVABILITY_PASS`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_FEED`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_DASHBOARD`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_API_PAYLOAD`
- `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_HISTORY_AFTER_RETENTION`
7. Endpoint interno com RBAC:
- `GET /api/observability/connectors/summary` (`operator+`)
- `GET /api/observability/connectors/feed` (`operator+`)
- `GET /api/observability/connectors/history` (`executive+`)
- `GET /api/observability/connectors/archive` (`executive+`)
- `GET /api/observability/connectors/dashboard` (`executive+`)
8. Controles RBAC:
- `OBSERVABILITY_RBAC_ENABLED`
- `OBSERVABILITY_RBAC_OPERATOR_ROLES`
- `OBSERVABILITY_RBAC_EXECUTIVE_ROLES`

Governanca da API interna de observabilidade:
1. Relatorio de governanca API: `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE`.
2. Dashboard de governanca API: `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE`.
3. Audit trail de governanca API: `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE`.
4. Alvo da API interna: `FULLCYCLE_CONNECTOR_OBS_API_BASE`.
5. Chave admin dedicada (opcional): `FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY` (fallback para `ADMIN_API_KEY`).
6. Politicas de qualidade:
- `FULLCYCLE_CONNECTOR_OBS_API_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ALL_ENDPOINTS`
- `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_RBAC`
- `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ADMIN_KEY`
- `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_DASHBOARD_HTML`
- `FULLCYCLE_CONNECTOR_OBS_API_ALLOW_UNAVAILABLE`
7. SLO/timeout:
- `FULLCYCLE_CONNECTOR_OBS_API_TIMEOUT_MS`
- `FULLCYCLE_CONNECTOR_OBS_API_MAX_LATENCY_MS`
- `FULLCYCLE_CONNECTOR_OBS_API_MAX_PAYLOAD_AGE_MIN`

Observabilidade executiva em tempo real:
1. Estado realtime do stream: `FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE`.
2. Eventos realtime (JSONL): `FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE`.
3. Relatorio realtime: `FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE`.
4. Dashboard realtime: `FULLCYCLE_CONNECTOR_OBS_STREAM_DASHBOARD_FILE`.
5. Audit trail realtime: `FULLCYCLE_CONNECTOR_OBS_STREAM_AUDIT_FILE`.
6. Politicas de gate:
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_OBSERVABILITY_PASS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_PRODUCTIZATION_PASS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_GOVERNANCE_PASS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_NO_BLOCKING_VIOLATIONS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_OPEN_CRITICAL_INCIDENTS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_REPORT_AGE_MIN`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_EVENT_HISTORY`
7. Controles de stream SSE:
- `FULLCYCLE_CONNECTOR_OBS_STREAM_DEFAULT_LIMIT`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_POLL_MS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_HEARTBEAT_MS`
8. Endpoint interno realtime:
- `GET /api/observability/connectors/stream` (`operator+`)
- query `once=true` para snapshot + fechamento (smoke/CI).

Alerting proativo do realtime + SLA da API interna:
1. Estado do alerting (dedupe/cooldown): `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE`.
2. Relatorio de alerting: `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE`.
3. Dashboard de alerting: `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DASHBOARD_FILE`.
4. Audit trail de alerting: `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_AUDIT_FILE`.
5. Serie temporal de SLA da API interna: `FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE`.
6. Dashboard de SLA da API interna: `FULLCYCLE_CONNECTOR_OBS_API_SLA_DASHBOARD_FILE`.
7. Politicas de alerting:
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_STREAM_PASS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_API_GOVERNANCE_PASS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_MAX_ACTIVE_ISSUES`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ONLY_ON_NEW`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_NOTIFY_RESOLVED`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_COOLDOWN_MINUTES`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TIMEOUT_MS`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DRY_RUN`
8. Metas SLA da API interna:
- `FULLCYCLE_CONNECTOR_OBS_API_SLA_MIN_AVAILABILITY_PCT`
- `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_LATENCY_MS`
- `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_PAYLOAD_AGE_MIN`
- `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_BLOCKING_VIOLATIONS`
- `FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_MAX_POINTS`
9. Fanout dedicado (com fallback automatico):
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_SLACK_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DISCORD_WEBHOOK_URL`
- `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_*`
10. Endpoints internos de SLA:
- `GET /api/observability/connectors/api-sla/summary` (`operator+`)
- `GET /api/observability/connectors/api-sla/history` (`executive+`)

Painel operacional interativo realtime:
1. Relatorio de publicacao do painel: `FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE`.
2. Dashboard HTML interativo: `FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE`.
3. Audit trail da fase: `FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE`.
4. Politicas de gate:
- `FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_EVENTS`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN`
- `FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN`
5. Endpoint interno de entrega:
- `GET /api/observability/connectors/realtime/panel` (`operator+`).

Backend dedicado de incidents/alerts:
1. Store consolidado: `FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE`.
2. Relatorio da consolidacao: `FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE`.
3. Dashboard markdown: `FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE`.
4. Audit trail dedicado: `FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE`.
5. Analytics historico do backend: `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE`.
6. Matriz de roteamento severidade/equipe: `FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE` (template: `config/observability-routing.example.json`).
7. Integracao on-call: `FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE` e `FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE`.
8. Politicas adicionais de ownership:
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_PRESERVE_MANUAL_OWNER`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES`
9. Politicas base:
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS`
10. Endpoints internos:
- `GET /api/observability/connectors/incidents/summary` (`operator+`)
- `GET /api/observability/connectors/incidents` (`operator+`)
- `GET /api/observability/connectors/alerts/summary` (`operator+`)
- `GET /api/observability/connectors/alerts` (`operator+`)
- `GET /api/observability/connectors/backend/report` (`executive+`)
- `GET /api/observability/connectors/backend/analytics` (`executive+`)
- `GET /api/observability/connectors/backend/dashboard` (`executive+`)

## Logs e auditoria
- Logs de auditoria JSONL: `AUDIT_LOG_DIR`.
- Em Docker oficial: `/app/logs` com volume `./logs:/app/logs`.
- Ver logs de servicos:
```bash
docker compose logs -f api
docker compose logs -f worker
```

## Troubleshooting

### 1. Webhook nao chega na API
Checklist:
1. Confirmar URL da Evolution: `EVOLUTION_URL` (alias aceito: `EVOLUTION_API_URL`).
2. Validar configuracao do webhook na Evolution para `http://<host>:3000/webhooks/evolution`.
3. Testar endpoint manual:
```bash
curl -X POST http://localhost:3000/webhooks/evolution -H "Content-Type: application/json" -d '{"event":"messages.upsert","instance":"test","data":{"key":{"remoteJid":"5511999999999@s.whatsapp.net","fromMe":false,"id":"test-msg"},"message":{"conversation":"teste webhook"},"messageTimestamp":1700000000}}'
```
4. Verificar logs da API (`docker compose logs -f api`).

### 2. Filas sem processamento
Checklist:
1. Confirmar worker ativo (`docker compose ps`).
2. Confirmar Redis `healthy`.
3. Verificar erros no worker (`docker compose logs -f worker`).
4. Validar readiness do worker dentro do container (`/ready` na 3002).

### 3. Erro em LLM/STT/Vision
Checklist:
1. Validar chaves no `.env` (`GLM5_API_KEY`, `KIMI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_STT_API_KEY`).
2. Confirmar fallback de chat habilitado (`FALLBACK_CHAT_PROVIDERS`).
3. Revisar logs de worker (lanes `classify`, `stt`, `vision`).
4. Reexecutar suites de validacao quando necessario:
```bash
npm run test:phase4
npm run test:phase5
```

## Rollback operacional
Quando um deploy/regressao quebrar runtime:
1. Retornar para commit/tag estavel no repositorio.
2. Rebuild dos servicos impactados:
```bash
docker compose up -d --build api worker
```
3. Revalidar:
```bash
docker compose ps
curl http://localhost:3000/health
npm run test:ci:api-smoke
```
4. Registrar incidente e causa raiz na documentacao da fase.

## Encerramento seguro
- Parar stack sem remover dados:
```bash
docker compose down
```
- Parar stack removendo volumes (cuidado: apaga dados locais):
```bash
docker compose down -v
```
