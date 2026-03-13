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
6. `docs/analise-projeto/63-fase-52-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 52
- Proxima fase liberada: Fase 53 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 52 concluidas e registradas na memoria oficial.
- Drill `phase52-providermode-cleanup-drill.mjs` valida remoção de dead config `cfg.providerMode`.
- `loadOperationalProvider()` não lê mais `options.providerMode` nem env `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE`.
- `contract.providerMode` continua presente e hardcoded como `'materialized_contract'` em `buildMaterializedContract()`.
- Drill `phase51-producer-mandatory-drill.mjs` formaliza a decisão: `backend/producer` é obrigatório sem fallback em todos os ambientes.
- Card "Cobertura Operacional" adicionado ao `Executivo.tsx` consumindo `/api/observability/connectors/backend/analytics`.
- O coletor operacional tem todos os modos: `file`, `api`, `service`.
- Dead branches do legacy_files removidos do provider e producer.
- PR #11 em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 52 entregou
- Removida linha `cfg.providerMode` de `loadOperationalProvider()` — dead config desde Fase 49
- Drill `phase52-providermode-cleanup-drill.mjs` — 4 drills de contrato e regressão
- `test:phase52` no `package.json` e `config/standalone-export.json`
- Build TypeScript limpo: `npm run build -w @supervisor/dashboard` OK
- Regressão: test:phase51, test:phase49 passando

## Ultima entrega relevante
### Fase 52
- Evidencia oficial: `docs/analise-projeto/63-fase-52-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23032233549

## Arquivos alterados na fase concluida
- `scripts/observability-operational-provider.mjs` (1 linha removida)
- `scripts/phase52-providermode-cleanup-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/63-fase-52-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase52`: OK (4 drills passando)
- `npm run test:phase51`: OK
- `npm run test:phase49`: OK
- `npm run build -w @supervisor/dashboard`: OK (sem erros TS)

## O que ainda nao foi fechado
- Fase 53 a definir conforme plano de conclusao
- O chain completo (phase30+) só é validado no workspace principal
- O PR #11 aguarda review/merge pelo mantenedor do repo canonical
- `minTeams=0` gate — prioridade baixa
- Padronizar documentos legados da raiz — prioridade baixa

## Proximo passo exato
Avaliar Fase 53 conforme necessidade do projeto:
1. Verificar plano de conclusao e TODO_AI.md
2. Possíveis direções: padronizar documentos legados, revisar minTeams=0, ou outras necessidades

## Como testar o estado atual
```bash
npm run test:phase52
npm run test:phase51
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
7. `docs/analise-projeto/63-fase-52-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 53 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
