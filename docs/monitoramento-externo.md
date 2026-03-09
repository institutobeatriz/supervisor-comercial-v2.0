# Monitoramento Externo e SLO

## Objetivo
Executar probes sinteticos de API/worker com janela de disponibilidade, gerar relatorio persistido e disparar alerta webhook quando houver incidente.

Script oficial:
- `npm run monitor:check`
- Arquivo: `scripts/phase10-monitoring-slo.mjs`

## O que e verificado
1. API:
- `GET /health` (status esperado: `healthy`)
- `GET /ready` (status esperado: `ready`)
- `GET /api/dashboard/kpis`
- `GET /api/alerts`

2. Worker:
- `docker inspect` do container (`supervisor-worker`) por padrao.
- opcionalmente, `MONITOR_WORKER_BASE` para probe HTTP de `/health` e `/ready`.

## Persistencia
Arquivos gerados:
1. `logs/monitoring/last-report.json` (ultima execucao)
2. `logs/monitoring/slo-state.json` (janela historica para SLO)
3. `logs/monitoring/incidents.json` (lifecycle de incidentes: aberto/resolvido)

A janela e definida por `MONITOR_HISTORY_SIZE` (default `288` amostras).

## SLOs
Defaults:
1. API availability: `99.5%`
2. Worker availability: `99.0%`
3. Minimo de amostras para acionar breach: `12`

Um incidente e aberto quando:
1. algum check critico falha na execucao atual; ou
2. disponibilidade da janela cai abaixo da meta SLO.

Campos de incidente:
1. `startedAt` / `detectedAt` / `resolvedAt`
2. `mttdMs` (detecção)
3. `durationMs` (base de MTTR)
4. `maxSeverity`

## Alertas webhook
Configuracao:
1. `MONITOR_ALERT_WEBHOOK_URL`
2. `MONITOR_ALERT_BEARER_TOKEN` (opcional)
3. `MONITOR_ALERT_COOLDOWN_MINUTES` (default `30`)

Quando configurado, incidente envia POST JSON com resumo de falhas e breaches de SLO.

Destinos produtivos adicionais:
1. Slack: `MONITOR_ALERT_SLACK_WEBHOOK_URL`
2. Discord: `MONITOR_ALERT_DISCORD_WEBHOOK_URL`
3. Telegram:
- `MONITOR_ALERT_TELEGRAM_BOT_TOKEN`
- `MONITOR_ALERT_TELEGRAM_CHAT_ID`
- `MONITOR_ALERT_TELEGRAM_THREAD_ID` (opcional)

## Variaveis principais
Definidas em `.env.example`:
1. `MONITOR_API_BASE`
2. `MONITOR_WORKER_BASE`
3. `MONITOR_DOCKER_WORKER_CHECK`
4. `MONITOR_DOCKER_WORKER_CONTAINER`
5. `MONITOR_DOCKER_WORKER_REQUIRED`
6. `MONITOR_TIMEOUT_MS`
7. `MONITOR_SLO_API_AVAILABILITY`
8. `MONITOR_SLO_WORKER_AVAILABILITY`
9. `MONITOR_EXIT_ON_INCIDENT`
10. `MONITOR_STATE_FILE`
11. `MONITOR_REPORT_FILE`
12. `MONITOR_INCIDENTS_FILE`
13. `MONITOR_EXPECTED_INTERVAL_MINUTES`
14. `MONITOR_ALERT_SLACK_WEBHOOK_URL`
15. `MONITOR_ALERT_DISCORD_WEBHOOK_URL`
16. `MONITOR_ALERT_TELEGRAM_BOT_TOKEN`
17. `MONITOR_ALERT_TELEGRAM_CHAT_ID`

## Execucao manual
```bash
npm run monitor:check
```

Execucao sem falhar shell em incidente (ex.: ambiente de homolog):
```bash
MONITOR_EXIT_ON_INCIDENT=false npm run monitor:check
```

## Chaos drills
Suite de validacao de incident response:
```bash
npm run monitor:chaos
```
Cobertura:
1. baseline saudavel;
2. API indisponivel (espera incidente);
3. container de worker ausente (espera incidente).
4. lifecycle incidente (abre e resolve no arquivo de incidentes).

## Relatorio de confiabilidade (MTTD/MTTR)
Gerar sumario operacional:
```bash
npm run monitor:reliability
```

Saida:
1. `logs/monitoring/reliability-summary.json`
2. agregados de:
- incidentes abertos/fechados;
- MTTD medio/p95;
- MTTR medio/p95;
- distribuicao por severidade.

## Dashboard de confiabilidade (Fase 13)
Gerar dashboard em markdown:
```bash
npm run monitor:dashboard
```

Saida padrao:
1. `docs/reliability-dashboard.md`
2. secoes de KPI, incidentes recentes e incidente ativo.

## Postmortem assistido (Fase 13)
Gerar templates de postmortem por incidente resolvido:
```bash
npm run monitor:postmortem
```

Saida padrao:
1. `docs/postmortems/index.md`
2. um arquivo `.md` por incidente resolvido (`docs/postmortems/<incident-id>.md`).

Variaveis de controle:
1. `POSTMORTEM_OUTPUT_DIR`
2. `POSTMORTEM_INCLUDE_OPEN`
3. `POSTMORTEM_OVERWRITE`
4. `POSTMORTEM_MAX_ITEMS`

## Gate de confiabilidade no CI (Fase 13)
Pipeline CI executa:
1. `npm run monitor:check` com `MONITOR_DOCKER_WORKER_CHECK=false`;
2. `npm run monitor:reliability` com `RELIABILITY_ENFORCE_TARGETS=true`;
3. `npm run monitor:dashboard`;
4. `npm run monitor:postmortem`.

Artefatos CI:
1. `logs/monitoring/ci-last-report.json`
2. `logs/monitoring/ci-reliability-summary.json`
3. `logs/monitoring/ci-reliability-dashboard.md`
4. `logs/monitoring/ci-postmortems/*`

## Integracao paging/ITSM (Fase 14)
Sincronizar incidentes com on-call e ticketing:
```bash
npm run monitor:itsm
```

Comportamento:
1. abre evento em paging/ticket quando incidente esta `open` e ainda nao foi registrado;
2. resolve evento em paging/ticket quando incidente muda para `resolved`;
3. evita duplicidade (idempotente por `incident.id`);
4. aplica tier de SLA por severidade:
- `critical -> P1`
- `warning -> P2`
- `info -> P3`

