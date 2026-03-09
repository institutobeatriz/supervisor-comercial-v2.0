# 18 - Fase 7 - DevOps, CI e Observabilidade

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Fechar a operacao com padrao de producao em:
- observabilidade e health checks consistentes;
- pipeline minima de CI (lint, typecheck, build e smoke);
- runbook operacional formal;
- eliminacao de ambiguidade de execucao.

## Correcoes aplicadas
1. Padronizacao de logs/auditoria
- `packages/audit/src/logger.ts`
  - criado `resolveAuditLogDir()` com prioridade para `AUDIT_LOG_DIR` e fallback `./logs`.
- `apps/api/src/routes/metrics.ts`
  - removido caminho absoluto de logs;
  - leitura de auditoria passou a usar `resolveAuditLogDir()`.

2. Health e readiness de runtime
- `apps/api/src/routes/health.ts`
  - mantido `/health`;
  - adicionado `/ready` com verificacao de banco.
- `apps/worker/src/index.ts`
  - adicionados endpoints `/health` e `/ready` (porta `WORKER_HEALTH_PORT`, default `3002`);
  - fechamento gracioso com encerramento de workers, filas, pool de DB e health server.

3. Docker/compose e observabilidade operacional
- `docker-compose.yml`
  - API e worker com `AUDIT_LOG_DIR=/app/logs` + volume `./logs:/app/logs`;
  - worker com `WORKER_HEALTH_PORT=3002`;
  - healthchecks ajustados para `127.0.0.1` (evita falha por resolucao IPv6 de `localhost`).
- `infra/docker/Dockerfile.api`
  - healthcheck ajustado para `http://127.0.0.1:3000/health`.
- `infra/docker/Dockerfile.worker`
  - healthcheck ajustado para `http://127.0.0.1:3002/health`.

4. Qualidade de codigo e type safety
- Instalados dev deps:
  - `@typescript-eslint/parser`
  - `@typescript-eslint/eslint-plugin`
  - `eslint-plugin-react-hooks`
- `.eslintrc.cjs`
  - override TS passou a carregar plugin `react-hooks`.
- `tsconfig.json`
  - `baseUrl` e paths para `@supervisor/*` mapeando para `packages/*/src`, eliminando dependencia de `dist` para typecheck.

5. Build deterministico por workspace
- `package.json`
  - workspaces reordenados para `packages/*` antes de `apps/*`;
  - criado `build:packages`;
  - criado `build:apps`;
  - `build` oficial agora executa `build:packages && build:apps`.

6. CI e smoke automatizado
- `.github/workflows/ci.yml`
  - pipeline com `npm ci`, `lint`, `typecheck`, `build` e smoke de API;
  - servicos `postgres` e `redis` com healthcheck;
  - API sobe em background e valida `/health` antes do smoke.
- `scripts/ci-api-smoke.mjs`
  - suite de smoke dos endpoints criticos.
- `package.json`
  - script `test:ci:api-smoke`.

7. Operacao e runbook
- `docs/runbook-operacional.md` criado com:
  - start/stop oficial;
  - health/readiness;
  - troubleshooting de webhook/filas/LLM;
  - rollback operacional.
- Scripts legados de worker foram desativados para evitar operacao ambigua.

## Validacao tecnica executada
1. Lint
```bash
npm run lint
```
Resultado:
- sucesso (`0` erros apos ajuste de plugins).

2. Typecheck
```bash
npm run typecheck
```
Resultado:
- sucesso (`tsc --noEmit` sem erros).

3. Build
```bash
npm run build
```
Resultado:
- sucesso em todos os workspaces;
- dashboard com warning de chunks > 500kb (nao bloqueante).

4. Rebuild de runtime Docker
```bash
docker compose up -d --build api worker
```
Resultado:
- servicos recriados com novas configuracoes de healthcheck e observabilidade.

5. Health/readiness runtime
Comandos:
```bash
docker compose ps
curl http://localhost:3000/health
curl http://localhost:3000/ready
docker compose exec -T worker node -e "fetch('http://127.0.0.1:3002/health').then(r=>r.text()).then(console.log)"
docker compose exec -T worker node -e "fetch('http://127.0.0.1:3002/ready').then(r=>r.text()).then(console.log)"
```
Resultado:
- `supervisor-api`: `healthy`;
- `supervisor-worker`: `healthy`;
- API `/health` e `/ready`: HTTP 200;
- worker `/health` e `/ready`: resposta `ready`.

6. Smoke CI local
```bash
npm run test:ci:api-smoke
```
Resultado:
- checks aprovados:
  - `/health`, `/ready`
  - `/api/dashboard/kpis`
  - `/api/dashboard/funnel`
  - `/api/dashboard/pipeline-weighted`
  - `/api/dashboard/products/comparison`
  - `/api/dashboard/loss-stats`
  - `/api/conversations`
  - `/api/alerts`
  - `/api/metrics/usage`

## Evidencias de aceite da fase
1. API e worker com healthcheck `healthy` em Docker Compose.
2. Endpoint `/ready` ativo na API e no worker.
3. Logs de auditoria sem hardcode de path absoluto.
4. Pipeline CI minima definida em `.github/workflows/ci.yml`.
5. Runbook operacional publicado em `docs/runbook-operacional.md`.
6. `lint`, `typecheck`, `build` e `test:ci:api-smoke` executados com sucesso.

## Riscos residuais
1. Bundle do dashboard ainda acima de 500kb em alguns chunks (warning Vite).
2. `npm install` em build de imagem reporta vulnerabilidades de dependencias transientes (nao tratadas nesta fase).
3. Worker health nao e publicado no host por padrao (monitoramento externo deve usar rede Docker/inspecao de health state).

## Conclusao
Fase 7 concluida com estabilizacao operacional:
- qualidade automatizada (lint/typecheck/build/smoke);
- health/readiness funcional em API e worker;
- observabilidade e runbook formalizados;
- base pronta para ciclo continuo de correcao e evolucao com menor risco operacional.
