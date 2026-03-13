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
6. `docs/analise-projeto/68-fase-57-validacao.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-13
- Ultima fase concluida: Fase 57
- Proxima fase liberada: Fase 58 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 57 concluidas e registradas na memoria oficial.
- Drill phase57: git root extraction decision formalizada — conclusão: não necessário.
- Drill phase56: test:phase37 (standalone sync) agora no validateCommands — último gap CI fechado.
- Drill phase55: test:phase14-30 (17 drills) adicionados ao validateCommands.
- Drill phase54: test:phase38-42 adicionados; regressão phase42 corrigida.
- Drill phase53: política minTeams formalizada.
- PR #17 em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 57 entregou
- Novo: `scripts/phase57-git-root-decision-drill.mjs` — 4 drills de decisão
- `test:phase57` adicionado ao `package.json`
- `test:phase57` adicionado ao `config/standalone-export.json` (validateCommands)
- Decisão arquivada: git root separado não é necessário neste estágio
- validateCommands agora cobre 42 fases de teste (total: 46 comandos)

## Ultima entrega relevante
### Fase 57
- Evidencia oficial: `docs/analise-projeto/68-fase-57-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23067680055

## Arquivos alterados na fase concluida
- `scripts/phase57-git-root-decision-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/68-fase-57-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase57`: OK (4 drills passando)
- `npm run test:phase56`: OK (1 drill)
- `npm run test:phase55`: OK (17 drills)
- `npm run test:phase37`: OK

## O que ainda nao foi fechado
- Fase 58 a definir conforme necessidade do projeto
- Padronizar documentos legados da raiz — prioridade baixa
- Os PRs aguardam review/merge pelo mantenedor do repo canonical
- Testes phase3-5 (Docker) e phase10-13 (dados reais) não são candidatos ao validateCommands

## Proximo passo exato
Avaliar Fase 58 conforme necessidade do projeto:
1. Verificar TODO_AI.md
2. Possível direção: padronizar documentos legados da raiz (ROADMAP.md, STATUS-v2.md, IMPLEMENTATION_PLAN.md)

## Como testar o estado atual
```bash
npm run test:phase57
npm run test:phase56
npm run test:phase55
npm run test:phase37
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- `config/standalone-export.json` agora inclui test:phase14-30, test:phase37-42, test:phase54-57.
- Testes phase3-5 (Docker) e phase10-13 (dados reais) não são candidatos ao CI standalone.
- Decisão sobre git root: formalizada na Fase 57 — não necessário, condições de revisita documentadas.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro: AGENTS.md, CLAUDE.md, PROJECT_RULES.md, HANDOFF.md, TODO_AI.md,
docs/analise-projeto/10-memoria-execucao-fases.md, docs/analise-projeto/68-fase-57-validacao.md

Objetivo: Continuar da Fase 58 sem refatoracao ampla desnecessaria.
