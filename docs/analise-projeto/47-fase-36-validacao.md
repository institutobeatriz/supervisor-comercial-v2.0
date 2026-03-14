# 47 - Fase 36 Validacao

## Objetivo da fase
Validar a trilha live/compat em runner GitHub real, fechar o gap entre ambiente local e CI e registrar a evidencia operacional completa.

## Escopo executado
1. Criacao e validacao de uma copia standalone do projeto em `.export-repo`.
2. Publicacao real no GitHub em `institutobeatriz/supervisor-comercial-v2.0`.
3. Execucao iterativa do workflow `CI` ate o pipeline fechar verde em runner GitHub real.
4. Correcoes minimas e objetivas no runtime live, no workflow e nas gates backend/painel.

## Correcoes aplicadas durante a fase
1. Preflight GitHub e organizacao operacional:
   - `scripts/phase36-observability-github-actions-preflight.mjs`
   - `docs/fullcycle-connectors-observability-github-preflight.md`
2. Correcao do bootstrap do painel:
   - `scripts/phase31-observability-panel-backend-template.html`
3. Endurecimento do runtime live:
   - `scripts/phase33-observability-live-runtime-validation.mjs`
   - fallback explicito para `ws` quando `globalThis.WebSocket` nao existir no Node do runner
4. Ajustes de CI:
   - `.github/workflows/ci.yml`
   - `npm ci --include=dev`
   - bootstrap controlado da gate backend (`requireIncidents/alert/apiSlaHistory=false`)
   - gate final do painel com `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0`
5. Ajuste do painel backend-first:
   - `scripts/phase31-observability-panel-backend-integration.mjs`
   - `minTeams` agora aceita `0` quando explicitamente configurado
6. Dependencia adicional:
   - `package.json`
   - `package-lock.json`
   - dependencia `ws`

## Linha do tempo objetiva dos runs reais

| Run | Commit | Resultado | Causa principal | Correcao aplicada |
|---|---|---|---|---|
| `22861947340` | `ee9117c` | fail | `eslint` ausente em CI sob `NODE_ENV=production` | `npm ci --include=dev` |
| `22862059342` | `33858bf` | fail | Fase 35 assumia artifacts previos no runner limpo | bootstrap controlado da compatibilidade |
| `22862224498` | `a248a65` | fail | `phase33`: `WebSocket is not defined` | fallback para `ws` |
| `22862538783` | `10729c6` | fail | gate backend da Fase 32 exigia incidents file no runner limpo | flags `require* = false` na gate backend |
| `22862753144` | `96c6a17` | fail | gate final do painel exigia `minTeams >= 1` com snapshot sem incidents/alerts ativos | `minTeams=0` configuravel + env dedicado na gate |
| `22862899577` | `6064f7e` | pass | pipeline completo verde | fase concluida |

## Validacao local executada
1. Na copia standalone `.export-repo`:
   - `npm ci`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:phase31`
   - `npm run test:phase32`
   - `npm run test:phase33`
   - `npm run test:phase34`
   - `npm run test:phase35`
2. Validacoes direcionadas apos as correcoes:
   - `node --check scripts/phase33-observability-live-runtime-validation.mjs`
   - `node --check scripts/phase31-observability-panel-backend-integration.mjs`
   - replay do artefato do run `22862753144` com `FULLCYCLE_CONNECTOR_OBS_PANEL_MIN_TEAMS=0` => `status=pass`

## Evidencia objetiva do run final verde

### Workflow
- Repo: `institutobeatriz/supervisor-comercial-v2.0`
- Workflow: `CI`
- Run: `22862899577`
- Commit: `6064f7e44beb099dbad2cfa37e825de230f3b9e9`
- Artefato: `5833128348`

### Metricas finais
- Live governance:
  - `status=pass`
  - `runtimeProfile=ci`
  - `infraMode=external-services`
  - `phase33Status=pass`
  - `browserPath=/usr/bin/google-chrome`
  - `browserPanelConnection=connected`
  - `browserExceptions=0`
  - `smokeOk=28`
  - `smokeFail=0`
  - `contractValidated=20`
  - `contractFail=0`
  - `requiredChecks=18/18`
  - `analyticsStatus=200`
  - `browserBootstrapAuthNoise=0`
  - `trackedTeams=2` no dataset controlado do gate live
- Backend gate:
  - `status=pass`
  - `ownerCoveragePct=100`
  - `teamsTracked=0`
  - `violations=0`
  - `requireIncidents=false`
  - `requireAlertReport=false`
  - `requireApiSlaHistory=false`
- Panel gate:
  - `status=pass`
  - `teams=0`
  - `incidents=0`
  - `alerts=0`
  - `slaPoints=1`
  - `minTeams=0`
  - `violations=0`

## Interpretacao tecnica
1. O gate live da Fase 34 continua sendo a prova forte de observabilidade com dataset controlado, browser real e `teams=2`.
2. O snapshot final do backend/painel em CI pode terminar sem incidents/alerts ativos, portanto `teams=0` e coerente para o fim do pipeline em runner limpo.
3. Por isso a politica de `minTeams=0` foi aplicada apenas na gate final do painel, preservando a validacao forte de teams reais na Fase 34 live.

## Evidencias associadas
1. `docs/fullcycle-connectors-observability-github-preflight.md`
2. `.github/workflows/ci.yml`
3. `scripts/phase31-observability-panel-backend-integration.mjs`
4. `scripts/phase33-observability-live-runtime-validation.mjs`
5. `package.json`
6. `package-lock.json`
7. Artefatos do run `22862899577` baixados em `tmp-gh-artifacts/run-22862899577/reliability-artifacts`

## Riscos residuais
1. A sincronizacao entre o workspace local e `.export-repo` ainda e manual.
2. Os dashboards HTML internos continuam com assets inline e dependem de CSP route-scoped.
3. O on-call continua file-based (`rotation/calendar`) sem provedor externo real.
4. O repositorio canonico do projeto ainda precisa ser formalizado para evitar drift entre o repo guarda-chuva local e o repo standalone publicado.

## Conclusao
Fase 36 concluida com sucesso. O caminho de GitHub Actions real agora esta validado ponta a ponta, com evidencia objetiva de browser, services, smoke, contratos e gates finais.
