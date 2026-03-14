# 55 - Fase 44 - Integração do Coletor Operacional Dedicado

## Objetivo da fase
Implementar o coletor/stub concreto respeitando a `OPERATIONAL_COLLECTOR_INTERFACE`, substituir a alimentação file-based do producer pelo coletor com contrato versionado, e validar que os contratos das Fases 41/42/43 continuam válidos após a integração.

## Escopo fechado
1. Adicionar opção `collectorSources` ao `loadOperationalProvider` para aceitar fontes pré-construídas pelo coletor.
2. Criar o módulo coletor dedicado (`phase44-operational-collector.mjs`) com modos `file` e `synthetic`.
3. Exportar `collectOperationalSources` e `validateCollectorSources` como contrato do coletor.
4. Criar o drill de validação (`phase44-operational-collector-drill.mjs`) cobrindo `file_mode`, `synthetic_mode` e `integration`.
5. Atualizar o producer dedicado (`phase42`) com integração opcional ao coletor via env var.
6. Adicionar `test:phase44` e `monitor:fullcycle:observability:collector` em `package.json`.
7. Adicionar `test:phase44` como validação obrigatória no CI standalone.
8. Validar localmente e verificar regressões nas fases anteriores.

## Decisão arquitetural
1. A opção `collectorSources` em `loadOperationalProvider` é o ponto de integração canônico: quando fornecida, o provider usa as fontes pré-normalizadas do coletor em vez de ler arquivos diretamente.
2. O coletor opera em dois modos:
   - `file` (padrão): lê os três arquivos JSON operacionais e normaliza exatamente como o provider faria.
   - `synthetic`: gera dados determinísticos de teste que satisfazem todos os campos obrigatórios da interface.
3. O producer dedicado (`phase42`) aceita `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR=true` para ativar o coletor; por padrão mantém o caminho file-based direto (retrocompatível).
4. A integração com o coletor é opcional e não-bloqueante no producer: falha do coletor gera `violation` não-bloqueante e o provider cai no caminho file-based.
5. O módulo coletor usa guarda de entry point ESM (`import.meta.url`) para não executar `main()` quando importado como módulo.

## Entregas implementadas
1. Helper canônico do provider atualizado:
   - `scripts/observability-operational-provider.mjs`
   - Novo: opção `collectorSources` em `loadOperationalProvider`
   - Quando `collectorSources` presente: usa fontes pré-construídas, omite leitura de arquivos
2. Módulo coletor dedicado (novo):
   - `scripts/phase44-operational-collector.mjs`
   - Exporta: `collectOperationalSources(options)`, `validateCollectorSources(sources)`
   - Modos: `file` | `synthetic`
   - Env: `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE`
   - Entry point guard via `import.meta.url`
3. Drill do coletor (novo):
   - `scripts/phase44-operational-collector-drill.mjs`
4. Producer atualizado:
   - `scripts/phase42-observability-operational-provider-producer.mjs`
   - Novo: `useCollector` / `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR`
   - Novo: `collectorMode` / `FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE`
5. Arquivos de configuração atualizados:
   - `package.json` — `test:phase44`, `monitor:fullcycle:observability:collector`
   - `config/standalone-export.json` — `test:phase44` adicionado ao `validateCommands`

## Decisões técnicas relevantes
1. A forma do `collectorSources` é idêntica ao retorno de `buildLegacySources` — três chaves (`incidentAutomation`, `itsmSnapshot`, `fullcycleReport`) com campos `key`, `label`, `file`, `loaded`, `timestamp` e campos específicos de cada fonte.
2. O coletor reimplementa a normalização do provider (em vez de importar funções privadas) porque é o ponto de seam futuro — quando um serviço real substituir o coletor, ele produzirá o mesmo shape.
3. O modo `synthetic` produz dados determinísticos com `INC-SYNTH-001`, `PAGE-SYNTH-001`, `TKT-SYNTH-001` — suficientes para validar o contrato sem dependência de arquivos reais.
4. O drill de integração passa caminhos de arquivo inválidos ao `loadOperationalProvider` junto com `collectorSources` — provando que os arquivos não são lidos quando o coletor está ativo.

## Validação executada
1. Sintaxe:
   - `node --check scripts/observability-operational-provider.mjs` → OK
   - `node --check scripts/phase44-operational-collector.mjs` → OK
   - `node --check scripts/phase44-operational-collector-drill.mjs` → OK
   - `node --check scripts/phase42-observability-operational-provider-producer.mjs` → OK
2. Drills/regressões:
   - `npm run test:phase44` (worktree) → `pass` — file_mode + synthetic_mode + integration
   - `npm run test:phase43` (worktree) → `pass`
   - `npm run test:phase42` (workspace) → `pass`
3. Build:
   - `npm run build -w @supervisor/api` (workspace) → `pass`

## Resultado observado
1. `npm run test:phase44` → `pass` (3 passed, 0 failed):
   - `[OK] file_mode: PASS` — estrutura válida com arquivos ausentes
   - `[OK] synthetic_mode: PASS` — dados sintéticos carregados e validados
   - `[OK] integration: PASS` — provider usa fontes do coletor, ignora arquivos inválidos
2. `npm run test:phase43` → `pass` — enforcement e interface do coletor preservados
3. `npm run test:phase42` → `pass` — producer retrocompatível

## Evidência objetiva
1. `logs/monitoring/phase44-drill/drill-report.json`
2. `logs/monitoring/phase44-drill/phase44-integration-contract.json`

## Riscos residuais
1. O coletor está implementado como stub — a integração com um serviço externo real fica como próxima iteração.
2. O producer usa o coletor apenas quando `FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR=true` — a migração default fica para iteração futura.
3. A Fase 44 (e Fase 43) ainda não foram propagadas para o repo standalone canônico de CI.
4. O chain completo (phase30+) só é validado no workspace principal; o worktree esparso executa os drills sem o chain.

## Próxima fase liberada
Fase 45 — propagar Fases 43 e 44 para o repo standalone canônico (PR + GitHub Actions) e decidir a migração default do producer para o coletor.