Arquivos:
1. `INCIDENT_AUTOMATION_STATE_FILE` (default `logs/monitoring/incident-automation-state.json`)
2. `INCIDENT_AUTOMATION_REPORT_FILE` (default `logs/monitoring/incident-automation-report.json`)

Configuracao:
1. `ONCALL_PAGING_WEBHOOK_URL` (+ bearer opcional)
2. `ITSM_TICKET_WEBHOOK_URL` (+ bearer opcional)
3. `ITSM_SERVICE_NAME`, `ITSM_TEAM`, `ITSM_DEFAULT_OWNER`
4. `SLA_P1_*`, `SLA_P2_*`, `SLA_P3_*`
5. `INCIDENT_AUTOMATION_*` (timeout, dry-run, fail_on_error)

## Drill de integracao (Fase 14)
Validacao automatizada com mock de endpoints:
```bash
npm run test:phase14
```
Cobertura:
1. abertura em paging e ticket;
2. resolucao em paging e ticket;
3. idempotencia (sem chamadas duplicadas em reexecucao).

## Dashboard on-call executivo (Fase 15)
Gerar painel executivo e trilha de auditoria:
```bash
npm run monitor:oncall
```

Saidas:
1. `ONCALL_DASHBOARD_FILE` (default `docs/oncall-dashboard.md`)
2. `ONCALL_EXECUTIVE_REPORT_FILE` (JSON com KPI de SLA por tier)
3. `ONCALL_AUDIT_FILE` (JSONL com snapshot por incidente)

KPI calculados:
1. SLA de ACK (avg/p95 e cumprimento por tier P1/P2/P3)
2. SLA de resolucao (avg/p95 e cumprimento por tier)
3. incidentes abertos com burn rate de SLA
4. status de cobertura de postmortem por incidente

Drill da fase:
```bash
npm run test:phase15
```

## CI (Fase 15)
Pipeline passa a executar:
1. `monitor:itsm`
2. `monitor:oncall`

Artefatos adicionais:
1. `logs/monitoring/ci-oncall-dashboard.md`
2. `logs/monitoring/ci-executive-sla-report.json`
3. `logs/monitoring/ci-executive-audit-trail.jsonl`

## Governanca enterprise (Fase 16)
Executar ownership dinamico + reconciliacao ITSM + enforcement executivo:
```bash
npm run monitor:governance
```

Saidas:
1. `GOVERNANCE_REPORT_FILE` (default `logs/monitoring/executive-governance-report.json`)
2. `GOVERNANCE_DASHBOARD_FILE` (default `docs/executive-governance.md`)
3. atualizacao de owner no `INCIDENT_AUTOMATION_STATE_FILE`

Recursos:
1. ownership dinamico por escala (`ONCALL_ROTATION_FILE`)
2. reconciliacao de drift com snapshot (`ITSM_SNAPSHOT_FILE`)
3. metas formais de SLO por tier (`SLO_EXEC_*`)

Drill da fase:
```bash
npm run test:phase16
```

CI (Fase 16):
1. `monitor:itsm`
2. `monitor:governance` (gate executivo)
3. `monitor:oncall`

## Governanca full-cycle (Fase 17)
Executar reconciliacao full-cycle com ownership por calendario, lifecycle bidirecional e analytics historico:
```bash
npm run monitor:fullcycle
```

Saidas:
1. `FULLCYCLE_ACTIONS_FILE` (default `logs/monitoring/fullcycle-actions.json`)
2. `FULLCYCLE_REPORT_FILE` (default `logs/monitoring/fullcycle-governance-report.json`)
3. `FULLCYCLE_DASHBOARD_FILE` (default `docs/fullcycle-governance.md`)
4. `GOVERNANCE_HISTORY_FILE` (default `logs/monitoring/governance-history.json`)

Recursos:
1. ownership dinamico por escala + calendario (`ONCALL_ROTATION_FILE`, `ONCALL_CALENDAR_FILE`);
2. reconciliacao com snapshot externo (`ITSM_SNAPSHOT_FILE`) com acoes de:
- backfill de external IDs locais;
- create/reopen/resolve remoto para ticket e paging;
- sincronizacao de owner e deteccao de orfaos;
3. tendencias historicas de coverage, pendencias, orfaos e drifts de governanca;
4. enforcement executivo (`FULLCYCLE_ENFORCE_TARGETS`) com limites de pendencia, orfaos e cobertura.

Drill da fase:
```bash
npm run test:phase17
```

## CI (Fase 17)
Pipeline passa a executar:
1. `monitor:governance` (gate enterprise)
2. `monitor:fullcycle` (gate full-cycle)
3. `monitor:oncall` (snapshot executivo)

## Execucao ativa full-cycle (Fase 18)
Executar remediacao automatica das acoes geradas em `FULLCYCLE_ACTIONS_FILE`:
```bash
npm run monitor:fullcycle:execute
```

Saidas:
1. `FULLCYCLE_EXECUTION_STATE_FILE` (default `logs/monitoring/fullcycle-execution-state.json`)
2. `FULLCYCLE_EXECUTION_REPORT_FILE` (default `logs/monitoring/fullcycle-execution-report.json`)
3. `FULLCYCLE_EXECUTION_DASHBOARD_FILE` (default `docs/fullcycle-execution.md`)

Cobertura:
1. cria/reabre/resolve tickets e paging conforme plano de acao;
2. sincroniza owner remoto (`owner_sync_*`);
3. aplica link local de external ID quando habilitado (`FULLCYCLE_EXEC_APPLY_LOCAL_LINKS`);
4. rastreia sucesso/falha/skips por `actionKey` com idempotencia entre execucoes.

Controles operacionais:
1. `FULLCYCLE_EXEC_DRY_RUN` (simulacao sem chamada externa);
2. `FULLCYCLE_EXEC_REQUIRE_ENDPOINTS` (falha se endpoint obrigatorio faltar);
3. `FULLCYCLE_EXEC_FAIL_ON_ERROR` e `FULLCYCLE_EXEC_FAIL_ON_BLOCKING_ERROR`;
4. `FULLCYCLE_EXEC_MAX_RETRIES` e `FULLCYCLE_EXEC_RETRY_BACKOFF_MS`.

Drill da fase:
```bash
npm run test:phase18
```

