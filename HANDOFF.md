# HANDOFF

## Projeto
- Nome: `supervisor-comercial`
- Objetivo atual: concluir a trilha premium do dashboard comercial e da observabilidade enterprise, mantendo rastreabilidade por fases e validacao objetiva.

## Leitura minima para continuar
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `TODO_AI.md`
4. `docs/analise-projeto/10-memoria-execucao-fases.md`
5. `docs/analise-projeto/46-fase-35-validacao.md`
6. `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`

## Estado atual
- Responsavel anterior: Codex
- Data do handoff: 2026-03-09
- Ultima fase concluida: Fase 35
- Proxima fase liberada: Fase 36
- Fase em andamento: Fase 36 (parcial)

## O que foi concluido ate agora
- Fases 0 a 35 concluidas e registradas na memoria oficial.
- A trilha live/backend-first segue com fluxo oficial recorrente de governanca (`phase34`) em cima do motor runtime da Fase 33.
- A Fase 35 convergiu a trilha legada de observability para backend-first por materializacao automatica de payload.
- O smoke live passou a exigir `200` em `summary`, `feed`, `history` e `dashboard`, sem tolerancia a `503`.
- O painel operacional segue validado em browser/headless com SSE, incidents, alerts, API SLA e analytics executivo.

## Avanco atual da Fase 36
- O ruido inicial de `401` no bootstrap do painel foi eliminado localmente.
- O template do painel agora consome `adminKey`/`role`/`limit`/`apiBase` da query string antes do primeiro refresh.
- O motor live da Fase 33 agora falha se detectar requests `401` de bootstrap nos endpoints protegidos do painel.
- Foi criado um preflight explicito de GitHub Actions: `scripts/phase36-observability-github-actions-preflight.mjs`.
- O preflight confirmou: `gh` autenticado, mas `remote origin` ausente; portanto a execucao em runner GitHub real esta bloqueada neste estado do repositorio.

## Ultima entrega relevante
### Fase 36 (em andamento)
- Template do painel: `scripts/phase31-observability-panel-backend-template.html`
- Motor live endurecido: `scripts/phase33-observability-live-runtime-validation.mjs`
- Preflight GitHub: `scripts/phase36-observability-github-actions-preflight.mjs`
- Dashboard de preflight: `docs/fullcycle-connectors-observability-github-preflight.md`

## Arquivos alterados no andamento atual
- `scripts/phase31-observability-panel-backend-template.html`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase36-observability-github-actions-preflight.mjs`
- `docs/fullcycle-connectors-observability-github-preflight.md`
- `HANDOFF.md`
- `TODO_AI.md`

## O que esta funcionando
- `npm run build -w @supervisor/api`: OK
- `npm run test:phase32`: OK
- `npm run test:phase33`: OK
- `npm run test:phase34`: OK
- `npm run test:phase35`: OK
- `npm run test:phase31`: OK
- `npm run monitor:fullcycle:observability:compat`: OK
- `npm run monitor:fullcycle:observability:live`: OK
- Smoke live observability: `smokeOk=28`, `smokeFail=0`
- Contrato live estruturado: `contractValidated=20`, `contractFail=0`, `requiredChecks=18/18`
- Endpoints legados endurecidos no smoke: `summary=200`, `feed=200`, `history=200`, `dashboard=200`
- Compatibilidade legada: `status=pass`, `compatibilityMode=materialized_from_backend_first`
- Painel headless: `conn=connected`, `incidents=1 visible`, `alerts=1 visible`, `sla=2 points`, `teams=2`
- Ruido de bootstrap do painel: `browserBootstrapAuthNoise=0`
- Analytics executivo live: HTTP `200`, `ownerCoveragePct=100`

## O que ainda nao foi fechado
- O caminho das Fases 34/35 segue sem execucao em runner GitHub real porque este repositorio local nao possui `remote origin`.
- Sem `remote`, nao ha como disparar ou inspecionar GitHub Actions reais sem publicar o codigo em um repositorio novo ou conectar a um remoto existente.
- Os dashboards HTML internos continuam com assets inline, mesmo com CSP route-scoped correto.
- A integracao de on-call continua file-based (`rotation/calendar`) sem provedor externo real.

## Proximo passo exato
Iniciar a Fase 36 com este recorte:
1. conectar este repo a um `remote origin` existente ou autorizar a criacao/publicacao de um remoto privado;
2. executar a trilha das Fases 34/35 em runner GitHub real;
3. coletar evidencia objetiva do browser/services do CI e registrar o resultado final da Fase 36.

## Hipotese principal da proxima fase
- O principal gap funcional da trilha legada foi fechado na Fase 35.
- O ruido local do painel foi resolvido; o bloqueio restante agora e exclusivamente a ausencia de `remote origin` para GitHub Actions reais.
- Antes de abrir outra frente de enriquecimento visual, vale fechar a robustez final do gate live em ambiente GitHub.

## Como testar o estado atual
```bash
npm run build -w @supervisor/api
npm run test:phase32
npm run test:phase33
npm run test:phase34
npm run test:phase35
npm run monitor:fullcycle:observability:compat
npm run monitor:fullcycle:observability:live
node scripts/phase36-observability-github-actions-preflight.mjs
```

## Observacoes importantes
- Este repositorio ja esta com worktree sujo; nao reverter mudancas alheias.
- `docs/analise-projeto/10-memoria-execucao-fases.md` e a fonte historica oficial.
- `HANDOFF.md` nao substitui a memoria; ele resume o agora.
- A Fase 34 continua como wrapper oficial do gate live e agora embute a compatibilidade da Fase 35.
- A Fase 35 garante disponibilidade da trilha legada sem confundir isso com o status operacional do backend.
- O smoke live agora tem report estruturado, falha por contrato e nao tolera `503` nos endpoints legados principais.
- A Fase 36 ainda nao pode ser concluida sem um remoto GitHub real conectado a este repositorio local.
- Ao terminar cada fase, atualizar este arquivo, `TODO_AI.md`, memoria oficial e criar commit WIP focado na fase.

## Prompt curto para a proxima IA
Continue este projeto a partir do estado atual do repositorio.

Leia primeiro:
1. `AGENTS.md`
2. `PROJECT_RULES.md`
3. `HANDOFF.md`
4. `TODO_AI.md`
5. `docs/analise-projeto/10-memoria-execucao-fases.md`

Objetivo:
Continuar exatamente da Fase 36, sem refatoracao ampla desnecessaria e sem duplicar a memoria historica do projeto.
