# 53 - Fase 42 - Produtor Dedicado do Provider Operacional

## Objetivo da fase
Conectar o contrato canônico `fullcycle.observability.operational-provider.v1` a um produtor dedicado e tornar esse produtor a entrada oficial do backend observability, preservando os contratos existentes de `backend/provider`, `backend/summary`, `backend/analytics`, painel, smoke, live e compatibilidade.

## Escopo fechado
1. Criar um wrapper producer-backed oficial para o backend observability.
2. Formalizar metadata adicional do produtor dentro do contrato materializado.
3. Expor um endpoint dedicado para o estado do produtor.
4. Desabilitar `legacy_files` no caminho oficial da Fase 42.
5. Validar localmente e no repo standalone canônico de CI.

## Decisao arquitetural
1. O schema oficial permanece `fullcycle.observability.operational-provider.v1`.
2. A Fase 42 separa explicitamente duas etapas:
- producao do contrato operacional;
- consumo runtime do backend a partir do contrato materializado.
3. O gate oficial `monitor:fullcycle:observability:backend` passa a executar `scripts/phase42-observability-operational-provider-producer.mjs`.
4. O fallback `legacy_files` deixa de ser permitido no caminho oficial do backend, com alvo de deprecacao marcado como `phase43-disable-legacy-fallback`.

## Entregas implementadas
1. Wrapper oficial da fase:
- `scripts/phase42-observability-operational-provider-producer.mjs`
2. Drill pass/fail da fase:
- `scripts/phase42-observability-operational-provider-producer-drill.mjs`
3. Contrato/metadata do provider atualizados:
- `scripts/observability-operational-provider.mjs`
4. Integracoes atualizadas:
- `scripts/phase39-observability-backend-operational-oncall.mjs`
- `scripts/phase40-observability-operational-source-health.mjs`
- `scripts/phase41-observability-operational-provider-contract.mjs`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase34-observability-live-governance.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `scripts/ci-api-smoke.mjs`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.js`
- `apps/api/src/routes/observability.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`
5. Documentacao operacional atualizada:
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`
- `docs/fullcycle-connectors-observability-operational-producer.md`
- `docs/fullcycle-connectors-observability-operational-provider.md`
- `docs/fullcycle-connectors-observability-live-governance.md`

## Decisoes tecnicas relevantes
1. O helper canônico do provider passa a aceitar metadata de producer e persisti-la no contrato materializado.
2. O novo endpoint `GET /api/observability/connectors/backend/producer` expõe o sumario do produtor para `operator+`.
3. O smoke/governanca live passam a exigir `backend/producer` como parte do contrato mínimo.
4. O painel backend-first passa a refletir `producerMode` e `legacyFallbackState`.
5. O caminho oficial do backend executa o consumer da Fase 41 com:
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE=false`
- `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK=false`

## Validacao executada
1. Sintaxe:
- `node --check scripts/observability-operational-provider.mjs`
- `node --check scripts/phase42-observability-operational-provider-producer.mjs`
- `node --check scripts/phase42-observability-operational-provider-producer-drill.mjs`
- `node --check scripts/phase33-observability-live-runtime-validation.mjs`
- `node --check scripts/ci-api-smoke.mjs`
- `node --check apps/api/src/routes/observability.ts`
2. Drills/regressoes locais:
- `npm run test:phase42`
- `npm run test:phase41`
- `npm run test:phase39`
- `npm run test:phase40`
- `npm run test:phase33`
- `npm run test:phase34`
- `npm run test:phase37`
3. Build/gates locais:
- `npm run build -w @supervisor/api`
- `npm run monitor:fullcycle:observability:backend`
- `npm run monitor:fullcycle:observability:live`
4. Validacao remota:
- `npm run standalone:sync`
- `npm run standalone:sync:check`
- `node scripts/phase37-standalone-publish.mjs --watch-ci --commit-message "feat(observability): add dedicated operational producer" --pr-title "feat(observability): dedicated operational producer" --watch-timeout-ms 1800000`

## Resultado observado
1. `npm run test:phase42` => `pass`.
2. O drill da Fase 42 validou:
- `materialize`: produz contrato + producer report + backend consumer usando `sourceMode=operational_contract`;
- `replay`: remove os arquivos brutos e continua a partir do contrato existente;
- `fail`: sem brutos e sem contrato, o wrapper falha como esperado.
3. `npm run test:phase33` => `pass`, com:
- `smokeOk=34`
- `producerStatus=200`
- `producerMode=dedicated_script`
- `browserBootstrapAuthNoise=0`
4. `npm run test:phase34` => `status=pass`, `contracts=24/24`.
5. `npm run monitor:fullcycle:observability:backend` no workspace real => `pass`, com:
- `producer=dedicated_script`
- `contract=ready`
- `legacy=disabled`
- backend consumer interno em `warn` esperado por frescor/workload real do workspace.
6. `npm run monitor:fullcycle:observability:live` => `status=pass`, `smokeOk=34`, `contracts=24/24`, `producerStatus=200`.
7. Repo standalone canônico:
- PR `#9`: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/9`
- GitHub Actions run `22874254804`: `success`
- commit standalone: `e65e0ff910ef21b54c4fdc187c15b3cf9c9c5ea2`

## Evidencia objetiva
1. `logs/monitoring/phase42-drill/producer-report.json`
2. `logs/monitoring/fullcycle-connector-observability-operational-producer-report.json`
3. `docs/fullcycle-connectors-observability-operational-producer.md`
4. `logs/monitoring/fullcycle-connector-observability-operational-provider.json`
5. `docs/fullcycle-connectors-observability-operational-provider.md`
6. `logs/monitoring/phase34-live/live-validation-report.json`
7. `docs/fullcycle-connectors-observability-live-governance.md`
8. `logs/monitoring/standalone-export-publish-report.json`
9. `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22874254804`

## Riscos residuais
1. O produtor dedicado ainda consome artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao um coletor/servico operacional dedicado.
2. O caminho `legacy_files` continua existindo como compatibilidade no helper, embora o caminho oficial da Fase 42 ja o desabilite.
3. O repo canônico de CI remoto continua separado do git root principal do workspace.

## Proxima fase liberada
Fase 43 - transformar `phase43-disable-legacy-fallback` em enforcement real em todos os caminhos observability e preparar a interface do coletor/servico dedicado que substituira a alimentacao file-based do producer.