## CI (Fase 18)
Pipeline passa a executar:
1. `monitor:governance`
2. `monitor:fullcycle`
3. `monitor:fullcycle:execute` (gate de remediacao full-cycle)
4. `monitor:oncall`

## Loop de convergencia full-cycle (Fase 19)
Executar ciclo fechado de convergencia:
```bash
npm run monitor:fullcycle:loop
```

Fluxo do loop:
1. replanejar acoes (`monitor:fullcycle`);
2. executar remediacao (`monitor:fullcycle:execute`);
3. replanejar novamente e medir reducao de pendencias.

Saidas:
1. `FULLCYCLE_CONVERGENCE_REPORT_FILE` (default `logs/monitoring/fullcycle-convergence-report.json`)
2. `FULLCYCLE_CONVERGENCE_DASHBOARD_FILE` (default `docs/fullcycle-convergence.md`)

Controles:
1. `FULLCYCLE_LOOP_MAX_CYCLES`
2. `FULLCYCLE_LOOP_PATCH_SNAPSHOT`
3. `FULLCYCLE_LOOP_ENFORCE_TARGETS`
4. `FULLCYCLE_LOOP_REQUIRE_IMPROVEMENT`
5. `FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_ABS`
6. `FULLCYCLE_LOOP_MIN_PENDING_REDUCTION_PCT`
7. `FULLCYCLE_LOOP_REQUIRE_ZERO_BLOCKING`

Drill da fase:
```bash
npm run test:phase19
```

## CI (Fase 19)
Pipeline passa a executar:
1. `monitor:fullcycle`
2. `monitor:fullcycle:execute`
3. `monitor:fullcycle:loop`
4. `monitor:oncall`

## Hardening de conectores enterprise (Fase 20)
A execucao ativa (`monitor:fullcycle:execute`) passou a suportar:
1. adapters por provedor:
- ITSM: `generic`, `jira`, `servicenow`;
- On-call: `generic`, `pagerduty`, `opsgenie`.
2. validacao de contrato por conector (request/response);
3. telemetria por integracao (falha, timeout, retry e latencia p95).

Saidas adicionais:
1. `FULLCYCLE_CONNECTOR_TELEMETRY_FILE` (default `logs/monitoring/fullcycle-connector-telemetry.json`)
2. `FULLCYCLE_CONNECTOR_DASHBOARD_FILE` (default `docs/fullcycle-connectors.md`)

Controles:
1. `ITSM_CONNECTOR_PROVIDER`
2. `ONCALL_CONNECTOR_PROVIDER`
3. `FULLCYCLE_CONNECTOR_VALIDATE_CONTRACT`
4. `FULLCYCLE_CONNECTOR_ENFORCE_REQUEST_CONTRACT`
5. `FULLCYCLE_CONNECTOR_ENFORCE_RESPONSE_CONTRACT`
6. `FULLCYCLE_CONNECTOR_TELEMETRY_MAX_HISTORY`

Campos de contrato por provedor:
1. Jira:
- `ITSM_JIRA_PROJECT_KEY`
- `ITSM_JIRA_ISSUE_TYPE`
- `ITSM_JIRA_COMPONENT`
2. ServiceNow:
- `ITSM_SERVICENOW_TABLE`
- `ITSM_SERVICENOW_ASSIGNMENT_GROUP`
- `ITSM_SERVICENOW_CALLER`
3. PagerDuty/Opsgenie:
- `ONCALL_PAGERDUTY_ROUTING_KEY`
- `ONCALL_OPSGENIE_TEAM`

Drill da fase:
```bash
npm run test:phase20
```

CI (Fase 20):
1. `test:phase20` (drill de adapters/contratos);
2. `monitor:fullcycle:execute` com validacao de contrato habilitada.

## Runtime de conectores enterprise (Fase 21)
Executar SLO e deteccao de degradacao por integracao:
```bash
npm run monitor:fullcycle:connectors
```

Saidas:
1. `FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-runtime-report.json`)
2. `FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE` (default `docs/fullcycle-connectors-runtime.md`)
3. `FULLCYCLE_CONNECTOR_INCIDENTS_FILE` (default `logs/monitoring/fullcycle-connector-incidents.json`)

Controles e metas:
1. `FULLCYCLE_CONNECTOR_WINDOW_RUNS`
2. `FULLCYCLE_CONNECTOR_MIN_SAMPLES`
3. `FULLCYCLE_CONNECTOR_ENFORCE_TARGETS`
4. `FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT`
5. `FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX`
6. `FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX`
7. `FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS`
8. `FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX`

Alerta de degradacao por conector:
1. `FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL`
2. `FULLCYCLE_CONNECTOR_ALERT_SLACK_WEBHOOK_URL`
3. `FULLCYCLE_CONNECTOR_ALERT_DISCORD_WEBHOOK_URL`
4. `FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_BOT_TOKEN` + `FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_CHAT_ID`
5. `FULLCYCLE_CONNECTOR_ALERT_COOLDOWN_MINUTES`

Drill da fase:
```bash
npm run test:phase21
```

CI (Fase 21):
1. `test:phase21` (drill de runtime por conector);
2. `monitor:fullcycle:connectors` (gate de SLO/degradacao).

## Readiness de homologacao de conectores (Fase 22)
Executar validacao de prontidao sandbox/producao e tuning final de thresholds:
```bash
npm run monitor:fullcycle:readiness
```

Saidas:
1. `FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-readiness-report.json`)
2. `FULLCYCLE_CONNECTOR_READINESS_DASHBOARD_FILE` (default `docs/fullcycle-connectors-readiness.md`)
3. `FULLCYCLE_CONNECTOR_TUNING_OUTPUT_FILE` (default `logs/monitoring/fullcycle-connector-thresholds-suggested.json`)

Entradas obrigatorias:
1. `FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE` (baseline SLO por conector da fase 21)
2. `FULLCYCLE_CONNECTOR_INCIDENTS_FILE` (incidentes ativos de conectores)
3. `FULLCYCLE_CONNECTOR_ENVIRONMENTS_FILE` (perfil de ambientes; template: `config/connector-environments.example.json`)

Politicas de readiness:
1. `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_SANDBOX`
2. `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_PROD`
3. `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_NO_ACTIVE_INCIDENT`
4. `FULLCYCLE_CONNECTOR_READINESS_REQUIRE_ALERTS`
5. `FULLCYCLE_CONNECTOR_READINESS_ENFORCE_TARGETS`
6. `FULLCYCLE_CONNECTOR_READINESS_MIN_SAMPLES_FOR_TUNING`

