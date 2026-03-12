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
6. `docs/analise-projeto/62-fase-51-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 51
- Proxima fase liberada: Fase 52 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 51 concluidas e registradas na memoria oficial.
- Drill `phase51-producer-mandatory-drill.mjs` formaliza a decisão: `backend/producer` é obrigatório sem fallback em todos os ambientes.
- Campos `legacyFallbackAllowed: false`, `legacyFallbackState: 'disabled'`, `requireProvider: true`, `requireProducer: true` validados via drill.
- Card "Cobertura Operacional" adicionado ao `Executivo.tsx` consumindo `/api/observability/connectors/backend/analytics`.
- Degradação graciosa: card oculto em 503/erro/null sem afetar restante do painel.
- O coletor operacional tem todos os modos: `file`, `api`, `service`.
- Dead branches do legacy_files removidos do provider e producer.
- PR #10 em institutobeatriz/supervisor-comercial-v2.0 com CI verde (run 23017071993).

## O que a Fase 51 entregou
- Drill `phase51-producer-mandatory-drill.mjs` — 4 drills de contrato de enforcement
- Decisão formal documentada: `backend/producer` obrigatório sem fallback desde Fase 51
- `test:phase51` no `package.json` e `config/standalone-export.json`
- Build TypeScript limpo: `npm run build -w @supervisor/dashboard` OK
- Regressão: test:phase50, test:phase49 passando

## Ultima entrega relevante
### Fase 51
- Evidencia oficial: `docs/analise-projeto/62-fase-51-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: (aguardando push Task 4)

## Arquivos alterados na fase concluida
- `scripts/phase51-producer-mandatory-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/62-fase-51-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase51`: OK (4 drills passando)
- `npm run test:phase50`: OK
- `npm run test:phase49`: OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)
- CI remoto verde: PR #10, run 23017071993

## O que ainda nao foi fechado
- Fase 52 a definir conforme plano de conclusao
- O chain completo (phase30+) só é validado no workspace principal
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical
- `cfg.providerMode` ainda presente em `loadOperationalProvider()` — dead config menor sem impacto

## Proximo passo exato
Avaliar Fase 52 conforme necessidade do projeto:
1. Verificar plano de conclusao (`09-plano-conclusao-dashboard-comercial.md`)
2. Possíveis direções: limpeza técnica residual, melhorias do painel, ou outras necessidades do projeto

## Como testar o estado atual
```bash
npm run test:phase51
npm run test:phase50
npm run test:phase49
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
7. `docs/analise-projeto/62-fase-51-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 52 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
