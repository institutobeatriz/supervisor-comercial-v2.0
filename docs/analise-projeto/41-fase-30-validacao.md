# 41 - Fase 30 - Validacao

## Escopo da fase
Consolidar incidents/alerts da trilha de observabilidade realtime em um backend dedicado, com:
1. store persistido para consumo server-side;
2. rotas internas novas para incidents/alerts/backend;
3. matriz de roteamento por severidade/equipe;
4. drill automatizado pass/fail;
5. integracao na trilha operacional (`package.json`, CI, smoke e docs).

## Entregas principais
1. Script de consolidacao backend:
- `scripts/phase30-observability-backend-consolidation.mjs`
2. Drill automatizado da fase:
- `scripts/phase30-observability-backend-consolidation-drill.mjs`
3. Template de roteamento:
- `config/observability-routing.example.json`
4. Evolucao da API interna:
- `apps/api/src/routes/observability.ts`
5. Smoke e pipeline:
- `scripts/ci-api-smoke.mjs`
- `package.json`
- `.github/workflows/ci.yml`
6. Documentacao operacional:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Contrato implementado
### Artefatos persistidos
1. `FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE`
- incidents normalizados;
- alerts normalizados;
- teams agregados;
- matriz de routing aplicada;
- resumo executivo com status de stream/alerting/SLA.
2. `FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE`
- configuracao efetiva;
- contadores de entrada;
- violacoes e status final.
3. `FULLCYCLE_CONNECTOR_OBS_BACKEND_DASHBOARD_FILE`
- dashboard markdown operacional do backend.
4. `FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE`
- trilha append-only por execucao.

### Endpoints internos novos
1. `GET /api/observability/connectors/incidents/summary` (`operator+`)
2. `GET /api/observability/connectors/incidents` (`operator+`)
3. `GET /api/observability/connectors/alerts/summary` (`operator+`)
4. `GET /api/observability/connectors/alerts` (`operator+`)
5. `GET /api/observability/connectors/backend/report` (`executive+`)
6. `GET /api/observability/connectors/backend/dashboard` (`executive+`)

## Validacoes executadas
1. Sintaxe dos artefatos novos:
- `node --check scripts/phase30-observability-backend-consolidation.mjs` => sucesso
- `node --check scripts/phase30-observability-backend-consolidation-drill.mjs` => sucesso
2. Drill da fase:
- `npm run test:phase30` => sucesso
3. Regressao:
- `npm run test:phase29` => sucesso
- `npm run test:phase28` => sucesso
4. Build/API:
- `npm run build -w @supervisor/api` => sucesso
5. Gate operacional controlado:
- `npm run monitor:fullcycle:observability:backend` => sucesso (`status=pass`)

## Evidencias
1. Drill:
- `logs/monitoring/phase30-drill/backend-report.json`
- `logs/monitoring/phase30-drill/backend-store.json`
- `logs/monitoring/phase30-drill/backend-dashboard.md`
- `logs/monitoring/phase30-drill/backend-audit.jsonl`
2. Operacao controlada:
- `logs/monitoring/phase30-op-run/backend-report.json`
- `logs/monitoring/phase30-op-run/backend-store.json`
- `logs/monitoring/phase30-op-run/backend-dashboard.md`
- `logs/monitoring/phase30-op-run/backend-audit.jsonl`

## Resultado observado
1. O backend agora consolida incidents e alerts sem depender de leitura ad hoc em cada consumidor.
2. O roteamento por severidade/equipe fica centralizado e versionado por arquivo de configuracao.
3. A API interna passou a expor consultas filtraveis para incidents/alerts, preparando o painel para migrar do modelo file-based para consumo server-side.
4. O estado de dispatch do alerting passa a ser preservado no store consolidado, inclusive em resolucao de alertas.

## Riscos residuais
1. O painel HTML da fase 29 ainda nao consome esses endpoints novos diretamente; ele continua usando SSE + API SLA e bootstrap estatico.
2. A validacao de smoke para os endpoints novos foi integrada ao CI, mas nao foi executada contra uma API live neste turno.
3. A matriz de routing e estatica por arquivo/env; ainda nao integra escala real de on-call/calendario.

## Proxima fase sugerida
1. Fase 31 - integrar o painel operacional realtime ao backend dedicado de incidents/alerts, com refresh visual por equipe/severidade e abandono do bootstrap local legado.
