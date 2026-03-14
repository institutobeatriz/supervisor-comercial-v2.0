# Fase 57 — Validação: Drill de Decisão de Extração do Git Root

## Resumo
Fase de decisão que formaliza via drill automatizado a política de **não extrair** o projeto para um git root próprio neste estágio. Segue o padrão de decision drills das Fases 51-53.

## Data
- Início: 2026-03-13
- Conclusão: 2026-03-13

## Objetivo
Avaliar e documentar formalmente se a extração do projeto para um repositório/git root próprio traria ganho operacional relevante. Conclusão: não é necessário neste estágio.

## Artefatos criados
- `scripts/phase57-git-root-decision-drill.mjs` — drill com 4 probes
- `test:phase57` em `package.json`
- `test:phase57` em `config/standalone-export.json` (validateCommands)

## Drills executados

| # | Nome | Status |
|---|---|---|
| 1 | workspace_structure_sufficient | PASS |
| 2 | standalone_ci_validates_coverage | PASS |
| 3 | standalone_sync_scripts_present | PASS |
| 4 | decision_extraction_not_required | PASS |

### Drill 1 — workspace_structure_sufficient
Verifica que os arquivos críticos (HANDOFF.md, TODO_AI.md, package.json, standalone-export.json, 10-memoria-execucao-fases.md) existem e são acessíveis no workspace nested atual. `package.json` é JSON válido com `name` e `workspaces`.

### Drill 2 — standalone_ci_validates_coverage
Parseia `config/standalone-export.json` e valida que `validateCommands` contém ≥30 comandos `test:phase`. Resultado: **42 test:phase commands** (total: 46 comandos). git.repo = `institutobeatriz/supervisor-comercial-v2.0`.

### Drill 3 — standalone_sync_scripts_present
Confirma presença e não-trivialidade dos 3 scripts de automação standalone:
- `scripts/phase37-standalone-sync.mjs`
- `scripts/phase37-standalone-publish.mjs`
- `scripts/phase37-standalone-sync-drill.mjs`

### Drill 4 — decision_extraction_not_required
Formaliza e arquiva a decisão em `logs/monitoring/phase57-drill/git-root-decision.json`:
- **Conclusão**: `not_required`
- **Rationale** (5 razões documentadas):
  1. Workspace nested funcional: todos arquivos críticos acessíveis via cwd convencional
  2. CI standalone completo: validateCommands cobre todas as fases sem monorepo separado
  3. Automação de sync (phase37) opera corretamente a partir do workspace atual
  4. Ganho operacional de extração seria marginal; custo de migração não justificado
  5. Worktree isolation (epic-sanderson) provê isolamento suficiente para desenvolvimento paralelo
- **Condições de revisão** (3 documentadas):
  1. Múltiplos times independentes com ciclos de release separados
  2. CI standalone atingir limitações que exijam monorepo próprio
  3. Necessidade de versionamento semântico independente

## Output do drill

```
[phase57-git-root-decision-drill] Starting...

[Drill] workspace_structure_sufficient
[Drill 1] workspace_structure_sufficient — arquivos críticos acessíveis no workspace nested
  [OK] HANDOFF.md existe no workspace
  [OK] TODO_AI.md existe no workspace
  [OK] package.json existe no workspace
  [OK] config/standalone-export.json existe no workspace
  [OK] docs/analise-projeto/10-memoria-execucao-fases.md existe no workspace
  [OK] package.json tem campo name
  [OK] package.json tem workspaces (monorepo)
  [INFO] decisão: estrutura nested não bloqueia nenhuma operação crítica

[Drill] standalone_ci_validates_coverage
[Drill 2] standalone_ci_validates_coverage — validateCommands cobre ≥30 comandos de teste
  [OK] validateCommands é array
  [OK] validateCommands tem ≥30 test:phase commands (encontrado: 42)
  [OK] git.repo está configurado
  [OK] git.branchPrefix configurado
  [INFO] CI standalone cobre 42 fases de teste (total=46 comandos)
  [INFO] repo canonical: institutobeatriz/supervisor-comercial-v2.0
  [INFO] decisão: cobertura CI completa sem necessidade de git root separado

[Drill] standalone_sync_scripts_present
[Drill 3] standalone_sync_scripts_present — scripts de sync standalone presentes e acessíveis
  [OK] scripts/phase37-standalone-sync.mjs presente
  [OK] scripts/phase37-standalone-publish.mjs presente
  [OK] scripts/phase37-standalone-sync-drill.mjs presente
  [OK] phase37-standalone-sync-drill.mjs é não-trivial
  [OK] phase37 drill contém lógica de validação
  [INFO] todos os scripts de automação standalone presentes
  [INFO] decisão: fluxo sync/publish/drill não requer git root próprio para operar

[Drill] decision_extraction_not_required
[Drill 4] decision_extraction_not_required — formaliza decisão: git root separado não é necessário
  [OK] conclusão formalizada: git root separado não é necessário
  [OK] rationale documentado com 5 razões
  [OK] condições de revisão documentadas
  [INFO] conclusão: not_required
  [INFO] decisão formalizada e arquivada no drill report

[phase57-git-root-decision-drill] status=pass errors=0
```

## Resultado final
- **Status**: PASS (4/4 drills)
- **Decisão formalizada**: git root separado **não é necessário** neste estágio
- `test:phase57` adicionado ao `validateCommands` do CI standalone
