# 48 - Fase 37 - Automacao do Repo Standalone e Fluxo Canonico de PR

## Objetivo da fase
Fechar o gap operacional entre este workspace e o repo standalone publicado, eliminando sincronizacao manual e validando o fluxo canonico `sync -> branch -> push -> PR -> GitHub Actions`.

## Decisao arquitetural da fase
Enquanto este projeto continuar dentro do repo guarda-chuva local, o repo standalone publicado `institutobeatriz/supervisor-comercial-v2.0` passa a ser o repositorio canonico de CI remoto.

- Workspace principal: `C:/Users/user/.openclaw/workspace/supervisor-comercial`
- Repo standalone local: `C:/Users/user/.openclaw/workspace/supervisor-comercial/.export-repo`
- Repo remoto: `https://github.com/institutobeatriz/supervisor-comercial-v2.0`
- Fluxo oficial documentado em `docs/standalone-repo-flow.md`

## Entregas implementadas
1. Config declarativa do export standalone:
- `config/standalone-export.json`
2. Sync idempotente workspace -> `.export-repo`:
- `scripts/phase37-standalone-sync.mjs`
3. Publish automatizado com branch `codex/`, push e PR:
- `scripts/phase37-standalone-publish.mjs`
4. Drill local para validar copy/delete/exclude/check:
- `scripts/phase37-standalone-sync-drill.mjs`
5. Scripts oficiais de operacao:
- `package.json` (`test:phase37`, `standalone:sync`, `standalone:sync:check`, `standalone:publish`)
6. Documentacao operacional do fluxo canonico:
- `README.md`
- `PROJECT_RULES.md`
- `docs/runbook-operacional.md`
- `docs/standalone-repo-flow.md`

## Validacao local executada
1. `node --check scripts/phase37-standalone-sync.mjs` => OK
2. `node --check scripts/phase37-standalone-publish.mjs` => OK
3. `node --check scripts/phase37-standalone-sync-drill.mjs` => OK
4. `npm run test:phase37` => OK
5. `npm run standalone:sync` => OK
6. `npm run standalone:sync:check` => OK (`copy=0`, `delete=0`, `unchanged=396`)
7. `npm run lint` => OK
8. `npm run build` => OK

## Validacao remota executada
### PR canonica aberta
- Branch: `codex/phase37-standalone-sync-20260309163524`
- PR: `#1`
- URL: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/pull/1`

### Commits publicados no standalone
1. `0e93a0389095523517ac4e30ac4ab2e69485f771` `chore(ci): automate standalone sync flow`
2. `6c21625ead3ce17d64db1310946c477463e037c9` `chore(ci): automate standalone sync flow`

### GitHub Actions reais
1. Run inicial da PR:
- Run: `22863865053`
- URL: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22863865053`
- Status: `success`
2. Run final apos sincronizar o runbook:
- Run: `22863997083`
- URL: `https://github.com/institutobeatriz/supervisor-comercial-v2.0/actions/runs/22863997083`
- Status: `success`
- Workflow: `CI`
- Head SHA: `6c21625ead3ce17d64db1310946c477463e037c9`

## Evidencia objetiva
1. `logs/monitoring/standalone-export-sync-report.json`
2. `logs/monitoring/standalone-export-sync-audit.jsonl`
3. `logs/monitoring/standalone-export-publish-report.json`
4. `logs/monitoring/standalone-export-publish-audit.jsonl`
5. `gh run view 22863997083 --repo institutobeatriz/supervisor-comercial-v2.0`
6. `git -C .export-repo log --oneline -3`

## Resultado tecnico
1. O repo standalone agora pode ser regenerado por comando, sem copia manual ad hoc.
2. O drift entre workspace e `.export-repo` ficou verificavel com `standalone:sync:check`.
3. O fluxo de PR remoto foi provado com branch `codex/`, PR aberta e CI real verde.
4. A regra de continuidade entre Codex e Claude passa a poder confiar em arquivos versionados e no repo canonico de CI, sem depender de memorizacao manual.

## Riscos residuais
1. O repo canonico de CI remoto continua separado do git root principal deste workspace; a extracao para um repo proprio ainda e opcional no futuro.
2. Os dashboards HTML internos continuam com assets inline e CSP route-scoped permissivo.
3. A origem de on-call segue file-based (`rotation/calendar`) e nao um provedor operacional externo.

## Proxima fase liberada
Fase 38 - externalizar assets inline dos dashboards internos, endurecer CSP e reduzir a superficie de excecao das rotas HTML de observabilidade.
