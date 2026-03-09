# 37 - Fase 26 - Governanca da API Interna de Observabilidade (Contrato + RBAC + Auth + SLA)

## Data
- 2026-03-09 (America/Sao_Paulo)

## Objetivo da fase
Fechar a governanca operacional da API interna de observabilidade:
1. validar contrato dos endpoints expostos ao dashboard interno;
2. validar controles de acesso (RBAC) e autenticacao (`x-admin-key`);
3. adicionar gate automatizado com criterio de latencia e frescor de payload.

## Implementacoes realizadas
1. Engine de governanca da API:
- criado `scripts/phase26-observability-api-governance.mjs` com:
  - probes HTTP para endpoints:
    - `/api/observability/connectors/summary`
    - `/api/observability/connectors/feed`
    - `/api/observability/connectors/history`
    - `/api/observability/connectors/archive`
    - `/api/observability/connectors/dashboard`
  - validacao de contrato por endpoint (JSON/HTML);
  - validacao de latencia maxima por endpoint;
  - validacao de frescor do payload (`summary.payload.generatedAt`);
  - validacoes de seguranca:
    - operator nao pode acessar `history`;
    - role invalida nao pode acessar `summary`;
    - chave admin invalida deve retornar `401`;
  - saidas:
    - `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE`
    - `FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE`.

2. Drill automatizado da fase:
- criado `scripts/phase26-observability-api-governance-drill.mjs` com servidor mock local:
  - cenario `pass` validando contrato/RBAC/auth corretos;
  - cenario `fail` validando bloqueio de policy para:
    - `endpoint_contract_invalid_summary`
    - `endpoint_contract_invalid_dashboard`
    - `rbac_history_operator_not_forbidden`
    - `rbac_invalid_role_not_forbidden`.

3. Integracao operacional:
- `package.json` atualizado com:
  - `test:phase26`
  - `monitor:fullcycle:observability:api`
- `.github/workflows/ci.yml` atualizado com:
  - `Connector observability API governance drill (phase26)`
  - `Connector observability API governance gate`
  - envs dedicadas de governanca da API.

4. Ampliacao de smoke de API:
- `scripts/ci-api-smoke.mjs` atualizado para cobrir tambem:
  - `observability_feed`
  - `observability_history`
  - `observability_archive`
  - `observability_dashboard`
  com status aceitos `200/503`.

5. Documentacao operacional e env:
- atualizados:
  - `.env.example`
  - `README.md`
  - `docs/monitoramento-externo.md`
  - `docs/runbook-operacional.md`

## Validacao tecnica executada
1. Sanidade de sintaxe:
- `node --check scripts/phase26-observability-api-governance.mjs` => sucesso.
- `node --check scripts/phase26-observability-api-governance-drill.mjs` => sucesso.
- `node --check scripts/ci-api-smoke.mjs` => sucesso.

2. Drill da fase:
- `npm run test:phase26` => sucesso.
- saida: `[OK] phase26 drill observability API governance pass/fail behavior validated`.

3. Regressao minima:
- `npm run test:phase25` => sucesso.
- `npm run build -w @supervisor/api` => sucesso.

## Evidencias
1. `scripts/phase26-observability-api-governance.mjs`
2. `scripts/phase26-observability-api-governance-drill.mjs`
3. `scripts/ci-api-smoke.mjs`
4. `logs/monitoring/phase26-drill/fullcycle-connector-observability-api-governance-report.json`
5. `logs/monitoring/phase26-drill/fullcycle-connectors-observability-api-governance.md`
6. `logs/monitoring/phase26-drill/fullcycle-connector-observability-api-governance-audit.jsonl`

## Riscos residuais
1. gate de governanca depende da disponibilidade da API no ambiente alvo (`FULLCYCLE_CONNECTOR_OBS_API_BASE`).
2. validacao contratual e semantica (schema) cobre formato essencial, mas nao substitui testes funcionais de negocio do dashboard.
3. tempos de latencia e idade de payload precisam tuning por ambiente (dev/ci/prod) para evitar falsos positivos.

## Conclusao
Fase 26 concluida:
1. API interna de observabilidade passou a ter gate dedicado de contrato, seguranca e performance;
2. CI recebeu drill e gate operacional especificos;
3. rastreabilidade operacional foi ampliada com relatorio, dashboard e trilha de auditoria da governanca da API.
