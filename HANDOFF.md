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
6. `docs/analise-projeto/60-fase-49-validacao.md`
7. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
8. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Claude (claude-sonnet-4-6)
- Data do handoff: 2026-03-12
- Ultima fase concluida: Fase 49
- Proxima fase liberada: Fase 50 (a definir)
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 49 concluidas e registradas na memoria oficial.
- O coletor operacional (`phase44-operational-collector.mjs`) tem todos os modos: `file`, `api`, `service`.
- `OPERATIONAL_COLLECTOR_INTERFACE.integrationModes: ['file', 'api', 'service']` está fechado.
- O producer usa o coletor por default (`USE_COLLECTOR=true`).
- Os dead branches do fallback `legacy_files` foram removidos do provider e producer.
- `legacyFallbackState` é sempre `'disabled'` hardcoded; `buildLegacySources()` mantida para o caminho file-reading.
- PR #10 em institutobeatriz/supervisor-comercial-v2.0 com CI verde (run 23000418395).

## O que a Fase 49 entregou
- Remoção de `allowLegacyFallback`/`enforceNoLegacy` do objeto `cfg` em `loadOperationalProvider()`
- Remoção do bloco `if (cfg.providerMode !== 'materialized_contract')` (retornava `mode:'legacy_files'`)
- Remoção do bloco `if (!contract && cfg.allowLegacyFallback)` (segundo fallback legacy)
- `legacyFallbackState: 'disabled'` e `legacyFallbackAllowed: false` hardcoded em `buildProviderMeta()`
- Producer: `allowLegacyFallback` removido de cfg, producerDescriptor, summary, config e chamada ao provider
- Drill novo: `scripts/phase49-legacy-removal-drill.mjs` (4 drills)
- `test:phase49` adicionado ao `package.json` e `config/standalone-export.json`

## Ultima entrega relevante
### Fase 49
- Evidencia oficial: `docs/analise-projeto/60-fase-49-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23000418395

## Arquivos alterados na fase concluida
- `scripts/observability-operational-provider.mjs`
- `scripts/phase42-observability-operational-provider-producer.mjs`
- `scripts/phase49-legacy-removal-drill.mjs` (novo)
- `package.json`
- `config/standalone-export.json`
- `docs/analise-projeto/60-fase-49-validacao.md` (novo)
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase49`: OK (no_legacy_mode_branch/legacy_fallback_state_hardcoded_disabled/legacy_fallback_allowed_hardcoded_false/allow_legacy_fallback_option_ignored)
- `npm run test:phase48`: OK
- `npm run test:phase47`: OK
- `npm run test:phase46`: OK
- `npm run test:phase44`: OK
- `npm run test:phase43`: OK
- CI remoto verde: PR #10, run 23000418395

## O que ainda nao foi fechado
- Decisão sobre quando `backend/producer` vira obrigatório sem fallback em todos os ambientes
- `backend/analytics` na UI executiva do painel
- O chain completo (phase30+) só é validado no workspace principal
- O PR #10 aguarda review/merge pelo mantenedor do repo canonical
- `cfg.providerMode` ainda presente em `loadOperationalProvider()` mas não lido após remoção dos branches (dead config menor, sem impacto)

## Proximo passo exato
Avaliar Fase 50 conforme necessidade do projeto:
1. Verificar plano de conclusao (`09-plano-conclusao-dashboard-comercial.md`)
2. Possíveis direções: `backend/analytics` na UI executiva, enforcement de `backend/producer` obrigatório, ou outras fases do plano

## Como testar o estado atual
```bash
npm run test:phase49
npm run test:phase48
npm run test:phase47
npm run test:phase46
npm run test:phase44
npm run test:phase43
```

## Observacoes importantes
- `docs/analise-projeto/10-memoria-execucao-fases.md` continua sendo a fonte historica oficial.
- O repo standalone publicado segue sendo o repositorio canonico de CI remoto.
- `buildLegacySources()` foi mantida intencionalmente — ainda alimenta o contrato materializado.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. `docs/analise-projeto/60-fase-49-validacao.md`
8. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 50 (ou próxima fase definida no plano), sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
