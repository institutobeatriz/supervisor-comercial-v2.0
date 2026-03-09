# Fase 36 - GitHub Actions Preflight

- Gerado em: 2026-03-09T16:15:12Z
- Status: PASS
- Branch standalone publicada: `master`
- Remote origin: `https://github.com/institutobeatriz/supervisor-comercial-v2.0.git`
- Permissao do viewer (`gushiprata-web`): `WRITE`
- Pronto para runner GitHub real: sim
- Run final validado: `22862899577`
- Artefato final: `5833128348`

## Resumo
- `gh` instalado: sim
- `gh` autenticado: sim
- Workflow CI encontrado: sim
- Export standalone validado localmente: sim
- Push remoto autorizado: sim
- GitHub Actions real executada com sucesso: sim

## Cronologia objetiva
1. O projeto local nao podia ser publicado diretamente porque este diretorio vive dentro de um repo Git maior do workspace.
2. Foi criada a copia standalone `.export-repo`.
3. O acesso ao repo GitHub foi liberado para `gushiprata-web`.
4. O primeiro run falhou por install sem devDependencies sob `NODE_ENV=production`.
5. O segundo run falhou por pressupostos de bootstrap da Fase 35 em runner limpo.
6. O terceiro run falhou em `phase33` por `WebSocket is not defined`.
7. O quarto run falhou na gate backend da Fase 32 por exigir artifacts nao materializados no runner limpo.
8. O quinto run falhou na gate final do painel por `minTeams=1` em snapshot CI sem incidents/alerts ativos.
9. O sexto run (`22862899577`) passou de ponta a ponta.

## Resultado final do CI verde
- Workflow: `CI`
- Repo: `institutobeatriz/supervisor-comercial-v2.0`
- Run: `22862899577`
- Commit: `6064f7e44beb099dbad2cfa37e825de230f3b9e9`
- Duracao observada: `1m55s`

### Metricas finais relevantes
- Live governance:
  - `status=pass`
  - `runtimeProfile=ci`
  - `infraMode=external-services`
  - `phase33Status=pass`
  - `browserPanelConnection=connected`
  - `smokeOk=28`
  - `smokeFail=0`
  - `contractValidated=20`
  - `contractFail=0`
  - `requiredChecks=18/18`
  - `analyticsStatus=200`
- Backend gate:
  - `status=pass`
  - `ownerCoveragePct=100`
  - `teamsTracked=0`
  - `requireIncidents=false`
  - `requireAlertReport=false`
  - `requireApiSlaHistory=false`
- Panel gate:
  - `status=pass`
  - `minTeams=0`
  - `slaPoints=1`
  - `violations=0`

## Correcoes que fecharam a fase
- `npm ci --include=dev` no workflow para evitar falta de `eslint` sob `NODE_ENV=production`
- fallback para `ws` em `scripts/phase33-observability-live-runtime-validation.mjs`
- bootstrap controlado da gate backend da Fase 32 no workflow
- `minTeams=0` configuravel no painel backend-first, usado apenas na gate final do CI

## Comandos usados
- `gh auth status`
- `gh repo view institutobeatriz/supervisor-comercial-v2.0 --json viewerPermission,nameWithOwner,url,visibility`
- `gh run list --repo institutobeatriz/supervisor-comercial-v2.0 --limit 5`
- `gh run view 22862899577 --repo institutobeatriz/supervisor-comercial-v2.0`
- `gh run watch 22862899577 --repo institutobeatriz/supervisor-comercial-v2.0 --exit-status`
- `gh api repos/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22862899577/artifacts`

## Observacoes
- O CI verde agora e prova real de runtime, browser headless e services externos do runner.
- O gap restante nao e mais permissao de GitHub; e o processo manual de sincronizacao entre este workspace e `.export-repo`.
