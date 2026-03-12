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
6. `docs/analise-projeto/57-fase-46-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-11
- Ultima fase concluida: Fase 46
- Proxima fase liberada: Fase 47
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 46 concluidas e registradas na memoria oficial.
- O módulo coletor dedicado (`phase44-operational-collector.mjs`) existe com modos `file` e `synthetic`.
- O producer usa o coletor por default (`USE_COLLECTOR=true`); bypass disponível via `USE_COLLECTOR=false`.
- Os contratos das Fases 41/42/43/44 continuam válidos.
- PR #10 aberto em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 46 entregou
- `USE_COLLECTOR` default alterado de `false` para `true` no producer (phase42)
- Novos campos `collectorEnabled` e `collectorMode` adicionados ao `summary` do producer
- Enforcement smoke phase46: `summary.collectorEnabled` deve ser `true` e `summary.collectorMode` não-vazio
- Drill novo: `scripts/phase46-collector-default-drill.mjs` (drills: default/bypass/contract)
- `test:phase46` adicionado ao `package.json` e `config/standalone-export.json`
- CI run verde: `22969908488` (conclusion: success)

## Ultima entrega relevante
### Fase 46
- Evidencia oficial: `docs/analise-projeto/57-fase-46-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`

## Arquivos alterados na fase concluida
- `scripts/phase42-observability-operational-provider-producer.mjs`
- `scripts/phase46-collector-default-drill.mjs` (novo)
- `scripts/ci-api-smoke.mjs`
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/57-fase-46-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase46`: OK (default/bypass/contract)
- `npm run test:phase44`: OK
- `npm run test:phase43`: OK
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase42`: OK
- CI remoto verde: PR #10, run 22969908488

## O que ainda nao foi fechado
- O coletor é um stub: integração com serviço externo real fica para iteração futura.
- O producer usa o coletor por default agora, mas o stub lê arquivos locais (mode=file) — sem dados reais em CI.
- O chain completo (phase30+) só é validado no workspace principal; o worktree esparso executa os drills sem o chain.
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical.

## Proximo passo exato
Iniciar a Fase 47 (a definir conforme necessidade do projeto):
1. Avaliar se há mais fases urgentes no plano de conclusao.
2. Próxima evolução natural: integração do coletor com serviço externo real (substituição do stub).

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
7. `docs/analise-projeto/57-fase-46-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 47, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