Alertas executivos (dedicados, com fallback):
1. `FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL`
2. `FULLCYCLE_CONNECTOR_ALERT_EXEC_SLACK_WEBHOOK_URL`
3. `FULLCYCLE_CONNECTOR_ALERT_EXEC_DISCORD_WEBHOOK_URL`
4. `FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_BOT_TOKEN` + `FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_CHAT_ID`
5. fallback automatico para `FULLCYCLE_CONNECTOR_ALERT_*` e `MONITOR_ALERT_*`

Drill da fase:
```bash
npm run test:phase22
```

CI (Fase 22):
1. `test:phase22` (drill de readiness e tuning);
2. `monitor:fullcycle:readiness` (gate final de homologacao de conectores).

## Consolidacao produtiva de conectores (Fase 23)
Executar consolidacao operacional por ambiente com serie temporal e vinculo executivo de postmortem:
```bash
npm run monitor:fullcycle:consolidation
```

Saidas:
1. `FULLCYCLE_CONNECTOR_TIMESERIES_FILE` (default `logs/monitoring/fullcycle-connector-timeseries.json`)
2. `FULLCYCLE_CONNECTOR_OPERATIONS_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-operations-report.json`)
3. `FULLCYCLE_CONNECTOR_OPERATIONS_DASHBOARD_FILE` (default `docs/fullcycle-connectors-operations.md`)
4. `FULLCYCLE_CONNECTOR_EXEC_AUDIT_FILE` (default `logs/monitoring/fullcycle-connector-executive-audit-trail.jsonl`)
5. postmortems de conectores em `FULLCYCLE_CONNECTOR_POSTMORTEM_DIR` (default `docs/postmortems/connectors`)

Controles:
1. `FULLCYCLE_CONNECTOR_ENVIRONMENT` (segregacao dev/hml/prod/ci)
2. `FULLCYCLE_CONNECTOR_TIMESERIES_MAX_POINTS`
3. `FULLCYCLE_CONNECTOR_TREND_WINDOW_POINTS`
4. `FULLCYCLE_CONNECTOR_OPERATIONS_ENFORCE_TARGETS`
5. `FULLCYCLE_CONNECTOR_REQUIRE_RUNTIME_PASS`
6. `FULLCYCLE_CONNECTOR_REQUIRE_READINESS_PASS`
7. `FULLCYCLE_CONNECTOR_REQUIRE_NO_ACTIVE_INCIDENT`
8. `FULLCYCLE_CONNECTOR_POSTMORTEM_REQUIRED_FOR_RESOLVED`
9. `FULLCYCLE_CONNECTOR_POSTMORTEM_MIN_COVERAGE_PCT`
10. `FULLCYCLE_CONNECTOR_POSTMORTEM_AUTO_CREATE`
11. `FULLCYCLE_CONNECTOR_POSTMORTEM_INCLUDE_OPEN`

Drill da fase:
```bash
npm run test:phase23
```

CI (Fase 23):
1. `test:phase23` (drill de segregacao + postmortem executivo);
2. `monitor:fullcycle:consolidation` (gate de consolidacao produtiva).

## Industrializacao do observability layer (Fase 24)
Executar consolidacao central com feed/UI multiambiente e correlacao incidente/postmortem:
```bash
npm run monitor:fullcycle:observability
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBSERVABILITY_STORE_FILE` (default `logs/monitoring/fullcycle-connector-observability-store.json`)
2. `FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-observability-report.json`)
3. `FULLCYCLE_CONNECTOR_OBSERVABILITY_FEED_FILE` (default `docs/fullcycle-connectors-observability.json`)
4. `FULLCYCLE_CONNECTOR_OBSERVABILITY_DASHBOARD_FILE` (default `docs/fullcycle-connectors-observability.html`)
5. `FULLCYCLE_CONNECTOR_OBSERVABILITY_AUDIT_FILE` (default `logs/monitoring/fullcycle-connector-observability-audit.jsonl`)

Capacidades:
1. storage central de snapshots de observabilidade com retencao configuravel;
2. visao UI interna multiambiente com filtro por ambiente;
3. matriz de conectores por ambiente e tendencia de SLO;
4. correlacao automatica incidente -> postmortem com SLA de linkage.

Controles:
1. `FULLCYCLE_CONNECTOR_OBSERVABILITY_ENFORCE_TARGETS`
2. `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_OPERATIONS_PASS`
3. `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_MULTI_ENV`
4. `FULLCYCLE_CONNECTOR_OBSERVABILITY_MIN_ENVIRONMENTS`
5. `FULLCYCLE_CONNECTOR_OBSERVABILITY_REQUIRE_POSTMORTEM_LINK`
6. `FULLCYCLE_CONNECTOR_OBSERVABILITY_POSTMORTEM_SLA_HOURS`
7. `FULLCYCLE_CONNECTOR_OBSERVABILITY_MAX_OPEN_CRITICAL_INCIDENTS`
8. `FULLCYCLE_CONNECTOR_OBSERVABILITY_HISTORY_MAX_ENTRIES`
9. `FULLCYCLE_CONNECTOR_OBSERVABILITY_TREND_WINDOW_POINTS`

Drill da fase:
```bash
npm run test:phase24
```

CI (Fase 24):
1. `test:phase24` (drill de storage+UI+correlacao);
2. `monitor:fullcycle:observability` (gate de observabilidade industrial).

## Productizacao da observabilidade (Fase 25)
Executar productizacao operacional da camada de observabilidade:
```bash
npm run monitor:fullcycle:productization
```

Saidas:
1. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-productization-report.json`)
2. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_DASHBOARD_FILE` (default `docs/fullcycle-connectors-productization.md`)
3. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_AUDIT_FILE` (default `logs/monitoring/fullcycle-connector-productization-audit.jsonl`)
4. `FULLCYCLE_CONNECTOR_OBSERVABILITY_API_PAYLOAD_FILE` (payload estavel para endpoint interno)
5. `FULLCYCLE_CONNECTOR_OBSERVABILITY_ARCHIVE_FILE` (arquivo de historico podado)

Controles:
1. `FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_DAYS`
2. `FULLCYCLE_CONNECTOR_OBSERVABILITY_RETENTION_MAX_ENTRIES`
3. `FULLCYCLE_CONNECTOR_OBSERVABILITY_API_HISTORY_LIMIT`
4. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_ENFORCE_TARGETS`
5. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_OBSERVABILITY_PASS`
6. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_FEED`
7. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_DASHBOARD`
8. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_API_PAYLOAD`
9. `FULLCYCLE_CONNECTOR_PRODUCTIZATION_REQUIRE_HISTORY_AFTER_RETENTION`

