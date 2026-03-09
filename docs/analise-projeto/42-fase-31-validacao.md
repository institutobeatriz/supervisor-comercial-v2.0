# 42 - Fase 31 - Validacao

## Escopo da fase
Integrar o painel operacional realtime ao backend dedicado de incidents/alerts, com:
1. consumo backend-first dos endpoints internos de incidents/alerts;
2. abandono do payload local embutido no HTML;
3. filtros operacionais por equipe, severidade, source, ambiente, status e periodo;
4. drill automatizado pass/fail da fase;
5. oficializacao do painel novo em scripts, CI, smoke e documentacao.

## Entregas principais
1. Script oficial do painel backend-first:
- `scripts/phase31-observability-panel-backend-integration.mjs`
2. Template HTML dedicado do painel:
- `scripts/phase31-observability-panel-backend-template.html`
3. Drill automatizado da fase:
- `scripts/phase31-observability-panel-backend-integration-drill.mjs`
4. Integracao operacional:
- `package.json`
- `scripts/ci-api-smoke.mjs`
- `.github/workflows/ci.yml`
5. Documentacao operacional:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Contrato implementado
### Painel backend-first
1. O HTML final deixa de carregar `events` e `slaHistory` embutidos no build.
2. O painel passa a consultar:
- `GET /api/observability/connectors/incidents/summary`
- `GET /api/observability/connectors/incidents`
- `GET /api/observability/connectors/alerts/summary`
- `GET /api/observability/connectors/alerts`
- `GET /api/observability/connectors/api-sla/summary`
- `GET /api/observability/connectors/api-sla/history` (`executive/admin`)
- `GET /api/observability/connectors/backend/report` (`executive/admin`)
- `GET /api/observability/connectors/stream` (SSE)
3. O filtro de equipe passa a refletir o `backendStore.teams` real, que vem do backend dedicado.
4. O painel usa SSE apenas para timeline realtime e refresh backend on-demand/auto-refresh para incidents/alerts/SLA.

### Gate operacional da fase
1. O gerador do painel agora falha quando:
- o backend store nao existe;
- o backend report nao esta `pass` quando exigido;
- o numero minimo de equipes nao e atingido;
- existem incidents/alerts sem equipe atribuida;
- stream/SLA ficam fora das metas configuradas.
2. O comando oficial `monitor:fullcycle:observability:panel` passa a apontar para a Fase 31.

## Validacoes executadas
1. Sintaxe dos artefatos novos:
- `node --check scripts/phase31-observability-panel-backend-integration.mjs` => sucesso
- `node --check scripts/phase31-observability-panel-backend-integration-drill.mjs` => sucesso
- `node --check scripts/ci-api-smoke.mjs` => sucesso
2. Drill da fase:
- `npm run test:phase31` => sucesso
3. Regressao:
- `npm run test:phase30` => sucesso
- `npm run test:phase29` => sucesso
4. Build/API:
- `npm run build -w @supervisor/api` => sucesso
5. Validacao adicional do HTML gerado:
- script inline do `panel-dashboard.html` compilado com `new Function(...)` => sucesso
6. Gate operacional controlado:
- `npm run monitor:fullcycle:observability:panel` => sucesso (`status=pass`)

## Evidencias
1. Drill da fase:
- `logs/monitoring/phase31-drill/panel-report.json`
- `logs/monitoring/phase31-drill/panel-dashboard.html`
- `logs/monitoring/phase31-drill/panel-audit.jsonl`
2. Operacao controlada:
- `logs/monitoring/phase31-gate/panel-report.json`
- `logs/monitoring/phase31-gate/panel-dashboard.html`
- `logs/monitoring/phase31-gate/panel-audit.jsonl`

## Resultado observado
1. O painel oficial passa a trabalhar sobre contratos reais da API interna, sem dependencia de bootstrap file-based.
2. Incidents e alerts ficam alinhados ao store consolidado da Fase 30 e ao RBAC da API interna.
3. O consumo de SLA agora respeita perfil operacional vs executivo:
- `operator` usa `summary`;
- `executive/admin` pode consumir `history` e `backend/report`.
4. O gate do painel passa a validar equipe/routing, o que fecha a ligacao entre UX operacional e governanca do backend dedicado.

## Riscos residuais
1. O smoke da API foi expandido para endpoints/filtros novos, mas nao foi executado contra uma API live neste turno.
2. O template HTML foi validado em sintaxe e por drill, mas nao houve teste navegador/headless ponta a ponta neste turno.
3. A matriz de roteamento segue estatica por arquivo/env; ainda nao integra calendario real de on-call.

## Proxima fase sugerida
1. Fase 32 - integrar a matriz de roteamento do backend com escala real de on-call/calendario e iniciar analytics historico por equipe/severidade/escalonamento.
