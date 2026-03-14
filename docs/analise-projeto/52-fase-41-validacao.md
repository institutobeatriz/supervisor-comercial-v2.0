# 52 - Fase 41 - Provider Operacional Canonico

## Objetivo da fase
Fechar a decisao arquitetural da ingestao operacional do backend observability, formalizando uma fronteira canonica versionada entre os produtores operacionais e os consumidores runtime, sem perder os sinais de `workload`, `freshness` e `actionability` introduzidos na Fase 40.

## Escopo fechado
1. Definir o caminho canonico da ingestao operacional.
2. Implementar contrato/versionamento proprio para o provider operacional.
3. Fazer backend/API/painel/live/smoke consumirem o provider canônico.
4. Preservar replay e compatibilidade operacional sem reabrir a trilha backend-first.
5. Validar localmente e no repo standalone canonico de CI.

## Decisao arquitetural
1. A Fase 41 escolheu `materializacao controlada com contrato versionado`.
2. O schema canonico oficial passa a ser `fullcycle.observability.operational-provider.v1`.
3. O provider materializado vira a fronteira oficial entre:
- coleta operacional (`incident automation`, `itsm snapshot`, `fullcycle report`);
- consumo runtime (`backend/summary`, `backend/report`, `backend/analytics`, painel, smoke, live, compat).
4. O modo `legacy_files` permanece apenas como fallback controlado, nao como caminho preferencial.

## Entregas implementadas
1. Helper canônico do provider operacional:
- `scripts/observability-operational-provider.mjs`
2. Wrapper oficial da fase:
- `scripts/phase41-observability-operational-provider-contract.mjs`
3. Drill `materialize/replay/fail`:
- `scripts/phase41-observability-operational-provider-contract-drill.mjs`
4. Integracoes atualizadas:
- `scripts/phase39-observability-backend-operational-oncall.mjs`
- `scripts/phase39-observability-backend-operational-oncall-drill.mjs`
- `scripts/phase40-observability-operational-source-health.mjs`
- `scripts/phase40-observability-operational-source-health-drill.mjs`
- `scripts/phase31-observability-panel-backend-integration.mjs`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.js`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase34-observability-live-governance.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `scripts/ci-api-smoke.mjs`
- `apps/api/src/routes/observability.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`
5. Documentacao operacional atualizada:
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`
- `docs/fullcycle-connectors-observability-operational-provider.md`

## Decisoes tecnicas relevantes
1. O backend observability deixa de depender diretamente da leitura simultanea dos tres arquivos operacionais brutos durante o consumo runtime.
2. O provider passa a publicar metadata padronizada:
- `providerMode`
- `version`
- `schema`
- `contractLoaded`
- `contractGeneratedAt`
- `materializationMode`
- `materializedBy`
- `summary`
- `sources`
3. O endpoint novo `GET /api/observability/connectors/backend/provider` expõe o contrato carregado para `operator+`.
4. O painel backend-first passa a refletir o provider canônico via `backend/summary`.
5. O smoke/governanca live passam a exigir o endpoint `backend/provider`.
6. A trilha live ganhou bootstrap Docker resiliente a reruns locais, com containers nomeados por execucao e limpeza por `label`.

## Validacao executada
1. Sintaxe:
- `node --check scripts/observability-operational-provider.mjs`
- `node --check scripts/phase39-observability-backend-operational-oncall.mjs`
- `node --check scripts/phase40-observability-operational-source-health.mjs`
- `node --check scripts/phase41-observability-operational-provider-contract.mjs`
- `node --check scripts/phase41-observability-operational-provider-contract-drill.mjs`
- `node --check scripts/phase33-observability-live-runtime-validation.mjs`
- `node --check scripts/phase35-observability-legacy-convergence.mjs`
- `node --check scripts/ci-api-smoke.mjs`
- `node --check scripts/assets/fullcycle-connectors-observability-ops-panel.js`
2. Drills/regressoes locais:
- `npm run test:phase37`
- `npm run test:phase39`
- `npm run test:phase40`
- `npm run test:phase41`
- `npm run test:phase33`
- `npm run test:phase34`
3. Build/gates locais:
- `npm run build -w @supervisor/api`
- `npm run monitor:fullcycle:observability:backend`
- `npm run monitor:fullcycle:observability:live`
4. Validacao remota:
- `npm run standalone:sync`
- `npm run standalone:sync:check`
- `node scripts/phase37-standalone-publish.mjs --watch-ci --commit-message "feat(observability): formalize operational provider contract" --pr-title "feat(observability): operational provider contract" --watch-timeout-ms 1800000`

## Resultado observado
1. `npm run test:phase41` => `pass`.
2. O drill da Fase 41 validou:
- `materialize`: gera contrato e consome `sourceMode=operational_contract`;
- `replay`: remove os arquivos operacionais brutos e continua a partir do contrato existente;
- `fail`: sem brutos e sem contrato, o backend falha como esperado.
3. `npm run test:phase33` => `pass`.
4. `npm run test:phase34` => `status=pass`, `contracts=23/23`.
5. `npm run monitor:fullcycle:observability:backend` no workspace real terminou em `warn`, com `provider=materialized_contract`, `contract=ready` e `loadedSources=2`.
6. `npm run monitor:fullcycle:observability:live` => `status=pass`, `contracts=23/23`.
7. Repo standalone canonico:
- PR `#8`: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/8`
- GitHub Actions run `22872998907`: `success`
- commit standalone: `55a92e8f772f4ff936f12983c1a6421c9f8eaafd`

## Evidencia objetiva
1. `logs/monitoring/phase41-drill/backend-report.json`
2. `logs/monitoring/phase33-live/live-validation-report.json`
3. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
4. `logs/monitoring/fullcycle-connector-observability-operational-provider.json`
5. `docs/fullcycle-connectors-observability-operational-provider.md`
6. `logs/monitoring/standalone-export-sync-report.json`
7. `logs/monitoring/standalone-export-publish-report.json`
8. `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22872998907`

## Riscos residuais
1. O provider canônico ainda e materializado a partir de artefatos locais, nao de um coletor/servico operacional dedicado.
2. O modo `legacy_files` ainda existe como fallback controlado e precisara de estrategia de deprecacao.
3. `docs/fullcycle-connectors-observability-live-governance.md` e `docs/fullcycle-connectors-observability-compat.md` continuam sendo artefatos gerados e mudam a cada execucao do gate.
4. O repo canonico de CI remoto continua separado do git root principal do workspace.

## Proxima fase liberada
Fase 42 - conectar o provider operacional canônico a um produtor/coletor dedicado e definir o caminho de desativacao do fallback `legacy_files`, preservando os contratos de `backend/provider`, `backend/summary`, `backend/analytics`, painel, smoke e live.
