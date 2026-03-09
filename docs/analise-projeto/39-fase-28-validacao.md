# 39 - Fase 28 - Alerting Proativo da Observabilidade Realtime (Fanout + SLA Historico da API Interna)

## Data
- 2026-03-09 (America/Sao_Paulo)

## Objetivo da fase
Completar a operacao realtime com resposta proativa:
1. fanout de alertas para canais executivos com deduplicacao/cooldown;
2. historico temporal de SLA da API interna de observabilidade;
3. gate de alerting integrado ao CI e trilha de auditoria.

## Implementacoes realizadas
1. Motor de alerting e SLA historico:
- criado `scripts/phase28-observability-realtime-alerting.mjs` com:
  - leitura de estado realtime (`FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE`);
  - leitura de governanca da API (`FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE`);
  - calculo de snapshot SLA (availability, latency, payload age, blocking violations);
  - persistencia de historico de SLA:
    - `FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_API_SLA_DASHBOARD_FILE`;
  - politicas executivas configuraveis de alerting/SLA;
  - dedupe por issue + cooldown + opcao only-on-new;
  - fanout multicanal com fallback:
    - webhook, slack, discord, telegram;
  - saidas da fase:
    - `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DASHBOARD_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_AUDIT_FILE`.

2. Drill automatizado da fase:
- criado `scripts/phase28-observability-realtime-alerting-drill.mjs` com mock server local;
- cenarios validados:
  - `pass` sem dispatch;
  - `fail` com fanout multicanal + saida nao-zero em modo estrito;
  - `dedupe` sem redisparo em execucao subsequente com mesmo conjunto de issues.

3. Evolucao da API interna:
- `apps/api/src/routes/observability.ts` atualizado com endpoints:
  - `GET /api/observability/connectors/api-sla/summary` (operator+)
  - `GET /api/observability/connectors/api-sla/history` (executive+)
- endpoint SSE da fase 27 mantido e compativel com novos artefatos.

4. Integracao operacional e CI:
- `package.json` atualizado com:
  - `test:phase28`
  - `monitor:fullcycle:observability:alerting`
- `.github/workflows/ci.yml` atualizado com:
  - `Connector observability realtime alerting drill (phase28)`
  - `Connector observability realtime alerting gate`
  - envs dedicadas de alerting/SLA.

5. Cobertura de smoke API:
- `scripts/ci-api-smoke.mjs` atualizado com:
  - `observability_api_sla_summary`.

6. Documentacao e configuracao:
- atualizados:
  - `.env.example`
  - `README.md`
  - `docs/monitoramento-externo.md`
  - `docs/runbook-operacional.md`

## Validacao tecnica executada
1. Sanidade de sintaxe:
- `node --check scripts/phase28-observability-realtime-alerting.mjs` => sucesso.
- `node --check scripts/phase28-observability-realtime-alerting-drill.mjs` => sucesso.
- `node --check scripts/ci-api-smoke.mjs` => sucesso.

2. Drill da fase:
- `npm run test:phase28` => sucesso.
- saida: `[OK] phase28 drill realtime alerting pass/fail fanout and dedupe validated`.

3. Regressao minima:
- `npm run test:phase27` => sucesso.
- `npm run test:phase26` => sucesso.

4. Build/API:
- `npm run build -w @supervisor/api` => sucesso.

5. Gate operacional da fase (dataset controlado):
- `npm run monitor:fullcycle:observability:alerting` => sucesso (`status=pass`).

## Evidencias
1. `scripts/phase28-observability-realtime-alerting.mjs`
2. `scripts/phase28-observability-realtime-alerting-drill.mjs`
3. `apps/api/src/routes/observability.ts`
4. `scripts/ci-api-smoke.mjs`
5. `logs/monitoring/phase28-drill/fullcycle-connector-observability-alerting-report.json`
6. `logs/monitoring/phase28-drill/fullcycle-connectors-observability-alerting.md`
7. `logs/monitoring/phase28-drill/fullcycle-connector-observability-api-sla-history.json`
8. `logs/monitoring/phase28-drill/fullcycle-connectors-observability-api-sla.md`
9. `logs/monitoring/phase28-drill/op-alert-report.json`
10. `logs/monitoring/phase28-drill/op-api-sla-history.json`

## Riscos residuais
1. fanout em producao depende da configuracao correta dos canais e politicas de cooldown.
2. historico SLA permanece file-based; para retenção longa recomenda-se backend dedicado.
3. sem UI rica de timeline/filtros ainda; visao atual e markdown + endpoints internos.

## Conclusao
Fase 28 concluida:
1. alerting proativo realtime com dedupe/cooldown e fanout multicanal operacionalizado;
2. historico temporal de SLA da API interna disponivel e rastreavel;
3. CI com drill e gate de alerting/SLA integrado ao pipeline.
