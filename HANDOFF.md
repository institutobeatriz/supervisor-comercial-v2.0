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
6. `docs/analise-projeto/66-fase-55-validacao.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-13
- Ultima fase concluida: Fase 55
- Proxima fase liberada: Fase 56 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 55 concluidas e registradas na memoria oficial.
- Drill phase55 fecha o gap CI: test:phase14-30 agora no validateCommands (17 drills).
- Drill phase54 fecha o gap CI: test:phase38-42 adicionados.
- Drill phase53 formaliza política minTeams.
- Drill phase52 valida remoção de dead config cfg.providerMode.
- Drill phase51 formaliza backend/producer obrigatório sem fallback.
- Card "Cobertura Operacional" em Executivo.tsx.
- PR #15 em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 55 entregou
- Novo: `scripts/phase55-ci-gap-early-phases-drill.mjs` — 17 drills meta-validando phase14-30
- `test:phase14-30` e `test:phase55` adicionados ao `config/standalone-export.json`
- `test:phase55` adicionado ao `package.json`
- Build TypeScript limpo
- Regressão: test:phase54, test:phase53 passando

## Ultima entrega relevante
### Fase 55
- Evidencia oficial: `docs/analise-projeto/66-fase-55-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23055336215

## Arquivos alterados na fase concluida
- `scripts/phase55-ci-gap-early-phases-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/66-fase-55-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase55`: OK (17 drills passando)
- `npm run test:phase54`: OK
- `npm run test:phase53`: OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)

## O que ainda nao foi fechado
- Fase 56 a definir conforme necessidade do projeto
- Testes phase3, phase4, phase5 requerem Docker/runtime real — não candidatos ao validateCommands
- Testes phase10-13 falham sem dados reais — não candidatos ao validateCommands
- Os PRs aguardam review/merge pelo mantenedor do repo canonical
- Padronizar documentos legados da raiz — prioridade baixa
- Avaliar extração futura para git root próprio — prioridade média

## Proximo passo exato
Avaliar Fase 56 conforme necessidade do projeto:
1. Verificar TODO_AI.md
2. Possíveis direções: padronizar documentos legados, avaliar extração git root, ou outras necessidades

## Como testar o estado atual
```bash
npm run test:phase55
npm run test:phase54
npm run test:phase53
npm run build -w @supervisor/dashboard
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- O repo standalone publicado segue sendo o repositorio canonico de CI remoto.
- `config/standalone-export.json` agora inclui test:phase14-30, test:phase38-42 e test:phase54-55.
- Testes phase3-5 (Docker) e phase10-13 (dados reais) não são candidatos ao CI standalone.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. `docs/analise-projeto/66-fase-55-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 56 (ou próxima fase definida), sem refatoracao ampla desnecessaria.
