# 54 - Fase 43 - Enforcement do Legacy Fallback e Interface do Coletor

## Objetivo da fase
Transformar `phase43-disable-legacy-fallback` em enforcement real em todos os caminhos observability, impedir reintroducao de `legacy_files` em smoke/live/compat/API e definir a interface do coletor/servico dedicado que substituira a alimentacao file-based do producer.

## Escopo fechado
1. Adicionar enforcement real (`enforceNoLegacy`) no helper canonico do provider operacional.
2. Exportar a interface do coletor dedicado (`OPERATIONAL_COLLECTOR_INTERFACE`) como contrato oficial no helper canonico.
3. Criar o script de enforcement `phase43-disable-legacy-fallback.mjs` com drill pass/blocked/mode-blocked.
4. Atualizar o smoke de CI (`ci-api-smoke.mjs`) para exigir `legacyFallbackState=disabled` no endpoint do producer.
5. Adicionar `test:phase43` e `monitor:fullcycle:observability:enforcement` em `package.json`.
6. Adicionar `test:phase43` como validacao obrigatoria no CI standalone.
7. Validar localmente e verificar regressoes nas fases anteriores.

## Decisao arquitetural
1. O enforcement real e ativado via `FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY=true` no helper canonico.
2. Quando enforcement ativo:
   - `providerMode != materialized_contract` lanca excecao imediata.
   - `allowLegacyFallback=true` lanca excecao imediata.
3. A interface do coletor (`OPERATIONAL_COLLECTOR_SCHEMA=fullcycle.observability.operational-collector.v1`) e o contrato oficial que qualquer coletor/servico dedicado futuro deve respeitar.
4. O script de enforcement (`phase43`) nao depende do chain completo (phase30+) para rodar na fase corrente; o chain completo e executado quando disponivel (workspace principal) e omitido quando nao disponivel (worktree esparso).
5. O smoke de CI passa a exigir `legacyFallbackState=disabled` e `legacyFallbackAllowed=false` no endpoint `/api/observability/connectors/backend/producer`.

## Entregas implementadas
1. Helper canonico do provider atualizado:
   - `scripts/observability-operational-provider.mjs`
   - Novo: `OPERATIONAL_COLLECTOR_SCHEMA`, `OPERATIONAL_COLLECTOR_VERSION`, `OPERATIONAL_COLLECTOR_INTERFACE`
   - Novo: opcao `enforceNoLegacy` (lida de `FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY`)
   - Enforcement: lanca erro se `providerMode != materialized_contract` com `enforceNoLegacy=true`
   - Enforcement: lanca erro se `allowLegacyFallback=true` com `enforceNoLegacy=true`
2. Script de enforcement da fase:
   - `scripts/phase43-disable-legacy-fallback.mjs`
3. Drill da fase:
   - `scripts/phase43-disable-legacy-fallback-drill.mjs`
4. Smoke de CI atualizado:
   - `scripts/ci-api-smoke.mjs`
5. Arquivos de configuracao atualizados:
   - `package.json` — `test:phase43`, `monitor:fullcycle:observability:enforcement`
   - `config/standalone-export.json` — `test:phase43` adicionado ao `validateCommands`

## Decisoes tecnicas relevantes
1. O `OPERATIONAL_COLLECTOR_INTERFACE` define os tres outputs obrigatorios (`incidentAutomation`, `itsmSnapshot`, `fullcycleReport`), os modos de integracao suportados (`file`, `api`, `service`), o modo preferido (`service`) e o target de rollout (`phase44-collector-service-integration`).
2. O enforcement e opcional por default (`enforceNoLegacy=false`), ativado explicitamente via env var ou opcao programatica, para nao quebrar ambientes que ainda nao migraram.
3. O gate `monitor:fullcycle:observability:enforcement` cobre: validacao da interface do coletor, verificacao das flags de enforcement, carregamento do provider com `enforceNoLegacy=true`, e (quando disponivel) execucao do chain phase42.
4. O drill da fase cobre tres cenarios: `enforce_pass` (config correta, sem legacy → sucesso), `legacy_blocked` (allowLegacyFallback=true com enforcement → rejeicao), `mode_blocked` (providerMode=legacy_files com enforcement → rejeicao).

## Validacao executada
1. Sintaxe:
   - `node --check scripts/observability-operational-provider.mjs` → OK
   - `node --check scripts/phase43-disable-legacy-fallback.mjs` → OK
   - `node --check scripts/phase43-disable-legacy-fallback-drill.mjs` → OK
   - `node --check scripts/ci-api-smoke.mjs` → OK
2. Drills/regressoes:
   - `npm run test:phase43` (worktree) → `pass` — collector_interface + enforce_pass + legacy_blocked + mode_blocked
   - `npm run test:phase37` (workspace) → `pass`
   - `npm run test:phase39` (workspace) → `pass`
   - `npm run test:phase40` (workspace) → `pass`
   - `npm run test:phase41` (workspace) → `pass`
   - `npm run test:phase42` (workspace) → `pass`
3. Build/gates:
   - `npm run build -w @supervisor/api` (workspace) → `pass`
   - `npm run monitor:fullcycle:observability:backend` (workspace) → `status=pass`, `producer=dedicated_script`, `legacy=disabled`

## Resultado observado
1. `npm run test:phase43` → `pass`:
   - `[OK] collector interface structure valid`
   - `[OK] enforce_pass: phase43 enforcement passed with full chain`
   - `[OK] legacy_blocked: enforcement correctly rejected allowLegacyFallback=true`
   - `[OK] mode_blocked: enforcement correctly rejected providerMode=legacy_files`
2. `monitor:fullcycle:observability:backend` → `status=pass`, `legacy=disabled`
3. Todas as regressoes de fase (phase37–42) → `pass`

## Evidencia objetiva
1. `logs/monitoring/phase43-drill/enforcement-report.json`
2. `logs/monitoring/phase43-drill/collector-interface.json`
3. `docs/fullcycle-connectors-observability-legacy-enforcement.md` (gerado pelo gate de enforcement)

## Riscos residuais
1. O chain completo (phase42 via phase30+) so e validado no workspace principal; o worktree esparso executa o drill sem o chain.
2. O coletor/servico dedicado ainda nao existe: a interface esta definida mas o rollout fica para a Fase 44.
3. O fallback `legacy_files` continua no codigo-base como compatibilidade, mas agora com enforcement ativo e smoke exigindo `disabled`.

## Proxima fase liberada
Fase 44 - integrar o coletor/servico dedicado usando a interface `OPERATIONAL_COLLECTOR_INTERFACE` como contrato, substituindo a alimentacao file-based do producer sem quebrar os contratos das Fases 41/42/43.
