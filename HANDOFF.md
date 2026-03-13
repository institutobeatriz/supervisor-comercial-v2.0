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
6. `docs/analise-projeto/64-fase-53-validacao.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-13
- Ultima fase concluida: Fase 53
- Proxima fase liberada: Fase 54 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 53 concluidas e registradas na memoria oficial.
- Drill `phase53-minteams-policy-drill.mjs` formaliza política: MIN_TEAMS=0 permissivo, MIN_TEAMS>=1 exige times configurados.
- `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS` default=1 conservador; ambientes CI sem times reais devem usar =0.
- Drill `phase52-providermode-cleanup-drill.mjs` valida remoção de dead config `cfg.providerMode`.
- Drill `phase51-producer-mandatory-drill.mjs` formaliza a decisão: `backend/producer` é obrigatório sem fallback.
- Card "Cobertura Operacional" adicionado ao `Executivo.tsx` consumindo `/api/observability/connectors/backend/analytics`.
- PR #13 em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 53 entregou
- Drill `phase53-minteams-policy-drill.mjs` — 4 drills de política e regressão
- `test:phase53` no `package.json` e `config/standalone-export.json`
- Decisão documentada sobre `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS`
- Build TypeScript limpo: `npm run build -w @supervisor/dashboard` OK
- Regressão: test:phase52, test:phase51 passando

## Ultima entrega relevante
### Fase 53
- Evidencia oficial: `docs/analise-projeto/64-fase-53-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23051052903

## Arquivos alterados na fase concluida
- `scripts/phase53-minteams-policy-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/64-fase-53-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase53`: OK (4 drills passando)
- `npm run test:phase52`: OK
- `npm run test:phase51`: OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)

## O que ainda nao foi fechado
- Fase 54 a definir conforme necessidade do projeto
- O chain completo (phase30+) só é validado no workspace principal
- O PR #13 aguarda review/merge pelo mantenedor do repo canonical
- Padronizar documentos legados da raiz — prioridade baixa
- Avaliar extração futura para git root próprio — prioridade média

## Proximo passo exato
Avaliar Fase 54 conforme necessidade do projeto:
1. Verificar TODO_AI.md
2. Possíveis direções: padronizar documentos legados da raiz, avaliar extração git root, ou outras necessidades identificadas

## Como testar o estado atual
```bash
npm run test:phase53
npm run test:phase52
npm run test:phase51
npm run build -w @supervisor/dashboard
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- O repo standalone publicado segue sendo o repositorio canonico de CI remoto.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. `docs/analise-projeto/64-fase-53-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 54 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
