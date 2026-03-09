# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/47-fase-36-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 36
- Proxima fase liberada: Fase 37
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 36 concluidas e registradas na memoria oficial.
- A trilha live/backend-first esta validada em runner GitHub real, com GitHub Actions verde no repositorio standalone `institutobeatriz/supervisor-comercial-v2.0`.
- A Fase 35 convergiu a trilha legada de observability para backend-first por materializacao automatica de payload.
- A Fase 36 fechou o gap entre validacao local e CI real, eliminando os bloqueios de bootstrap do runner GitHub.

## O que a Fase 36 entregou
- Copia standalone publicavel do projeto em `C:/Users/user/.openclaw/workspace/supervisor-comercial/.export-repo`.
- Publicacao real no GitHub: `https://github.com/institutobeatriz/supervisor-comercial-v2.0`.
- Workflow CI verde no run `22862899577`.
- Correcao de install em CI sob `NODE_ENV=production` com `npm ci --include=dev`.
- Fallback de `WebSocket` no `phase33` via dependencia `ws`, eliminando a falha `WebSocket is not defined` no runner Linux.
- Relaxamento controlado de bootstrap para a gate backend da Fase 32 em runner limpo.
- Politica de painel ajustavel para `minTeams=0` quando explicitamente configurado, usada apenas na gate final do CI.
- Evidencia formal consolidada em `docs/analise-projeto/47-fase-36-validacao.md`.

## Ultima entrega relevante
### Fase 36
- Workflow CI: `.github/workflows/ci.yml`
- Runtime live: `scripts/phase33-observability-live-runtime-validation.mjs`
- Painel backend-first: `scripts/phase31-observability-panel-backend-integration.mjs`
- Preflight/registro GitHub: `docs/fullcycle-connectors-observability-github-preflight.md`
- Evidencia oficial: `docs/analise-projeto/47-fase-36-validacao.md`

## Arquivos alterados na fase concluida
- `.github/workflows/ci.yml`
- `scripts/phase31-observability-panel-backend-integration.mjs`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `package.json`
- `package-lock.json`
- `docs/fullcycle-connectors-observability-github-preflight.md`
- `docs/analise-projeto/47-fase-36-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase31`: OK
- `npm run test:phase32`: OK
- `npm run test:phase33`: OK
- `npm run test:phase34`: OK
- `npm run test:phase35`: OK
- `npm run monitor:fullcycle:observability:live`: OK
- GitHub Actions real: run `22862899577` => `pass`
- Live governance em CI real:
  - `phase33Status=pass`
  - `smokeOk=28`
  - `smokeFail=0`
  - `contractValidated=20`
  - `contractFail=0`
  - `requiredChecks=18/18`
  - `browserPanelConnection=connected`
  - `analyticsStatus=200`
  - `browserBootstrapAuthNoise=0`
- Backend gate CI:
  - `status=pass`
  - `ownerCoveragePct=100`
  - `requireIncidents=false`
  - `requireAlertReport=false`
  - `requireApiSlaHistory=false`
- Panel gate CI:
  - `status=pass`
  - `minTeams=0`
  - `slaPoints=1`

## O que ainda nao foi fechado
- A sincronizacao entre o workspace local e `.export-repo` ainda e manual.
- Os dashboards HTML internos continuam com assets inline.
- A integracao de on-call continua file-based (`rotation/calendar`) sem provedor externo real.
- O repo operacional de CI hoje e o standalone publicado; este diretorio local ainda vive dentro do repo guarda-chuva do workspace.

## Proximo passo exato
Iniciar a Fase 37 com este recorte:
1. automatizar a sincronizacao/publicacao entre este projeto e `.export-repo`, eliminando drift manual;
2. definir se `institutobeatriz/supervisor-comercial-v2.0` vira o repositorio canonico do projeto ou se este projeto sera extraido para um git root proprio;
3. depois da automacao, validar o fluxo em branch/PR alem de `push` direto em `master`.

## Hipotese principal da proxima fase
- O maior risco restante agora nao esta mais na observabilidade em si, e sim no processo operacional de publicacao.
- Se a exportacao para `.export-repo` continuar manual, o CI verde pode divergir do estado real do workspace.
- Fechar esse gap aumenta a confiabilidade da troca entre Codex, Claude Code e GitHub Actions.

## Como testar o estado atual
```bash
npm run test:phase31
npm run test:phase32
npm run test:phase33
npm run test:phase34
npm run test:phase35
npm run monitor:fullcycle:observability:live

cd .export-repo
git --git-dir=.git --work-tree=. log --oneline -5
gh run list --repo institutobeatriz/supervisor-comercial-v2.0 --limit 5
gh run view 22862899577 --repo institutobeatriz/supervisor-comercial-v2.0
```

## Observacoes importantes
- Este diretorio continua dentro de um repo Git maior; nao confundir o Git do workspace com o repo standalone publicado.
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- `HANDOFF.md` resume apenas o estado atual.
- A Fase 34 continua como wrapper oficial do gate live.
- A Fase 35 continua garantindo a camada legada por materializacao backend-first.
- A Fase 36 validou o caminho real de GitHub Actions e documentou a diferenca entre runner limpo e ambiente local.
- Ao terminar cada fase, atualizar este arquivo, `TODO_AI.md`, memoria oficial e criar commit WIP focado na fase.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `HANDOFF.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`
6. `docs/analise-projeto/47-fase-36-validacao.md`

Objetivo:
Continuar exatamente da Fase 37, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