Endpoint interno (API) com RBAC:
1. `GET /api/observability/connectors/summary` (operator+)
2. `GET /api/observability/connectors/feed` (operator+)
3. `GET /api/observability/connectors/history` (executive+)
4. `GET /api/observability/connectors/archive` (executive+)
5. `GET /api/observability/connectors/dashboard` (executive+)

Headers esperados:
1. `x-admin-key` (admin API key)
2. `x-observability-role` (`operator`, `executive` ou `admin`)

RBAC configuravel:
1. `OBSERVABILITY_RBAC_ENABLED`
2. `OBSERVABILITY_RBAC_OPERATOR_ROLES`
3. `OBSERVABILITY_RBAC_EXECUTIVE_ROLES`

Drill da fase:
```bash
npm run test:phase25
```

CI (Fase 25):
1. `test:phase25` (drill de productizacao e retention);
2. `monitor:fullcycle:productization` (gate de release do payload interno).

## Governanca da API interna de observabilidade (Fase 26)
Executar validacao operacional dos endpoints internos com contrato + RBAC + auth:
```bash
npm run monitor:fullcycle:observability:api
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-observability-api-governance-report.json`)
2. `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE` (default `docs/fullcycle-connectors-observability-api-governance.md`)
3. `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE` (default `logs/monitoring/fullcycle-connector-observability-api-governance-audit.jsonl`)

Controles:
1. `FULLCYCLE_CONNECTOR_OBS_API_BASE`
2. `FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY`
3. `FULLCYCLE_CONNECTOR_OBS_API_TIMEOUT_MS`
4. `FULLCYCLE_CONNECTOR_OBS_API_MAX_LATENCY_MS`
5. `FULLCYCLE_CONNECTOR_OBS_API_MAX_PAYLOAD_AGE_MIN`
6. `FULLCYCLE_CONNECTOR_OBS_API_ENFORCE_TARGETS`
7. `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ALL_ENDPOINTS`
8. `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_RBAC`
9. `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ADMIN_KEY`
10. `FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_DASHBOARD_HTML`
11. `FULLCYCLE_CONNECTOR_OBS_API_ALLOW_UNAVAILABLE`

Cobertura do gate:
1. endpoint `summary` com validacao de contrato e frescor de `payload.generatedAt`;
2. endpoint `feed`;
3. endpoint `history` (acesso executivo);
4. endpoint `archive` (acesso executivo);
5. endpoint `dashboard` (conteudo HTML valido);
6. validacoes RBAC:
- operador nao pode acessar `history`;
- role invalida nao pode acessar `summary`;
7. validacao de auth:
- `x-admin-key` invalida deve retornar `401`.

Drill da fase:
```bash
npm run test:phase26
```

CI (Fase 26):
1. `test:phase26` (drill pass/fail de contrato/RBAC/auth);
2. `monitor:fullcycle:observability:api` (gate operacional da API interna).

## Observabilidade executiva em tempo real (Fase 27)
Executar motor realtime para stream interno de eventos de observabilidade:
```bash
npm run monitor:fullcycle:observability:realtime
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE` (estado atual do stream e cursor)
2. `FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE` (eventos JSONL para SSE interno)
3. `FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE` (relatorio de governanca realtime)
4. `FULLCYCLE_CONNECTOR_OBS_STREAM_DASHBOARD_FILE` (dashboard markdown de eventos)
5. `FULLCYCLE_CONNECTOR_OBS_STREAM_AUDIT_FILE` (trilha de auditoria realtime)

Controles:
1. `FULLCYCLE_CONNECTOR_OBS_STREAM_ENFORCE_TARGETS`
2. `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_OBSERVABILITY_PASS`
3. `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_PRODUCTIZATION_PASS`
4. `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_GOVERNANCE_PASS`
5. `FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_NO_BLOCKING_VIOLATIONS`
6. `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_OPEN_CRITICAL_INCIDENTS`
7. `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_REPORT_AGE_MIN`
8. `FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_EVENT_HISTORY`
9. `FULLCYCLE_CONNECTOR_OBS_STREAM_DEFAULT_LIMIT`
10. `FULLCYCLE_CONNECTOR_OBS_STREAM_POLL_MS`
11. `FULLCYCLE_CONNECTOR_OBS_STREAM_HEARTBEAT_MS`

Endpoint SSE interno:
1. `GET /api/observability/connectors/stream` (operator+)
2. Query params:
- `once=true` para snapshot e encerramento (smoke/CI);
- `limit` para limite de eventos enviados;
- `pollMs` para intervalo de polling;
- `heartbeatMs` para ping de keep-alive.

Drill da fase:
```bash
npm run test:phase27
```

CI (Fase 27):
1. `test:phase27` (drill pass/fail de stream realtime);
2. `monitor:fullcycle:observability:realtime` (gate realtime executivo).

## Alerting proativo da observabilidade realtime (Fase 28)
Executar alerting executivo com fanout e historico de SLA da API interna:
```bash
npm run monitor:fullcycle:observability:alerting
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE` (report do alerting realtime)
2. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DASHBOARD_FILE` (dashboard de alertas/entregas)
3. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_AUDIT_FILE` (trilha de auditoria de alertas)
4. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE` (estado de dedupe/cooldown)
5. `FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE` (serie temporal de SLA da API interna)
6. `FULLCYCLE_CONNECTOR_OBS_API_SLA_DASHBOARD_FILE` (dashboard do SLA da API interna)

Controles:
1. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS`
2. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_STREAM_PASS`
3. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_API_GOVERNANCE_PASS`
4. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_MAX_ACTIVE_ISSUES`
5. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ONLY_ON_NEW`
6. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_NOTIFY_RESOLVED`
7. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_COOLDOWN_MINUTES`
8. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TIMEOUT_MS`
9. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DRY_RUN`
10. `FULLCYCLE_CONNECTOR_OBS_API_SLA_MIN_AVAILABILITY_PCT`
11. `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_LATENCY_MS`
12. `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_PAYLOAD_AGE_MIN`
13. `FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_BLOCKING_VIOLATIONS`
14. `FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_MAX_POINTS`

