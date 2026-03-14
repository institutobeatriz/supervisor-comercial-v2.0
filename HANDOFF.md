# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases, CI remoto canônico e continuidade entre Codex/Claude.

## Leitura minima para continuar
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`
6. `docs/analise-projeto/53-fase-42-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 42
- Proxima fase liberada: Fase 43
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 42 concluidas e registradas na memoria oficial.
- A ingestao operacional agora tem uma fronteira canonica versionada e producer-backed: `fullcycle.observability.operational-provider.v1`.
- Backend/API/painel/live/smoke/compat passaram a refletir metadata do produtor dedicado e a exigir `backend/producer`.
- O caminho oficial do backend observability agora desabilita `legacy_files` e consome o contrato materializado sem rematerializacao no consumer.
- A Fase 42 ja foi propagada para o repo standalone canonico de CI com PR e GitHub Actions verde.

## O que a Fase 42 entregou
- Wrapper producer-backed oficial em `scripts/phase42-observability-operational-provider-producer.mjs`.
- Drill `materialize/replay/fail` do producer em `scripts/phase42-observability-operational-provider-producer-drill.mjs`.
- Endpoint `GET /api/observability/connectors/backend/producer` em `apps/api/src/routes/observability.ts`.
- Contract helper enriquecido com `producerMode`, `producerReady`, `legacyFallbackState` e `deprecationTarget` em `scripts/observability-operational-provider.mjs`.
- Painel backend-first refletindo o produtor em `scripts/assets/fullcycle-connectors-observability-ops-panel.js`.
- Trilha live/governanca/smoke exigindo `backend/producer` em `scripts/phase33-observability-live-runtime-validation.mjs`, `scripts/phase34-observability-live-governance.mjs` e `scripts/ci-api-smoke.mjs`.

## Ultima entrega relevante
### Fase 42
- Evidencia oficial: `docs/analise-projeto/53-fase-42-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Dashboard executivo do producer: `docs/fullcycle-connectors-observability-operational-producer.md`
- Dashboard executivo do provider: `docs/fullcycle-connectors-observability-operational-provider.md`
- Repo standalone canonico:
  - PR: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/9`
  - CI run: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22874254804`
  - Commit standalone: `e65e0ff910ef21b54c4fdc187c15b3cf9c9c5ea2`

## Arquivos alterados na fase concluida
- `scripts/observability-operational-provider.mjs`
- `scripts/phase42-observability-operational-provider-producer.mjs`
- `scripts/phase42-observability-operational-provider-producer-drill.mjs`
- `scripts/phase39-observability-backend-operational-oncall.mjs`
- `scripts/phase40-observability-operational-source-health.mjs`
- `scripts/phase41-observability-operational-provider-contract.mjs`
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
- `docs/fullcycle-connectors-observability-operational-producer.md`
- `docs/fullcycle-connectors-observability-operational-provider.md`
- `docs/analise-projeto/53-fase-42-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase42`: OK
- `npm run test:phase37`: OK
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase33`: OK (`status=pass`, `smokeOk=34`, `producerStatus=200`)
- `npm run test:phase34`: OK (`status=pass`, `contracts=24/24`)
- `npm run build -w @supervisor/api`: OK
- `npm run monitor:fullcycle:observability:backend`: `pass` com `producer=dedicated_script`, `contract=ready`, `legacy=disabled` e backend consumer `warn` esperado no workspace real
- `npm run monitor:fullcycle:observability:live`: OK (`status=pass`, `contracts=24/24`, `smokeOk=34`)
- Repo standalone:
  - PR `#9` aberta com a entrega da Fase 42
  - GitHub Actions `22874254804`: OK (`success`)

## O que ainda nao foi fechado
- O producer dedicado ainda e alimentado por artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao por um coletor/servico dedicado.
- O fallback `legacy_files` ainda existe no codigo-base como compatibilidade, embora esteja desabilitado no caminho oficial da Fase 42.
- `docs/fullcycle-connectors-observability-live-governance.md` e `docs/fullcycle-connectors-observability-compat.md` continuam sendo artefatos gerados; se outra rotina live/compat rodar depois, eles mudam novamente.

## Proximo passo exato
Iniciar a Fase 43 com este recorte:
1. transformar `phase43-disable-legacy-fallback` em enforcement real em todos os caminhos observability;
2. impedir reintroducao de `legacy_files` em smoke/live/compat/API;
3. definir a interface do coletor/servico dedicado que substituirá a alimentacao file-based do producer.

## Hipotese principal da proxima fase
- O maior gap estrutural restante nao e mais o produtor; e a dependencia residual do caminho `legacy_files` no codigo-base e da alimentacao file-based do producer.
- Se a Fase 43 endurecer o enforcement sem quebrar CI/live/compat, o caminho para um coletor/servico operacional dedicado fica claro e com rollout controlado.

## Como testar o estado atual
```bash
npm run test:phase37
npm run test:phase42
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
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. `docs/analise-projeto/53-fase-42-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 43, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
