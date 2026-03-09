# 50 - Fase 39 - Ownership Operacional do Backend Observability

## Objetivo da fase
Substituir a origem file-based de ownership (`rotation/calendar`) no backend oficial de observability por uma trilha operacional-first baseada em estado de incident automation, snapshot ITSM e contexto full-cycle, preservando os contratos atuais de `backend/report`, `backend/analytics`, incidents, alerts, compat e painel backend-first.

## Escopo fechado
1. Backend oficial `monitor:fullcycle:observability:backend`.
2. Drill dedicado pass/fail da Fase 39.
3. Trilha live (`phase33` / `phase34`) consumindo a nova origem operacional.
4. Compatibilidade legada (`phase35`) bootstrapping o backend oficial da Fase 39.
5. CI local e GitHub Actions remoto do repo standalone.

## Entregas implementadas
1. Wrapper operacional oficial do backend:
- `scripts/phase39-observability-backend-operational-oncall.mjs`
2. Drill pass/fail da fase:
- `scripts/phase39-observability-backend-operational-oncall-drill.mjs`
3. Integrações atualizadas:
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `package.json`
- `.github/workflows/ci.yml`
4. Documentação operacional atualizada:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Decisoes tecnicas
1. A Fase 39 reaproveita a baseline da Fase 32 apenas como consolidacao/routing, mas desliga owner dinamico file-based nessa passagem intermediaria.
2. A resolucao final de owner passa a priorizar:
- snapshot paging;
- snapshot ticket;
- state local de incident automation;
- roster operacional derivado dessas evidencias;
- owner manual preservado apenas quando nenhuma evidencia operacional mais forte existir.
3. O wrapper passou a remover o ponto intermediario de analytics da baseline para evitar duplicidade historica por execucao.
4. Ausencia de fonte operacional deixa de bloquear a gate quando nao existem registros ativos para atribuir.
5. A trilha live passou a fixar explicitamente os aliases `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_*` para impedir interferencia do ambiente global do CI sobre fixtures controladas.

## Validacao executada
1. Sintaxe:
- `node --check scripts/phase39-observability-backend-operational-oncall.mjs`
- `node --check scripts/phase39-observability-backend-operational-oncall-drill.mjs`
- `node --check scripts/phase35-observability-legacy-convergence.mjs`
- `node --check scripts/phase33-observability-live-runtime-validation.mjs`
2. Drills/regressoes locais:
- `npm run test:phase31`
- `npm run test:phase32`
- `npm run test:phase35`
- `npm run test:phase33`
- `npm run test:phase34`
- `npm run test:phase39`
3. Build:
- `npm run build -w @supervisor/api`
4. Gates locais:
- `npm run monitor:fullcycle:observability:backend`
- `npm run monitor:fullcycle:observability:live`
5. Validacao remota:
- `npm run standalone:sync`
- `node scripts/phase37-standalone-publish.mjs --watch-ci --commit-message "fix(ci): allow empty operational backend gate" --pr-title "fix(ci): allow empty operational backend gate" --watch-timeout-ms 1800000`

## Resultado observado
1. `npm run test:phase39` => `pass`.
2. O drill da Fase 39 validou:
- passagem sem `rotation/calendar`;
- owner do incidente vindo de `operational_snapshot_paging`;
- owner do alerta vindo de `operational_roster`;
- falha controlada quando state/snapshot somem.
3. `npm run test:phase33` => `pass`.
4. `npm run test:phase34` => `status=pass`, `contracts=21/21`.
5. `npm run monitor:fullcycle:observability:live` => `status=pass`, `contracts=21/21`.
6. `npm run monitor:fullcycle:observability:backend` no workspace real terminou em `warn`, com `coverage=100%` e `active=0`; isso refletiu ausencia de workload operacional ativo materializado naquele momento e nao bloqueou a fase.
7. Repo standalone canonico:
- PR `#6`: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/6`
- GitHub Actions run `22870167052`: `success`
- commit standalone: `5e89ac71aee0c85e7a7a55044b7fed238bd6ef8a`

## Evidencia objetiva
1. `logs/monitoring/phase39-drill/backend-report.json`
2. `logs/monitoring/phase33-live/live-validation-report.json`
3. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
4. `logs/monitoring/standalone-export-sync-report.json`
5. `logs/monitoring/standalone-export-publish-report.json`
6. `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22870167052`

## Riscos residuais
1. A origem operacional oficial ainda depende de arquivos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`); a fase removeu `rotation/calendar` do caminho oficial, mas ainda nao trocou esses artefatos por uma fonte externa/servico dedicado.
2. O painel/live fixture da trilha operacional convergiu para `trackedTeams=1`; o drill especifico do painel continua cobrindo os cenarios pass/fail independentes.
3. Os artefatos gerados `docs/fullcycle-connectors-observability-compat.md` e `docs/fullcycle-connectors-observability-live-governance.md` continuam mudando a cada execucao e nao devem ser tratados como memoria historica.

## Proxima fase liberada
Fase 40 - endurecer a saude/frescor da fonte operacional (`incident automation` + `snapshot` + `fullcycle`) e expor esse estado na API/painel para distinguir claramente `sem workload ativo` de `fonte operacional indisponivel`.