Fanout de alerta (dedicado com fallback):
1. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_WEBHOOK_URL` + `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_BEARER_TOKEN`
2. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_SLACK_WEBHOOK_URL`
3. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DISCORD_WEBHOOK_URL`
4. `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_BOT_TOKEN` + `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_CHAT_ID`
5. fallback para `FULLCYCLE_CONNECTOR_ALERT_EXEC_*`, `FULLCYCLE_CONNECTOR_ALERT_*` e `MONITOR_ALERT_*`

Endpoints internos adicionais (SLA):
1. `GET /api/observability/connectors/api-sla/summary` (operator+)
2. `GET /api/observability/connectors/api-sla/history` (executive+)

Drill da fase:
```bash
npm run test:phase28
```

CI (Fase 28):
1. `test:phase28` (drill pass/fail de alerting + fanout + dedupe);
2. `monitor:fullcycle:observability:alerting` (gate de alerting e SLA historico).

## Painel operacional interativo realtime (Fase 29)
Publicar painel operacional consumindo SSE + API SLA:
```bash
npm run monitor:fullcycle:observability:panel
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_PANEL_REPORT_FILE` (default `logs/monitoring/fullcycle-connector-observability-panel-report.json`)
2. `FULLCYCLE_CONNECTOR_OBS_PANEL_DASHBOARD_FILE` (default `docs/fullcycle-connectors-observability-ops-panel.html`)
3. `FULLCYCLE_CONNECTOR_OBS_PANEL_AUDIT_FILE` (default `logs/monitoring/fullcycle-connector-observability-panel-audit.jsonl`)

Capacidades do painel:
1. timeline interativa de eventos realtime;
2. filtros por severidade, source, ambiente e periodo;
3. conexao SSE ao endpoint interno `/api/observability/connectors/stream`;
4. refresh do historico de SLA via `/api/observability/connectors/api-sla/history`.

Controles:
1. `FULLCYCLE_CONNECTOR_OBS_PANEL_API_BASE`
2. `FULLCYCLE_CONNECTOR_OBS_PANEL_DEFAULT_ENVIRONMENT`
3. `FULLCYCLE_CONNECTOR_OBS_PANEL_ENFORCE_TARGETS`
4. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_STREAM_PASS`
5. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_ALERTING_PASS`
6. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_API_SLA_HISTORY`
7. `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_SLA_POINTS`
8. `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_EVENTS`
9. `FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_STREAM_AGE_MIN`
10. `FULLCYCLE_CONNECTOR_OBS_PANEL_MAX_SLA_AGE_MIN`

Endpoint interno do painel:
1. `GET /api/observability/connectors/realtime/panel` (`operator+`)

Drill da fase:
```bash
npm run test:phase29
```

CI (Fase 29):
1. `test:phase29` (drill pass/fail do painel operacional);
2. `monitor:fullcycle:observability:panel` (gate de publicacao do painel realtime).

Observacao:
1. O drill da Fase 29 permanece como regressao historica.
2. A publicacao oficial do comando `monitor:fullcycle:observability:panel` foi evoluida na Fase 31 para o modo backend-first.

