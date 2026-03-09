# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/51-fase-40-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 40
- Proxima fase liberada: Fase 41
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 40 concluidas e registradas na memoria oficial.
- A trilha live/backend-first continua validada localmente apos remocao de assets inline.
- O painel realtime e o dashboard executivo interno passaram a operar com assets externos e CSP endurecida.
- A Fase 38 ja foi propagada para o repo canonico de CI com PR e GitHub Actions verde.
- A Fase 39 migrou o backend observability oficial para ownership operacional-first (`incident automation` + `snapshot` + `fullcycle`) e manteve compat/live/painel consistentes.
- A Fase 40 adicionou source health/freshness operacional, endpoint `backend/summary`, diferenciacao `idle` vs `idle_gap` e live/CI com contrato endurecido.

## O que a Fase 40 entregou
- Wrapper oficial de source health em `scripts/phase40-observability-operational-source-health.mjs`.
- Drill `healthy/stale/missing` em `scripts/phase40-observability-operational-source-health-drill.mjs`.
- Endpoint `GET /api/observability/connectors/backend/summary` em `apps/api/src/routes/observability.ts`.
- Painel backend-first com source health em `scripts/assets/fullcycle-connectors-observability-ops-panel.js` e `scripts/phase31-observability-panel-backend-integration.mjs`.
- Trilha live recompilando `@supervisor/api` antes do boot e exigindo `backend/summary` em `scripts/phase33-observability-live-runtime-validation.mjs`, `scripts/phase34-observability-live-governance.mjs` e `scripts/ci-api-smoke.mjs`.

## Ultima entrega relevante
### Fase 40
- Evidencia oficial: `docs/analise-projeto/51-fase-40-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Novo backend oficial: `scripts/phase40-observability-operational-source-health.mjs`
- Novo drill: `scripts/phase40-observability-operational-source-health-drill.mjs`
- Repo standalone canonico:
  - PR: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/7`
  - CI run: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22871354963`
  - Commit standalone: `c429967e4dd081fee08095550583106db93fb9aa`

## Arquivos alterados na fase concluida
- `scripts/phase40-observability-operational-source-health.mjs`
- `scripts/phase40-observability-operational-source-health-drill.mjs`
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
- `.env.example`
- `README.md`
- `docs/monitoramento-externo.md`
- `docs/runbook-operacional.md`
- `docs/analise-projeto/51-fase-40-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase31`: OK
- `npm run test:phase32`: OK
- `npm run test:phase35`: OK
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run build -w @supervisor/api`: OK
- `npm run test:phase33`: OK
- `npm run test:phase34`: OK (`status=pass`, `contracts=22/22`)
- `npm run monitor:fullcycle:observability:live`: OK (`status=pass`, `contracts=22/22`)
- `npm run monitor:fullcycle:observability:backend`: `warn` local com `workload=idle`, `freshness=missing`, `action=idle_gap`, `coverage=100%` e `active=0`
- Repo standalone:
  - PR `#7` aberta com a entrega da Fase 40
  - GitHub Actions `22871354963`: OK (`success`)

## O que ainda nao foi fechado
- A origem operacional oficial continua dependendo de artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao de um provider/servico dedicado.
- `docs/fullcycle-connectors-observability-live-governance.md` e `docs/fullcycle-connectors-observability-compat.md` continuam sendo artefatos gerados; se outra rotina live/compat rodar depois, eles mudam novamente.

## Proximo passo exato
Iniciar a Fase 41 com este recorte:
1. decidir se a ingestao operacional sai de artefatos locais para provider externo dedicado ou materializacao controlada com contrato proprio;
2. se a decisao for provider, definir adaptador oficial e contrato/versionamento da coleta;
3. preservar os sinais da Fase 40 (`idle`, `idle_gap`, freshness por fonte) no caminho novo.

## Hipotese principal da proxima fase
- O maior gap estrutural restante nao e mais visibilidade da fonte operacional, e sim a dependencia de arquivos materializados locais.
- Se formalizarmos um provider/adaptador dedicado sem perder os sinais de freshness da Fase 40, o backend/painel ficam mais proximos da realidade produtiva.

## Como testar o estado atual
```bash
npm run test:phase24
npm run test:phase31
npm run test:phase35
npm run test:phase38
npm run test:phase40
npm run build -w @supervisor/api
npm run test:phase34
npm run monitor:fullcycle:observability:live
```

## Observacoes importantes
- Este diretorio continua dentro de um repo Git maior; nao confundir o Git do workspace com o repo standalone publicado.
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- `HANDOFF.md` resume apenas o estado atual.
- O repo standalone publicado segue sendo o repositorio canonico de CI remoto ate nova decisao estrutural.
- Ao terminar cada fase, atualizar este arquivo, `TODO_AI.md`, memoria oficial e criar commit WIP focado na fase.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `HANDOFF.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`
6. `docs/analise-projeto/51-fase-40-validacao.md`
7. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 41, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
