# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/49-fase-38-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
7. `docs/standalone-repo-flow.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 38
- Proxima fase liberada: Fase 39
- Fase em andamento: nenhuma

## O que foi concluido ate agora
- Fases 0 a 38 concluidas e registradas na memoria oficial.
- A trilha live/backend-first continua validada localmente apos remocao de assets inline.
- O painel realtime e o dashboard executivo interno passaram a operar com assets externos e CSP endurecida.
- O fluxo canonico standalone continua pronto para sync/publish remoto quando quisermos propagar esta fase para o repo canonico de CI.

## O que a Fase 38 entregou
- Externalizacao de CSS/JS do painel realtime em `scripts/phase31-observability-panel-backend-template.html` + `scripts/assets/fullcycle-connectors-observability-ops-panel.*`.
- Shell HTML com assets externos para a UI executiva original em `scripts/phase24-observability-layer.mjs` + `scripts/assets/fullcycle-connectors-observability.*`.
- Dashboard legado materializado sem CSS inline em `scripts/phase35-observability-legacy-convergence.mjs` + `scripts/assets/fullcycle-connectors-observability-compat.css`.
- Rotas internas de assets e CSP sem `unsafe-inline` em `apps/api/src/routes/observability.ts`.
- Smoke/drills/governanca endurecidos em `scripts/ci-api-smoke.mjs`, `scripts/phase24-observability-drill.mjs`, `scripts/phase31-observability-panel-backend-integration-drill.mjs`, `scripts/phase33-observability-live-runtime-validation.mjs`, `scripts/phase34-observability-live-governance.mjs` e `scripts/phase38-observability-csp-hardening.mjs`.

## Ultima entrega relevante
### Fase 38
- Evidencia oficial: `docs/analise-projeto/49-fase-38-validacao.md`
- Memoria oficial atualizada: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Novo drill: `scripts/phase38-observability-csp-hardening.mjs`
- Rotas/CSP: `apps/api/src/routes/observability.ts`

## Arquivos alterados na fase concluida
- `apps/api/src/routes/observability.ts`
- `scripts/observability-html-assets.mjs`
- `scripts/phase24-observability-layer.mjs`
- `scripts/phase24-observability-drill.mjs`
- `scripts/phase31-observability-panel-backend-template.html`
- `scripts/phase31-observability-panel-backend-integration.mjs`
- `scripts/phase31-observability-panel-backend-integration-drill.mjs`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase34-observability-live-governance.mjs`
- `scripts/phase35-observability-legacy-convergence.mjs`
- `scripts/phase38-observability-csp-hardening.mjs`
- `scripts/assets/fullcycle-connectors-observability.css`
- `scripts/assets/fullcycle-connectors-observability.js`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.css`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.js`
- `scripts/assets/fullcycle-connectors-observability-compat.css`
- `scripts/ci-api-smoke.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/analise-projeto/49-fase-38-validacao.md`
- `docs/analise-projeto/10-memoria-execucao-fases.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run test:phase24`: OK
- `npm run test:phase31`: OK
- `npm run test:phase35`: OK
- `npm run test:phase38`: OK
- `npm run build -w @supervisor/api`: OK
- `npm run test:phase34`: OK (`status=pass`, `contracts=21/21`)
- `npm run monitor:fullcycle:observability:live`: OK (`status=pass`, `contracts=21/21`)

## O que ainda nao foi fechado
- A origem de on-call continua file-based (`rotation/calendar`).
- O repo standalone remoto ainda nao foi republicado com a Fase 38.
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado; se outra rotina live rodar depois, ele muda novamente.

## Proximo passo exato
Iniciar a Fase 39 com este recorte:
1. substituir a origem file-based de on-call por fonte operacional real;
2. preservar os contratos atuais de `backend/analytics`, `incidents/alerts` e painel;
3. validar que owner coverage, escalations e dashboard continuam coerentes apos a troca da fonte.

## Hipotese principal da proxima fase
- O maior gap estrutural restante na trilha backend/live nao e mais CSP/HTML, e sim a dependencia de `rotation/calendar` locais para ownership dinamico.
- Se migrarmos isso para uma fonte operacional real sem quebrar os contratos atuais, reduzimos drift e aproximamos o fluxo de producao.

## Como testar o estado atual
```bash
npm run test:phase24
npm run test:phase31
npm run test:phase35
npm run test:phase38
npm run build -w @supervisor/api
npm run test:phase34
npm run monitor:fullcycle:observability:live
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
2. `PROJECT_RULES.md`
3. `HANDOFF.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`
6. `docs/analise-projeto/49-fase-38-validacao.md`
7. `docs/standalone-repo-flow.md`

Objetivo:
Continuar exatamente da Fase 39, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
