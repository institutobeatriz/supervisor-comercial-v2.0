# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/49-fase-38-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 39
- Proxima fase liberada: Fase 40
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 39 concluidas e registradas na memoria oficial.
- A trilha live/backend-first continua validada localmente apos remocao de assets inline.
- O painel realtime e o dashboard executivo interno passaram a operar com assets externos e CSP endurecida.
- A Fase 38 ja foi propagada para o repo canonico de CI com PR e GitHub Actions verde.
- A Fase 39 migrou o backend observability oficial para ownership operacional-first (`incident automation` + `snapshot` + `fullcycle`) e manteve compat/live/painel consistentes.

## O que a Fase 39 entregou
- Backend oficial operacional-first em `scripts/phase39-observability-backend-operational-oncall.mjs`.
- Drill pass/fail da fase em `scripts/phase39-observability-backend-operational-oncall-drill.mjs`.
- Trilha live alinhada ao ownership operacional em `scripts/phase33-observability-live-runtime-validation.mjs`.
- Compat legada atualizada para bootstrappingar a Fase 39 em `scripts/phase35-observability-legacy-convergence.mjs`.
- Workflow/ambiente/documentacao atualizados em `package.json`, `.github/workflows/ci.yml`, `.env.example`, `README.md`, `docs/runbook-operacional.md` e `docs/monitoramento-externo.md`.

## Ultima entrega relevante
### Fase 39
- Evidencia oficial: `docs/analise-projeto/50-fase-39-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Novo backend oficial: `scripts/phase39-observability-backend-operational-oncall.mjs`
- Novo drill: `scripts/phase39-observability-backend-operational-oncall-drill.mjs`
- Repo standalone canonico:
  - PR: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/6`
  - CI run: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22870167052`
  - Commit standalone: `5e89ac71aee0c85e7a7a55044b7fed238bd6ef8a`

## Arquivos alterados na fase concluida
- `scripts/phase39-observability-backend-operational-oncall.mjs`
- `scripts/phase39-observability-backend-operational-oncall-drill.mjs`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`
- `README.md`
- `docs/monitoramento-externo.md`
- `docs/runbook-operacional.md`
- `docs/analise-projeto/50-fase-39-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase31`: OK
- `npm run test:phase32`: OK
- `npm run test:phase35`: OK
- `npm run test:phase39`: OK
- `npm run build -w @supervisor/api`: OK
- `npm run test:phase33`: OK
- `npm run test:phase34`: OK (`status=pass`, `contracts=21/21`)
- `npm run monitor:fullcycle:observability:live`: OK (`status=pass`, `contracts=21/21`)
- `npm run monitor:fullcycle:observability:backend`: `warn` local com `active=0`, `coverage=100%` e sem workload operacional ativo
- Repo standalone:
  - PR `#6` aberta com a correcao de CI da Fase 39
  - GitHub Actions `22870167052`: OK (`success`)

## O que ainda nao foi fechado
- A origem operacional oficial ainda depende de artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`), nao de um provider/servico dedicado.
- `docs/fullcycle-connectors-observability-live-governance.md` e `docs/fullcycle-connectors-observability-compat.md` continuam sendo artefatos gerados; se outra rotina live/compat rodar depois, eles mudam novamente.

## Proximo passo exato
Iniciar a Fase 40 com este recorte:
1. medir frescor/saude da fonte operacional (`incident automation`, `snapshot`, `fullcycle`);
2. expor esse estado no backend/api/painel para distinguir `sem workload ativo` de `fonte operacional indisponivel`;
3. decidir se a proxima etapa deve ler um provider externo diretamente ou continuar com materializacao local controlada.

## Hipotese principal da proxima fase
- O maior gap estrutural restante nao e mais ownership file-based, e sim a observabilidade da propria fonte operacional.
- Se distinguirmos claramente `no active workload` de `operational source stale/missing`, o backend/painel deixam de depender de inferencia manual em cenarios vazios.

## Como testar o estado atual
```bash
npm run test:phase24
npm run test:phase31
npm run test:phase35
npm run test:phase38
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
6. `docs/analise-projeto/50-fase-39-validacao.md`
7. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 40, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
