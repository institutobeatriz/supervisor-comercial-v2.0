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
6. `docs/analise-projeto/56-fase-45-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-11
- Ultima fase concluida: Fase 45
- Proxima fase liberada: Fase 46
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 45 concluidas e registradas na memoria oficial.
- O módulo coletor dedicado (`phase44-operational-collector.mjs`) existe com modos `file` e `synthetic`.
- O provider aceita `collectorSources` para bypass do file-reading quando o coletor já normalizou as fontes.
- O producer dedicado (`phase42`) integra o coletor opcionalmente via `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR=true`.
- Os contratos das Fases 41/42/43/44 continuam válidos.
- PR #10 aberto em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 45 entregou
- Propagacao das Fases 43+44 para o repo standalone canonico de CI remoto
- Branch: `codex/phase44-operational-collector`
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/10
- CI run verde: `22969299196` (quality-and-smoke: 1m52s, todos drills passando incluindo phase34 live governance gate)
- Fixes aplicados no export-repo (commits 11e8532..10f6a89):
  - Restaurados package.json e tsconfig.json de todos os apps/packages (untracked no git principal)
  - Restaurados todos os arquivos de rotas e source untracked
  - Aplicadas modificacoes do workspace principal (FastifyError, resolveAuditLogDir)
  - Restaurados index.html e index.css do dashboard (untracked)
  - Restaurados 75 scripts/configs deletados durante sync (via git restore do branch phase37)
  - Restauradas 9 migrations ausentes: 001-004, 008, 016-019 (sem elas: "relation messages does not exist")

## Ultima entrega relevante
### Fase 45
- Evidencia oficial: `docs/analise-projeto/56-fase-45-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`

## Arquivos alterados na fase concluida
- `docs/analise-projeto/56-fase-45-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`
- `.export-repo/infra/migrations/001-004, 008, 016-019` (adicionados)

## O que esta funcionando
- `npm run test:phase44`: OK (worktree)
- `npm run test:phase43`: OK (worktree)
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase42`: OK
- `npm run build -w @supervisor/api`: OK
- CI remoto verde: PR #10, run 22969299196

## O que ainda nao foi fechado
- O coletor é um stub: integração com serviço externo real fica para iteração futura.
- O producer usa o coletor apenas quando `USE_COLLECTOR=true`: migração default fica para iteração futura.
- O chain completo (phase30+) só é validado no workspace principal; o worktree esparso executa os drills sem o chain.
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical.

## Proximo passo exato
Iniciar a Fase 46 (a definir conforme plano de conclusao):
1. Decidir quando `USE_COLLECTOR=true` deve virar o default no producer.
2. Avaliar proxima iteracao do coletor (integracao com servico externo real vs stub).
3. Verificar se ha mais fases pendentes no `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`.

## Como testar o estado atual
```bash
npm run test:phase44
npm run test:phase43
npm run test:phase42
npm run test:phase39
npm run test:phase40
npm run test:phase41
npm run build -w @supervisor/api
npm run monitor:fullcycle:observability:backend
npm run monitor:fullcycle:observability:enforcement
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
7. `docs/analise-projeto/56-fase-45-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 46, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
