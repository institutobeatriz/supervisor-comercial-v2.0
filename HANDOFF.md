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
6. `docs/analise-projeto/71-fase-60-validacao.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-13
- Ultima fase concluida: Fase 60
- Proxima fase liberada: Fase 61 (a definir — projeto em estado production_ready)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 60 concluidas e registradas na memoria oficial.
- Drill phase60: auditoria das exclusões intencionais do CI — 16 fases documentadas com razão técnica; validateCommands agora cobre 45 test:phase commands.
- Drill phase59: pipeline integrity — 44 test:phase commands validados; todos os drill .mjs existem; package.json coverage completa; phase58 evidence presente.
- Drill phase58: completeness readiness — validateCommands cobre 43 fases (42 phases esperados + phase58), 58 CONCLUIDA na memória, projeto formalizado como production_ready.
- Drill phase57: git root extraction decision formalizada — conclusão: não necessário.
- Drill phase56: test:phase37 (standalone sync) agora no validateCommands — último gap CI fechado.
- Drill phase55: test:phase14-30 (17 drills) adicionados ao validateCommands.
- Drill phase54: test:phase38-42 adicionados; regressão phase42 corrigida.
- Drill phase53: política minTeams formalizada.

## O que a Fase 60 entregou
- Novo: `scripts/phase60-ci-exclusions-audit-drill.mjs` — 4 drills de auditoria de exclusões do CI
- `test:phase60` adicionado ao `package.json`
- `test:phase60` adicionado ao `config/standalone-export.json` (validateCommands)
- validateCommands agora cobre 45 test:phase commands
- Decisão arquivada em `tmp/drill-reports/phase60-ci-exclusions-audit-decision.json`
- CI: aguardando run (standalone:publish pendente)

## Ultima entrega relevante
### Fase 60
- Evidencia oficial: `docs/analise-projeto/71-fase-60-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`

## Arquivos alterados na fase concluida
- `scripts/phase60-ci-exclusions-audit-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/71-fase-60-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase60`: OK (4 drills passando)
- `npm run test:phase59`: OK (4 drills)
- `npm run test:phase58`: OK (4 drills)
- `npm run test:phase57`: OK (4 drills)
- `npm run test:phase56`: OK (1 drill)
- `npm run test:phase55`: OK (17 drills)
- `npm run test:phase37`: OK

## O que ainda nao foi fechado
- Fase 61 a definir — projeto já em estado production_ready
- Padronizar documentos legados da raiz — prioridade baixa (fora do worktree git)
- Os PRs aguardam review/merge pelo mantenedor do repo canonical
- Testes phase3-5 (Docker) e phase10-13 (dados reais) não são candidatos ao validateCommands (documentado na Fase 60)

## Proximo passo exato
Avaliar Fase 61 conforme necessidade do projeto:
1. Verificar TODO_AI.md
2. Projeto está em estado production_ready — próximas ações são de manutenção ou evolução

## Como testar o estado atual
```bash
npm run test:phase60
npm run test:phase59
npm run test:phase58
npm run test:phase57
npm run test:phase56
npm run test:phase55
npm run test:phase37
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- `config/standalone-export.json` agora inclui 45 test:phase commands.
- Exclusões do CI: documentadas na Fase 60 — 16 fases ausentes por razão técnica.
- Decisão sobre git root: formalizada na Fase 57 — não necessário.
- Projeto production_ready: formalizado na Fase 58.
- Integridade do pipeline: validada na Fase 59.
- Exclusões intencionais: auditadas na Fase 60.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro: AGENTS.md, CLAUDE.md, PROJECT_RULES.md, HANDOFF.md, TODO_AI.md,
docs/analise-projeto/10-memoria-execucao-fases.md, docs/analise-projeto/71-fase-60-validacao.md

Objetivo: Continuar da Fase 61 sem refatoracao ampla desnecessaria.
