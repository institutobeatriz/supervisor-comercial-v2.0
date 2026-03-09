# CLAUDE

## Purpose
This repository uses a shared handoff protocol so Codex, Claude Code, OpenClaw and human operators can continue the same work without losing context.

## Mandatory read order
Before making any change, read in this order:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. the latest phase evidence in `docs/analise-projeto/`

If the task touches operations, CI, deploy or observability, also read:
1. `README.md`
2. `docs/runbook-operacional.md`
3. `docs/monitoramento-externo.md`

## Source of truth
- Historical truth: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Current baton state: `HANDOFF.md`
- Current queue: `TODO_AI.md`
- Main execution plan: `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
- Global project policy: `AGENTS.md`

Do not create parallel documentation that conflicts with these files.

## How to continue work
1. Understand the current phase and the next unlocked phase from the official memory.
2. Read the files referenced in `HANDOFF.md`.
3. Execute only the next necessary step.
4. Reuse existing files and architecture whenever possible.
5. Avoid broad refactors unless the current phase explicitly requires them.

## Mandatory behavior at the end of each phase
When a phase is completed, do all of the following automatically:
1. update `HANDOFF.md`
2. update `TODO_AI.md`
3. update `docs/analise-projeto/10-memoria-execucao-fases.md`
4. create or update the phase evidence file in `docs/analise-projeto/`
5. run the relevant validations for the phase
6. create a focused WIP commit for that phase only

## WIP commit rule
- Stage only files related to the completed phase.
- Do not include unrelated dirty worktree changes.
- Preferred message format:
  - `handoff(phaseNN): short summary`
  - example: `handoff(phase31): backend-first panel completed`

## Hard rules
1. Preserve the existing architecture and phase history.
2. Do not revert unrelated changes from other agents or humans.
3. Do not rename endpoints, routes, files or env vars without justification.
4. Do not break observability contracts without updating tests, docs, smoke and memory.
5. Do not invent behavior not supported by code or documentation.

## Current expectation in this repository
At the time this file was created:
- phases 0 to 31 were already completed
- `HANDOFF.md` contains the current baton state
- the next expected work starts from phase 32

## Short takeover prompt
Continue this project from the current repository state.

Read first:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`

Goal:
Continue exactly from the current unlocked phase without restarting, without unnecessary refactors, and without creating conflicting project memory.
