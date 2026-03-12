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
6. `docs/analise-projeto/58-fase-47-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 47
- Proxima fase liberada: Fase 48 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 47 concluidas e registradas na memoria oficial.
- O módulo coletor dedicado (`phase44-operational-collector.mjs`) existe com modos `file`, `synthetic` e `api`.
- O modo `api` chama `GET /api/observability/connectors/backend/report` com timeout de 8s e AbortController.
- O producer usa o coletor por default (`USE_COLLECTOR=true`); bypass disponível via `USE_COLLECTOR=false`.
- Os contratos das Fases 41/42/43/44/46/47 continuam válidos.
- PR #10 aberto em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 47 entregou
- `buildApiSources({ apiBaseUrl, apiKey })` em `phase44-operational-collector.mjs`
- `mapApiSourcesToCollectorFormat()` mapeando `incidentAutomation`/`itsmSnapshot`/`fullcycleReport`
- Branch `if (mode === 'api')` em `collectOperationalSources()` (antes do check `synthetic`)
- Env vars: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_URL` (default `http://localhost:3000`) e `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_API_KEY`
- Drill novo: `scripts/phase47-collector-api-mode-drill.mjs` (3 drills: api_unreachable/api_mode_contract/mode_env_selection)
- `test:phase47` adicionado ao `package.json` e `config/standalone-export.json`
- CI run verde: `22981720840` (conclusion: success, 2m0s)

## Ultima entrega relevante
### Fase 47
- Evidencia oficial: `docs/analise-projeto/58-fase-47-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`

## Arquivos alterados na fase concluida
- `scripts/phase44-operational-collector.mjs`
- `scripts/phase47-collector-api-mode-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/58-fase-47-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase47`: OK (api_unreachable/api_mode_contract/mode_env_selection)
- `npm run test:phase46`: OK
- `npm run test:phase44`: OK
- `npm run test:phase43`: OK
- `npm run test:phase39`: OK
- `npm run test:phase40`: OK
- `npm run test:phase41`: OK
- `npm run test:phase42`: OK
- CI remoto verde: PR #10, run 22981720840

## O que ainda nao foi fechado
- O modo `service` do coletor (OPERATIONAL_COLLECTOR_INTERFACE declara 3 modos: file, api, service) ainda não está implementado.
- A integração com serviço externo real via modo `api` em CI usa mock; ambiente de produção requer URL real.
- O chain completo (phase30+) só é validado no workspace principal; o worktree esparso executa os drills sem o chain.
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical.

## Proximo passo exato
Avaliar Fase 48 conforme necessidade do projeto:
1. Verificar se há mais fases urgentes no plano de conclusao (`09-plano-conclusao-dashboard-comercial.md`).
2. Proximas evoluções possíveis: modo `service` do coletor, integração com endpoint de produção real, ou outras fases do plano.

## Como testar o estado atual
```bash
npm run test:phase47
npm run test:phase46
npm run test:phase44
npm run test:phase43
npm run test:phase42
npm run build -w @supervisor/api
npm run monitor:fullcycle:observability:backend
npm run monitor:fullcycle:observability:enforcement
npm run monitor:fullcycle:observability:collector
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
7. `docs/analise-projeto/58-fase-47-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 48 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
