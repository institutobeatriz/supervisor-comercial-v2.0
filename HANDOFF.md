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
6. `docs/analise-projeto/59-fase-48-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 48
- Proxima fase liberada: Fase 49 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 48 concluidas e registradas na memoria oficial.
- O coletor operacional (`phase44-operational-collector.mjs`) tem todos os modos do contrato:
  - `file`: lê arquivos locais (Phase 44)
  - `synthetic`: dados sintéticos para testes (Phase 44)
  - `api`: fetch HTTP one-shot com timeout 8s (Phase 47)
  - `service`: lazy polling com cache em memória TTL 300s (Phase 48)
- `OPERATIONAL_COLLECTOR_INTERFACE.integrationModes: ['file', 'api', 'service']` está fechado.
- O producer usa o coletor por default (`USE_COLLECTOR=true`).
- PR #10 aberto em institutobeatriz/supervisor-comercial-v2.0 com CI verde.

## O que a Fase 48 entregou
- `_serviceCache = { sources: null, fetchedAt: null }` — singleton de módulo
- `buildServiceSources({ apiBaseUrl, apiKey, ttlMs })` — lazy poll com guard NaN-safe
- Branch `if (mode === 'service')` antes de `api` em `collectOperationalSources()`
- `serviceTtlMs`: opção ou env `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_SERVICE_TTL_MS` (default `300000`)
- Drill novo: `scripts/phase48-collector-service-mode-drill.mjs` (4 drills: cache_hit/cache_miss/stale_refresh/env_selection)
- `test:phase48` adicionado ao `package.json` e `config/standalone-export.json`
- CI run verde: `22983410484` (conclusion: success, 1m49s)

## Ultima entrega relevante
### Fase 48
- Evidencia oficial: `docs/analise-projeto/59-fase-48-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`

## Arquivos alterados na fase concluida
- `scripts/phase44-operational-collector.mjs`
- `scripts/phase48-collector-service-mode-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/59-fase-48-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase48`: OK (cache_hit/cache_miss/stale_refresh/env_selection)
- `npm run test:phase47`: OK
- `npm run test:phase46`: OK
- `npm run test:phase44`: OK
- `npm run test:phase43`: OK
- CI remoto verde: PR #10, run 22983410484

## O que ainda nao foi fechado
- Decisão sobre quando `backend/producer` vira obrigatório sem fallback em todos os ambientes
- `backend/analytics` na UI executiva do painel
- O chain completo (phase30+) só é validado no workspace principal
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical

## Proximo passo exato
Avaliar Fase 49 conforme necessidade do projeto:
1. Verificar plano de conclusao (`09-plano-conclusao-dashboard-comercial.md`)
2. Possíveis direções: enforcement de `backend/producer` obrigatório, `backend/analytics` na UI, ou outras fases do plano

## Como testar o estado atual
```bash
npm run test:phase48
npm run test:phase47
npm run test:phase46
npm run test:phase44
npm run test:phase43
npm run monitor:fullcycle:observability:backend
npm run monitor:fullcycle:observability:collector
```

## Observacoes importantes
- `OPERATIONAL_COLLECTOR_INTERFACE.integrationModes` está agora completamente implementado.
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
7. `docs/analise-projeto/59-fase-48-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 49 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