## Backend dedicado de incidents/alerts (Fase 30)
Consolidar incidents/alerts em backend proprio para a API interna:
```bash
npm run monitor:fullcycle:observability:backend
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE` (store consolidado com incidents, alerts, teams e routing)
2. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE` (relatorio de consolidacao)
3. `FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE` (dashboard markdown do backend)
4. `FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE` (trilha de auditoria dedicada)
5. `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE` (historico executivo do backend dedicado)

Controles:
1. `FULLCYCLE_CONNECTOR_OBS_BACKEND_ROUTE_MATRIX_FILE`
2. `FULLCYCLE_CONNECTOR_OBS_BACKEND_DEFAULT_ENVIRONMENT`
3. `FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_TARGETS`
4. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_INCIDENTS`
5. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_ALERT_REPORT`
6. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_API_SLA_HISTORY`
7. `FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_OPEN_CRITICAL_INCIDENTS`
8. `FULLCYCLE_CONNECTOR_OBS_BACKEND_MAX_ACTIVE_CRITICAL_ALERTS`
9. `FULLCYCLE_CONNECTOR_OBS_BACKEND_ROTATION_FILE` (legado/drill file-based)
10. `FULLCYCLE_CONNECTOR_OBS_BACKEND_CALENDAR_FILE` (legado/drill file-based)
11. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE`
12. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE`
13. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE`
14. `FULLCYCLE_CONNECTOR_OBS_BACKEND_DYNAMIC_OWNER_ENABLED`
15. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_DYNAMIC_OWNER`
16. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SOURCE`
17. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_SNAPSHOT`
18. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_REPORT`
19. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_MAX_AGE_MIN`
20. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_MAX_AGE_MIN`
21. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_MAX_AGE_MIN`
22. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_TIMEZONE`
23. `FULLCYCLE_CONNECTOR_OBS_BACKEND_MIN_OWNER_COVERAGE_PCT`
24. `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_MAX_ENTRIES`

Endpoints internos adicionais:
1. `GET /api/observability/connectors/incidents/summary` (`operator+`)
2. `GET /api/observability/connectors/incidents` (`operator+`)
3. `GET /api/observability/connectors/alerts/summary` (`operator+`)
4. `GET /api/observability/connectors/alerts` (`operator+`)
5. `GET /api/observability/connectors/backend/summary` (`operator+`)
6. `GET /api/observability/connectors/backend/provider` (`operator+`)
7. `GET /api/observability/connectors/backend/report` (`executive+`)
8. `GET /api/observability/connectors/backend/analytics` (`executive+`)
9. `GET /api/observability/connectors/backend/dashboard` (`executive+`)

Drill da fase:
```bash
npm run test:phase30
```

CI (Fase 30):
1. `test:phase30` (drill pass/fail da consolidacao backend);
2. `monitor:fullcycle:observability:backend` (gate do backend dedicado);
3. smoke da API interna validando endpoints de incidents/alerts/backend.

## Owner dinamico + analytics historico do backend dedicado (Fase 32)
Evoluir o backend oficial com owner dinamico por rotacao/calendario, escalations e historico de ownership:
```bash
npm run test:phase32
npm run monitor:fullcycle:observability:backend
```

Capacidades adicionais:
1. resolve owner por regra de plantao em cima de `ownerTeam` e tier (`P1/P2/P3`);
2. aplica overrides de calendario antes da rotacao padrao;
3. mede cobertura de owner, owners sem atribuicao e escalations estourados;
4. persiste historico em `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE`;
5. expõe analytics via `/api/observability/connectors/backend/analytics`.

CI (Fase 32):
1. `test:phase32` (drill pass/fail de owner dinamico + analytics);
2. `monitor:fullcycle:observability:backend` (gate oficial do backend ja evoluido na Fase 32);
3. smoke da API interna incluindo `/api/observability/connectors/backend/analytics`.

## Ownership operacional oficial do backend dedicado (Fase 39)
Substituir a origem file-based do owner pelo estado operacional real:
```bash
npm run test:phase39
npm run monitor:fullcycle:observability:backend
```

Capacidades adicionais:
1. usa `INCIDENT_AUTOMATION_STATE_FILE` como fonte primaria de ownership operacional;
2. cruza `ITSM_SNAPSHOT_FILE` para priorizar owner remoto quando houver evidência viva de paging/ticket;
3. usa `FULLCYCLE_REPORT_FILE` como contexto operacional auxiliar e trilha de auditoria;
4. preserva owner manual existente quando nenhuma evidência operacional mais forte estiver disponivel;
5. mantem `backend/report`, `backend/analytics`, incidents, alerts e painel backend-first no mesmo contrato.

CI (Fase 39):
1. `test:phase39` (drill pass/fail da trilha operacional sem depender de `rotation/calendar`);
2. `monitor:fullcycle:observability:backend` (gate oficial operacional-first);
3. `test:phase33` / `test:phase34` para validar a trilha live consumindo a mesma origem operacional.

## Saude/frescor da fonte operacional (Fase 40)
Endurecer a leitura operacional com semantica explicita de workload e freshness:
```bash
npm run test:phase40
npm run monitor:fullcycle:observability:backend
```

Capacidades adicionais:
1. classifica `incident automation`, `itsm snapshot` e `fullcycle report` como `healthy`, `stale`, `missing` ou `unknown`;
2. expõe `workloadState`, `freshnessState` e `actionabilityState` em `backend/store`, `backend/report`, `backend/analytics` e `/api/observability/connectors/backend/summary`;
3. diferencia claramente `sem workload ativo` de `fonte operacional indisponivel` no painel backend-first;
4. recompila `@supervisor/api` antes da validacao live para evitar drift entre `src` e `dist`;
5. endurece smoke/live/CI para incluir `backend/summary` e os novos sinais operacionais.

CI (Fase 40):
1. `test:phase40` (drill `healthy/stale/missing`);
2. `monitor:fullcycle:observability:backend` (gate oficial com source health);
3. `test:phase33` / `test:phase34` validando `backend/summary` e painel com estado operacional.

## Provider operacional canonico (Fase 41)
Formalizar a fronteira canônica entre coleta operacional e consumo runtime:
```bash
npm run test:phase41
npm run monitor:fullcycle:observability:backend
```

Decisao arquitetural:
1. manter a ingestao por materializacao controlada;
2. formalizar o contrato versionado `fullcycle.observability.operational-provider.v1`;
3. usar o provider materializado como fonte oficial para backend, painel, smoke, live e compatibilidade.

Capacidades adicionais:
1. materializa `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE`;
2. publica dashboard executivo em `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_DASHBOARD_FILE`;
3. permite replay a partir do contrato existente sem depender da leitura simultanea dos tres arquivos operacionais brutos;
4. expõe `GET /api/observability/connectors/backend/provider` para `operator+`;
5. adiciona metadata de provider em `backend/summary`, `backend/report`, `backend/analytics` e no painel backend-first;
6. endurece smoke/live/CI para exigir provider canônico carregado.

Variaveis principais adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE`
2. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_DASHBOARD_FILE`
3. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE`
4. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE`
5. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK`
6. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER`

CI (Fase 41):
1. `test:phase41` (drill `materialize/replay/fail`);
2. `monitor:fullcycle:observability:backend` (gate oficial do provider canônico);
3. `test:phase33` / `test:phase34` validando `backend/provider` e live governance;
4. smoke da API interna exigindo `/api/observability/connectors/backend/provider`.

## Produtor dedicado do provider operacional (Fase 42)
Conectar o contrato canônico a uma etapa produtora dedicada antes do consumo runtime:
```bash
npm run test:phase42
npm run monitor:fullcycle:observability:backend
```

Decisao arquitetural:
1. separar producao do contrato e consumo do backend em wrappers distintos;
2. manter o schema `fullcycle.observability.operational-provider.v1` como fronteira oficial;
3. desabilitar `legacy_files` no caminho oficial do backend, mantendo apenas a capacidade de replay via contrato materializado;
4. registrar `phase43-disable-legacy-fallback` como alvo de deprecacao explicita.

Capacidades adicionais:
1. publica relatorio executivo do produtor em `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE`;
2. publica dashboard em `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE`;
3. publica auditoria JSONL em `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE`;
4. expõe `GET /api/observability/connectors/backend/producer` para `operator+`;
5. executa o backend consumer com `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE=false`, consumindo apenas o contrato ja materializado;
6. adiciona metadata de `producerMode`, `producerReady`, `legacyFallbackState` e `deprecationTarget` em `backend/provider`, `backend/summary`, `backend/analytics` e no painel.

Variaveis principais adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE`
2. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE`
3. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE`
4. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_MODE`
5. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PRODUCER`
6. `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET`

CI (Fase 42):
1. `test:phase42` (drill `materialize/replay/fail` do producer + backend consumer);
2. `monitor:fullcycle:observability:backend` (gate oficial producer-backed);
3. `test:phase33` / `test:phase34` validando `backend/producer` no runtime live;
4. smoke da API interna exigindo `/api/observability/connectors/backend/producer`.

## Validacao live da API interna + painel headless (Fase 33)
Executar validacao runtime real da camada de observabilidade:
```bash
npm run test:phase33
```
Alias operacional:
```bash
```

Saidas:
1. `FULLCYCLE_CONNECTOR_OBS_LIVE_OUTPUT_DIR` (default `logs/monitoring/phase33-live`)
2. `live-validation-report.json`
3. `live-validation-audit.jsonl`
4. `panel-screenshot.png`
5. `panel-dom.html`
6. `api.log`
7. `browser.log`

