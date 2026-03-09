# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases, CI remoto canônico e continuidade entre Codex/Claude.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/52-fase-41-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 41
- Proxima fase liberada: Fase 42
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 41 concluidas e registradas na memoria oficial.
- A ingestao operacional agora tem uma fronteira canonica versionada: `fullcycle.observability.operational-provider.v1`.
- Backend/API/painel/live/smoke/compat passaram a consumir o provider operacional canônico.
- A trilha live ficou resiliente a reruns locais com containers Docker nomeados por execucao e limpeza por `label`.
- A Fase 41 ja foi propagada para o repo standalone canonico de CI com PR e GitHub Actions verde.

## O que a Fase 41 entregou
- Helper canônico do provider operacional em `scripts/observability-operational-provider.mjs`.
- Wrapper oficial da fase em `scripts/phase41-observability-operational-provider-contract.mjs`.
- Drill `materialize/replay/fail` em `scripts/phase41-observability-operational-provider-contract-drill.mjs`.
- Endpoint `GET /api/observability/connectors/backend/provider` em `apps/api/src/routes/observability.ts`.
- Painel backend-first refletindo metadata do provider em `scripts/assets/fullcycle-connectors-observability-ops-panel.js` e `scripts/phase31-observability-panel-backend-integration.mjs`.
- Trilha live/governanca/smoke exigindo `backend/provider` em `scripts/phase33-observability-live-runtime-validation.mjs`, `scripts/phase34-observability-live-governance.mjs`, `scripts/phase35-observability-legacy-convergence.mjs` e `scripts/ci-api-smoke.mjs`.

## Ultima entrega relevante
### Fase 41
- Evidencia oficial: `docs/analise-projeto/52-fase-41-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Dashboard executivo do provider: `docs/fullcycle-connectors-observability-operational-provider.md`
- Repo standalone canonico:
  - PR: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/8`
  - CI run: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22872998907`
  - Commit standalone: `55a92e8f772f4ff936f12983c1a6421c9f8eaafd`

## Arquivos alterados na fase concluida
- `scripts/observability-operational-provider.mjs`
- `scripts/phase41-observability-operational-provider-contract.mjs`
- `scripts/phase41-observability-operational-provider-contract-drill.mjs`
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
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`
- `docs/fullcycle-connectors-observability-live-governance.md`
- `docs/fullcycle-connectors-observability-compat.md`
- `docs/fullcycle-connectors-observability-operational-provider.md`
- `docs/analise-projeto/52-fase-41-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase37`: OK
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase33`: OK
- `npm run test:phase34`: OK (`status=pass`, `contracts=23/23`)
- `npm run build -w @supervisor/api`: OK
- `npm run monitor:fullcycle:observability:backend`: `warn` esperado no workspace real com `provider=materialized_contract`, `contract=ready`, `loadedSources=2`
- `npm run monitor:fullcycle:observability:live`: OK (`status=pass`, `contracts=23/23`)
- Repo standalone:
  - PR `#8` aberta com a entrega da Fase 41
  - GitHub Actions `22872998907`: OK (`success`)

## O que ainda nao foi fechado
- O provider operacional canônico ainda e materializado a partir de artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao de um coletor/servico dedicado.
- O fallback `legacy_files` ainda existe como caminho de compatibilidade controlado.
- `docs/fullcycle-connectors-observability-live-governance.md` e `docs/fullcycle-connectors-observability-compat.md` continuam sendo artefatos gerados; se outra rotina live/compat rodar depois, eles mudam novamente.

## Proximo passo exato
Iniciar a Fase 42 com este recorte:
1. conectar o provider operacional canônico a um produtor/coletor dedicado;
2. definir criterios objetivos para desativar o fallback `legacy_files`;
3. preservar os contratos de `backend/provider`, `backend/summary`, `backend/analytics`, painel, smoke e live durante a troca do produtor.

## Hipotese principal da proxima fase
- O maior gap estrutural restante nao e mais falta de contrato; e a origem dos dados do provider.
- Se o producer dedicado passar a alimentar o contrato canônico, o backend observability fica mais proximo do desenho produtivo final sem quebrar as validacoes ja fechadas.

## Como testar o estado atual
```bash
npm run test:phase37
npm run test:phase39
npm run test:phase40
npm run test:phase41
npm run build -w @supervisor/api
npm run test:phase33
npm run test:phase34
npm run monitor:fullcycle:observability:backend
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
6. `docs/analise-projeto/52-fase-41-validacao.md`
7. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 42, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
