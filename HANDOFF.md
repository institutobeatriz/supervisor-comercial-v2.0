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
6. `docs/analise-projeto/55-fase-44-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-11
- Ultima fase concluida: Fase 44
- Proxima fase liberada: Fase 45
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 44 concluidas e registradas na memoria oficial.
- O módulo coletor dedicado (`phase44-operational-collector.mjs`) existe com modos `file` e `synthetic`.
- O provider aceita `collectorSources` para bypass do file-reading quando o coletor já normalizou as fontes.
- O producer dedicado (`phase42`) integra o coletor opcionalmente via `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR=true`.
- Os contratos das Fases 41/42/43 continuam válidos.

## O que a Fase 44 entregou
- Provider canônico atualizado: `scripts/observability-operational-provider.mjs`
  - Novo: opção `collectorSources` em `loadOperationalProvider`
  - Quando `collectorSources` presente: bypass da leitura de arquivos
- Módulo coletor (novo): `scripts/phase44-operational-collector.mjs`
  - Exporta: `collectOperationalSources(options)`, `validateCollectorSources(sources)`
  - Modos: `file` (default) | `synthetic`
  - Env: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE`
  - Entry point guard via `import.meta.url`
- Drill (novo): `scripts/phase44-operational-collector-drill.mjs`
- Producer atualizado: `scripts/phase42-observability-operational-provider-producer.mjs`
  - Novo: `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR` (bool, default false)
  - Novo: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE` (string, default 'file')
- Scripts adicionados em `package.json`: `test:phase44`, `monitor:fullcycle:observability:collector`
- CI standalone: `config/standalone-export.json` com `test:phase44` em `validateCommands`

## Ultima entrega relevante
### Fase 44
- Evidencia oficial: `docs/analise-projeto/55-fase-44-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Artefatos gerados:
  - `logs/monitoring/phase44-drill/drill-report.json`
  - `logs/monitoring/phase44-drill/phase44-integration-contract.json`

## Arquivos alterados na fase concluida
- `scripts/observability-operational-provider.mjs`
- `scripts/phase44-operational-collector.mjs` (novo)
- `scripts/phase44-operational-collector-drill.mjs` (novo)
- `scripts/phase42-observability-operational-provider-producer.mjs`
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/55-fase-44-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase44`: OK (worktree) — file_mode + synthetic_mode + integration
- `npm run test:phase43`: OK (worktree)
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase42`: OK (workspace principal)
- `npm run build -w @supervisor/api`: OK

## O que ainda nao foi fechado
- O coletor é um stub: integração com serviço externo real fica para iteração futura.
- O producer usa o coletor apenas quando `USE_COLLECTOR=true`: migração default fica para iteração futura.
- As Fases 43 e 44 ainda não foram propagadas para o repo standalone canônico de CI.
- O chain completo (phase30+) só é validado no workspace principal; o worktree esparso executa os drills sem o chain.

## Proximo passo exato
Iniciar a Fase 45 com este recorte:
1. Propagar Fases 43 e 44 para o repo standalone canônico (PR + GitHub Actions).
2. Decidir quando `USE_COLLECTOR=true` deve virar o default no producer.
3. Validar CI remoto verde após propagação.

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
7. `docs/analise-projeto/55-fase-44-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 45, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