Capacidades:
1. monta fixtures controladas do backend/painel e reusa os artefatos das Fases 31/32;
2. sobe Postgres com `pgvector` e Redis temporarios via Docker quando `FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA=true`;
3. inicializa a API buildada com `ADMIN_API_KEY` dedicada;
4. roda o smoke live cobrindo endpoints observability expandidos;
5. valida o painel em Edge/Chrome headless via CDP;
6. registra screenshot, DOM e log do browser para auditoria;
7. consulta `/api/observability/connectors/backend/summary`, `/backend/provider`, `/backend/producer` e `/backend/analytics` como prova operacional/executiva final.

Variaveis principais:
1. `FULLCYCLE_CONNECTOR_OBS_LIVE_API_HOST`
2. `FULLCYCLE_CONNECTOR_OBS_LIVE_API_PORT`
3. `FULLCYCLE_CONNECTOR_OBS_LIVE_ADMIN_API_KEY`
4. `FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_PATH`
5. `FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_DEBUG_PORT`
6. `FULLCYCLE_CONNECTOR_OBS_LIVE_TIMEOUT_MS`
7. `FULLCYCLE_CONNECTOR_OBS_LIVE_BOOT_DOCKER_INFRA`
8. `FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_TIMEOUT_MS`
9. `FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_PG_PORT`
10. `FULLCYCLE_CONNECTOR_OBS_LIVE_DOCKER_REDIS_PORT`
11. `FULLCYCLE_CONNECTOR_OBS_LIVE_DATABASE_URL`
12. `FULLCYCLE_CONNECTOR_OBS_LIVE_REDIS_URL`

Observacoes:
1. A fase encontrou e corrigiu um gap real de runtime: o `helmet` estava publicando CSP global que bloqueava os scripts inline dos dashboards HTML internos; a rota agora aplica CSP especifico por dashboard.
2. A automacao headless fixa o filtro local `period=all` para evitar falso negativo quando o dataset controlado contem timestamps historicos.
3. O bootstrap Docker live agora usa containers nomeados por execucao e limpeza por `label`, evitando conflito de rerun local em `phase33`/`phase34`.

## Governanca live recorrente da observabilidade (Fase 34)
Executar o fluxo oficial CI-friendly da trilha live:
```bash
npm run test:phase34
npm run monitor:fullcycle:observability:live
```

Saidas adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_REPORT_FILE`
2. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_DASHBOARD_FILE`
3. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_AUDIT_FILE`

Capacidades adicionais:
1. reaproveita o motor live da Fase 33, mas consolida a execucao em um relatorio executivo unico;
2. endurece shape/contrato dos endpoints observability live via smoke estruturado;
3. valida cobertura minima dos checks obrigatorios da API interna e do painel headless;
4. opera em `docker-bootstrap` ou `external-services`, o que permite usar services do CI sem depender de Docker-in-Docker;
5. registra dashboard markdown de governanca com status, artefatos e violacoes;
6. a partir da Fase 35, passa a exigir `200` nos endpoints legados `summary`, `feed`, `history` e `dashboard`.

Variaveis principais adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_LIVE_BROWSER_ARGS`
2. `FULLCYCLE_CONNECTOR_OBS_LIVE_RUNTIME_PROFILE`
3. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_REPORT_FILE`
4. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_DASHBOARD_FILE`
5. `FULLCYCLE_CONNECTOR_OBS_LIVE_GOVERNANCE_AUDIT_FILE`

## Convergencia da trilha legada de observability (Fase 35)
Materializar a trilha antiga a partir do backend-first:
```bash
npm run test:phase35
npm run monitor:fullcycle:observability:compat
```

Saidas adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_COMPAT_REPORT_FILE`
2. `FULLCYCLE_CONNECTOR_OBS_COMPAT_DASHBOARD_FILE`
3. `FULLCYCLE_CONNECTOR_OBS_COMPAT_AUDIT_FILE`

Capacidades adicionais:
1. reaproveita `backend-store`, `backend-report` e `backend-analytics` como fonte unica;
2. materializa os payloads legados consumidos por `/api/observability/connectors/summary`, `/feed`, `/history` e `/dashboard`;
3. reduz a duplicidade operacional entre a trilha antiga e a backend-first;
4. endurece o gate live/CI para tratar qualquer `503` nesses endpoints como falha real.

## Painel operacional backend-first (Fase 31)
Publicar painel operacional consumindo o backend dedicado + stream SSE + SLA da API interna:
```bash
npm run monitor:fullcycle:observability:panel
```

Capacidades adicionais:
1. usa `/api/observability/connectors/incidents/summary` e `/incidents` como fonte principal de incidentes;
2. usa `/api/observability/connectors/alerts/summary` e `/alerts` como fonte principal de alertas;
3. usa `/api/observability/connectors/api-sla/summary` para `operator` e `/api-sla/history` para `executive/admin`;
4. usa `/api/observability/connectors/backend/summary` para enriquecer a postura operacional em `operator+` e `/backend/report` para detalhe executivo;
5. elimina bootstrap local de eventos/SLA embutido no HTML e expõe filtro por equipe.

Controles adicionais:
1. `FULLCYCLE_CONNECTOR_OBS_PANEL_AUTO_CONNECT`
2. `FULLCYCLE_CONNECTOR_OBS_PANEL_REFRESH_MS`
3. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_STORE`
4. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_BACKEND_PASS`
5. `FULLCYCLE_CONNECTOR_OBS_PANEL_REQUIRE_TEAM_ROUTING`
6. `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS`

Drill da fase:
```bash
npm run test:phase31
```

CI (Fase 31):
1. `test:phase31` (drill pass/fail do painel backend-first);
2. `monitor:fullcycle:observability:panel` (gate oficial do painel consumindo backend dedicado).

## Execucao recorrente
Exemplo (Linux cron):
```bash
*/5 * * * * cd /caminho/supervisor-comercial && npm run monitor:check >> logs/monitoring/cron.log 2>&1
```

## Observacoes operacionais
1. Em `all-in-docker`, o health HTTP do worker nao e publicado por padrao; o check Docker cobre esse caso.
2. Para monitoramento externo fora do host Docker, exponha health do worker ou execute o probe dentro da mesma rede Docker.
