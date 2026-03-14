# 64 - Fase 53 — Política de minTeams na Gate do Painel Operacional

## Status: CONCLUÍDA
## Data: 2026-03-13

## Objetivo
Formalizar e validar a política de `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS`
na gate do painel operacional (`phase31-observability-panel-backend-integration.mjs`).
A política define: MIN_TEAMS=0 é permissiva (sem exigência de times), MIN_TEAMS>=1
é restritiva (gate falha com `backend_teams_insufficient` quando `teams.length < minTeams`).

## Decisão documentada
- Em ambientes CI sem dados reais de times, usar `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0`
  para evitar falhas espúrias por `backend_teams_insufficient`.
- Em produção, `MIN_TEAMS=1` (ou maior) garante que a gate exige times configurados.
- O default do script permanece `1` (conservador). A decisão de usar `0` é explícita via env.

## Drills

| Drill | Resultado |
|---|---|
| `minteams_zero_no_violation` | PASS |
| `minteams_one_fires` | PASS |
| `minteams_one_satisfied` | PASS |
| `regression_phase31_drill` | PASS |

## Build
- `npm run build -w @supervisor/dashboard`: ✅ sem erros TypeScript

## Regressão

| Teste | Resultado |
|---|---|
| `npm run test:phase53` | 4 passed, 0 failed |
| `npm run test:phase52` | 4 passed, 0 failed |
| `npm run test:phase51` | 4 passed, 0 failed |

## CI remoto
- PR: https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/13
- CI run: https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/23051052903
- Conclusão: success (quality-and-smoke: ✅)

## Commits desta fase
- `b4a3296` test(phase53): add minTeams policy drill
- `36504e3` feat(phase53): wire test:phase53 to package.json and standalone-export
- `7a5cff5` handoff(phase53): minTeams policy drill — evidence + memory + handoff
