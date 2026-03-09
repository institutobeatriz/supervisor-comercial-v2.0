# 36 - Fase 25 - Productizacao da Observabilidade (Endpoint Interno + RBAC + Retention/Archive)

## Data
- 2026-03-09 (America/Sao_Paulo)

## Objetivo da fase
Transformar a camada de observabilidade em produto operacional consumivel pelo dashboard interno:
1. gerar payload estavel para API interna;
2. aplicar retention e arquivamento automatico do historico;
3. expor endpoints internos com autenticacao e RBAC.

## Implementacoes realizadas
1. Motor de productizacao:
- criado `scripts/phase25-observability-productization.mjs` com:
  - leitura de store/report/feed/dashboard da fase 24;
  - retention por idade e limite de entradas;
  - arquivamento de historico podado em JSONL;
  - geracao de payload estavel para API interna;
  - emissao de relatorio, dashboard markdown e audit trail da fase.

2. Drill automatizado:
- criado `scripts/phase25-observability-productization-drill.mjs` cobrindo:
  - cenario `pass` com retention + archive + payload API;
  - cenario `fail` em modo estrito com violacoes bloqueantes:
    - `observability_report_not_pass`;
    - `observability_feed_missing`;
    - `observability_dashboard_missing`;
    - `observability_history_empty_after_retention`.

3. API interna de observabilidade:
- criado `apps/api/src/routes/observability.ts` com endpoints:
  - `GET /api/observability/connectors/summary` (operator+);
  - `GET /api/observability/connectors/feed` (operator+);
  - `GET /api/observability/connectors/history` (executive+);
  - `GET /api/observability/connectors/archive` (executive+);
  - `GET /api/observability/connectors/dashboard` (executive+).
- autenticacao por `x-admin-key` (`ADMIN_API_KEY`);
- RBAC configuravel por:
  - `OBSERVABILITY_RBAC_ENABLED`;
  - `OBSERVABILITY_RBAC_OPERATOR_ROLES`;
  - `OBSERVABILITY_RBAC_EXECUTIVE_ROLES`.

4. Integracao no servidor e CI:
- `apps/api/src/index.ts` atualizado para registrar `observabilityRoutes`;
- `scripts/ci-api-smoke.mjs` atualizado com smoke de `summary`;
- `package.json` atualizado com:
  - `test:phase25`;
  - `monitor:fullcycle:productization`;
- `.github/workflows/ci.yml` atualizado com:
  - `Connector productization drill (phase25)`;
  - `Connector productization gate`.

5. Documentacao e configuracao:
- atualizados:
  - `.env.example`;
  - `README.md`;
  - `docs/monitoramento-externo.md`;
  - `docs/runbook-operacional.md`.

## Validacao tecnica executada
1. Sanidade de sintaxe:
- `node --check scripts/phase25-observability-productization.mjs` => sucesso.
- `node --check scripts/phase25-observability-productization-drill.mjs` => sucesso.
- `node --check apps/api/src/routes/observability.ts` => sucesso.

2. Drill da fase:
- `npm run test:phase25` => sucesso.
- saida: `[OK] phase25 drill API payload productization, retention/archive and strict policy gates validated`.

3. Regressao minima:
- `npm run test:phase24` => sucesso.

4. Build e gate operacional:
- `npm run build -w @supervisor/api` => sucesso.
- `npm run monitor:fullcycle:productization` (dataset controlado) => sucesso (`status=pass`).

## Evidencias
1. `scripts/phase25-observability-productization.mjs`
2. `scripts/phase25-observability-productization-drill.mjs`
3. `apps/api/src/routes/observability.ts`
4. `logs/monitoring/phase25-drill/fullcycle-connector-productization-report.json`
5. `logs/monitoring/phase25-drill/fullcycle-connectors-productization.md`
6. `logs/monitoring/phase25-drill/fullcycle-connector-observability-api-payload.json`
7. `logs/monitoring/phase25-drill/fullcycle-connector-observability-archive.jsonl`
8. `logs/monitoring/phase25-drill/fullcycle-connector-productization-audit.jsonl`

## Riscos residuais
1. armazenamento de historico e archive segue file-based, sem backend central de serie temporal.
2. consumo do endpoint interno depende de `ADMIN_API_KEY` e politica de roles corretamente configuradas por ambiente.
3. API de observabilidade ainda nao tinha gate dedicado de contrato/RBAC/frescor dos endpoints (enderecado na fase seguinte).

## Conclusao
Fase 25 concluida:
1. camada de observabilidade productizada com retention e archive;
2. payload estavel pronto para consumo interno;
3. endpoints internos com auth/RBAC operacionais.
