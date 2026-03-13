# 51 - Fase 40 - Saude e Frescor da Fonte Operacional

## Objetivo da fase
Endurecer a observabilidade da propria fonte operacional do backend observability, medindo frescor/saude de `incident automation`, `itsm snapshot` e `fullcycle report`, expondo esse estado em backend/API/painel e separando explicitamente `sem workload ativo` de `fonte operacional indisponivel`.

## Escopo fechado
1. Wrapper oficial do backend observability em cima da Fase 39.
2. Drill dedicado da Fase 40 cobrindo `healthy`, `stale` e `missing idle`.
3. Endpoint interno operator+ para resumo operacional do backend.
4. Painel backend-first refletindo `workloadState`, `freshnessState` e `actionabilityState`.
5. Trilha live/governance/CI remoto atualizada para exigir o novo contrato.

## Entregas implementadas
1. Wrapper oficial da fase:
- `scripts/phase40-observability-operational-source-health.mjs`
2. Drill pass/fail/idle-gap da fase:
- `scripts/phase40-observability-operational-source-health-drill.mjs`
3. Integrações atualizadas:
- `apps/api/src/routes/observability.ts`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.js`
- `scripts/phase31-observability-panel-backend-integration.mjs`
- `scripts/phase31-observability-panel-backend-template.html`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase34-observability-live-governance.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `scripts/ci-api-smoke.mjs`
- `package.json`
- `.github/workflows/ci.yml`
4. Documentacao operacional atualizada:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Decisoes tecnicas
1. A Fase 40 reaproveita a Fase 39 como baseline funcional e acrescenta a camada de source health sem reabrir a logica de ownership.
2. O backend oficial passa a publicar, por fonte, `loaded`, `timestamp`, `ageMinutes`, `freshnessState` e `requiredWhenActive`.
3. O agregado operacional passa a publicar `workloadState`, `freshnessState` e `actionabilityState` em:
- `backend store`;
- `backend report`;
- `backend analytics`;
- `backend summary` (API operator+);
- painel backend-first.
4. O caso `sem workload ativo` nao vira falha bloqueante por si so, mas passa a aparecer explicitamente como `idle` ou `idle_gap`.
5. A validacao live agora recompila `@supervisor/api` antes de subir a API real, evitando drift entre `src` e `dist`.

## Validacao executada
1. Sintaxe:
- `node --check scripts/phase40-observability-operational-source-health.mjs`
- `node --check scripts/phase40-observability-operational-source-health-drill.mjs`
- `node --check scripts/phase33-observability-live-runtime-validation.mjs`
- `node --check scripts/phase35-observability-legacy-convergence.mjs`
- `node --check scripts/phase31-observability-panel-backend-integration.mjs`
- `node --check scripts/ci-api-smoke.mjs`
- `node --check scripts/assets/fullcycle-connectors-observability-ops-panel.js`
2. Drills/regressoes locais:
- `npm run test:phase39`
- `npm run test:phase40`
- `npm run test:phase31`
- `npm run test:phase35`
- `npm run test:phase33`
- `npm run test:phase34`
3. Build/gates locais:
- `npm run build -w @supervisor/api`
- `npm run monitor:fullcycle:observability:backend`
- `npm run monitor:fullcycle:observability:live`
4. Validacao remota:
- `npm run standalone:sync`
- `npm run standalone:sync:check`
- `node scripts/phase37-standalone-publish.mjs --watch-ci --commit-message "feat(observability): track operational source freshness" --pr-title "feat(observability): operational source freshness" --watch-timeout-ms 1800000`

## Resultado observado
1. `npm run test:phase40` => `pass`.
2. O drill da Fase 40 validou:
- `healthy` com `workloadState=active`, `freshnessState=healthy`, `actionabilityState=ready`;
- `stale` com falha bloqueante por `operational_state_stale`, `operational_snapshot_stale` e `operational_fullcycle_report_stale`;
- `missing idle` com `status=pass`, `workloadState=idle`, `freshnessState=missing`, `actionabilityState=idle_gap`.
3. `npm run test:phase33` => `pass`.
4. `npm run test:phase34` => `status=pass`, `contracts=22/22`.
5. `npm run monitor:fullcycle:observability:backend` no workspace real terminou em `warn`, com `workload=idle`, `freshness=missing`, `action=idle_gap`, `coverage=100%` e `active=0`.
6. `npm run monitor:fullcycle:observability:live` => `status=pass`, `contracts=22/22`.
7. Repo standalone canonico:
- PR `#7`: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/7`
- GitHub Actions run `22871354963`: `success`
- commit standalone: `c429967e4dd081fee08095550583106db93fb9aa`

## Evidencia objetiva
1. `logs/monitoring/phase40-drill/backend-report.json`
2. `logs/monitoring/phase33-live/live-validation-report.json`
3. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
4. `logs/monitoring/standalone-export-sync-report.json`
5. `logs/monitoring/standalone-export-publish-report.json`
6. `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22871354963`

## Riscos residuais
1. A fonte operacional oficial continua baseada em artefatos locais materializados (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao em provider externo dedicado.
2. O painel agora mostra `idle_gap`, mas a decisao de migrar para um provider real ainda nao foi tomada.
3. O repo canonico de CI remoto continua separado do git root principal do workspace.

## Proxima fase liberada
Fase 41 - decidir e implementar o proximo passo da ingestao operacional: adaptar provider externo dedicado ou formalizar materializacao controlada com contratos/versionamento proprios.
