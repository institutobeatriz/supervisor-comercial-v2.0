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
6. `docs/analise-projeto/65-fase-54-validacao.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-13
- Ultima fase concluida: Fase 54
- Proxima fase liberada: Fase 55 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 54 concluidas e registradas na memoria oficial.
- Drill phase54 fecha o gap de CI: test:phase38-42 agora fazem parte do validateCommands.
- Regressão do phase42 drill corrigida: USE_COLLECTOR=false no commonEnv restaura comportamento original.
- Drill phase53 formaliza política minTeams.
- Drill phase52 valida remoção de dead config cfg.providerMode.
- Drill phase51 formaliza backend/producer obrigatório sem fallback.
- Card "Cobertura Operacional" em Executivo.tsx.
- PR #14 em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 54 entregou
- Fix: phase42 drill restaurado (USE_COLLECTOR=false)
- Novo: `scripts/phase54-ci-gap-closure-drill.mjs` — 5 drills meta-validando phase38-42
- `test:phase38-42` e `test:phase54` adicionados ao `config/standalone-export.json`
- `test:phase54` adicionado ao `package.json`
- Build TypeScript limpo
- Regressão: test:phase53, test:phase52 passando

## Ultima entrega relevante
### Fase 54
- Evidencia oficial: `docs/analise-projeto/65-fase-54-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23053638655

## Arquivos alterados na fase concluida
- `scripts/phase42-observability-operational-provider-producer-drill.mjs` (1 linha adicionada)
- `scripts/phase54-ci-gap-closure-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/65-fase-54-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase54`: OK (5 drills passando)
- `npm run test:phase42`: OK (fix aplicado)
- `npm run test:phase53`: OK
- `npm run test:phase52`: OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)

## O que ainda nao foi fechado
- Fase 55 a definir conforme necessidade do projeto
- O chain completo (phase30+) só é validado no workspace principal
- Os PRs aguardam review/merge pelo mantenedor do repo canonical
- Padronizar documentos legados da raiz — prioridade baixa
- Avaliar extração futura para git root próprio — prioridade média

## Proximo passo exato
Avaliar Fase 55 conforme necessidade do projeto:
1. Verificar TODO_AI.md e plano de conclusao
2. Possíveis direções: padronizar documentos legados da raiz, avaliar extração git root, ou outras necessidades identificadas

## Como testar o estado atual
```bash
npm run test:phase54
npm run test:phase53
npm run test:phase52
npm run build -w @supervisor/dashboard
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- O repo standalone publicado segue sendo o repositorio canonico de CI remoto.
- `config/standalone-export.json` agora inclui test:phase38-42 e test:phase54.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. `docs/analise-projeto/65-fase-54-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 55 (ou próxima fase definida), sem refatoracao ampla desnecessaria.
