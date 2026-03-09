# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/48-fase-37-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 37
- Proxima fase liberada: Fase 38
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 37 concluidas e registradas na memoria oficial.
- A trilha live/backend-first esta validada em runner GitHub real.
- A sincronizacao entre este workspace e `.export-repo` deixou de ser manual.
- O fluxo canonico `sync -> branch -> push -> PR -> GitHub Actions` foi provado no repo standalone publicado.

## O que a Fase 37 entregou
- Config declarativa do export standalone em `config/standalone-export.json`.
- Sync idempotente workspace -> `.export-repo` em `scripts/phase37-standalone-sync.mjs`.
- Publish automatizado com branch `codex/`, push e PR em `scripts/phase37-standalone-publish.mjs`.
- Drill local do sync em `scripts/phase37-standalone-sync-drill.mjs`.
- Fluxo operacional documentado em `docs/standalone-repo-flow.md`.
- PR canonica aberta no repo standalone: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/1`.
- GitHub Actions verde no run final `22864219627` com head `6588f0c2d2bc3615b3bd02b49ab48817c7dcbbab`.

## Ultima entrega relevante
### Fase 37
- Config: `config/standalone-export.json`
- Sync: `scripts/phase37-standalone-sync.mjs`
- Publish: `scripts/phase37-standalone-publish.mjs`
- Drill: `scripts/phase37-standalone-sync-drill.mjs`
- Guia operacional: `docs/standalone-repo-flow.md`
- Evidencia oficial: `docs/analise-projeto/48-fase-37-validacao.md`

## Arquivos alterados na fase concluida
- `config/standalone-export.json`
- `scripts/phase37-standalone-sync.mjs`
- `scripts/phase37-standalone-publish.mjs`
- `scripts/phase37-standalone-sync-drill.mjs`
- `package.json`
- `README.md`
- `PROJECT_RULES.md`
- `docs/runbook-operacional.md`
- `docs/standalone-repo-flow.md`
- `docs/analise-projeto/48-fase-37-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase37`: OK
- `npm run standalone:sync`: OK
- `npm run standalone:sync:check`: OK (`copy=0`, `delete=0`, `unchanged=397`)
- `npm run lint`: OK
- `npm run build`: OK
- PR aberta no repo standalone: `#1`
- GitHub Actions final: `22864219627` => `success`
- Repo standalone local alinhado com drift zero apos o sync final

## O que ainda nao foi fechado
- Os dashboards HTML internos continuam com assets inline.
- As rotas HTML de observabilidade ainda dependem de CSP route-scoped permissivo.
- A integracao de on-call continua file-based (`rotation/calendar`) sem provedor externo real.
- O workspace principal ainda vive dentro do repo guarda-chuva; o repo standalone segue sendo o canonico de CI remoto por decisao operacional, nao por extracao estrutural definitiva.

## Proximo passo exato
Iniciar a Fase 38 com este recorte:
1. externalizar assets inline dos dashboards HTML internos;
2. endurecer CSP das rotas HTML de observabilidade;
3. validar que o painel/live continuam verdes apos a remocao das excecoes atuais.

## Hipotese principal da proxima fase
- O maior risco tecnico restante na camada de observabilidade HTML nao e mais drift de entrega, e sim a superficie de excecao mantida por assets inline.
- Se externalizarmos scripts/styles e reduzirmos a CSP permissiva por rota, melhoramos seguranca e reduzimos comportamento especial dificil de manter.

## Como testar o estado atual
```bash
npm run test:phase37
npm run standalone:sync
npm run standalone:sync:check
npm run lint
npm run build
npm run standalone:publish

gh pr view 1 --repo institutobeatriz/supervisor-comercial-v2.0
gh run view 22864219627 --repo institutobeatriz/supervisor-comercial-v2.0
```

## Observacoes importantes
- Este diretorio continua dentro de um repo Git maior; nao confundir o Git do workspace com o repo standalone publicado.
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- `HANDOFF.md` resume apenas o estado atual.
- O repo standalone publicado e o repositorio canonico de CI remoto ate nova decisao estrutural.
- Ao terminar cada fase, atualizar este arquivo, `TODO_AI.md`, memoria oficial e criar commit WIP focado na fase.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `HANDOFF.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`
6. `docs/analise-projeto/48-fase-37-validacao.md`
7. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 38, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
