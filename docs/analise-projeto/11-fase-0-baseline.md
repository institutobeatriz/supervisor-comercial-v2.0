# 11 - Fase 0 Baseline Tecnico (Concluida)

## Data da coleta final
- 2026-03-08 (America/Sao_Paulo)

## Objetivo
Fechar baseline reproduzivel para iniciar as correcoes P0:
1. stack operacional padrao;
2. health API;
3. migrations aplicadas;
4. validacao inicial de endpoints e webhook;
5. snapshot de dados e filas.

## 1) Contrato de ambiente consolidado

### Ajustes aplicados no repositorio
1. Contrato canonico da Evolution:
- variavel principal: `EVOLUTION_URL`;
- alias legado aceito: `EVOLUTION_API_URL`.
2. Pontos alterados:
- `apps/api/src/routes/webhook.ts`;
- `apps/worker/src/index.ts`;
- `scripts/sync-correct.mjs`;
- `scripts/sync-messages.mjs`;
- `scripts/test-download.mjs`;
- `.env.example`;
- `README.md`.

### Observacao operacional
No host existia conflito de conectividade (`localhost`) entre bancos/servicos locais e containers.  
Baseline oficial foi fechado em **modo all-in-docker**.

## 2) Bloqueio encontrado e corrigido durante a Fase 0

### Problema
`docker compose --profile all-in-docker up -d --build` falhava no build do worker:
- modulo `@supervisor/vision` nao encontrado no build docker.

### Causa
`infra/docker/Dockerfile.worker` nao copiava/compilava `packages/vision`.

### Correcao aplicada
1. `infra/docker/Dockerfile.worker`:
- adicionada copia de `packages/vision/package*.json`;
- adicionada compilacao `packages/vision/tsconfig.json`.
2. `infra/docker/Dockerfile.api`:
- mesmo ajuste para consistencia de dependencias e build.

Resultado: imagens `api` e `worker` passaram a buildar com sucesso.

## 3) Stack baseline em execucao

Comando utilizado:

```bash
docker compose --profile all-in-docker up -d --build
```

Estado:
- `supervisor-postgres`: up (healthy)
- `supervisor-redis`: up (healthy)
- `supervisor-api`: up
- `supervisor-worker`: up

Health API:

```txt
GET http://localhost:3000/health
status=200
{"status":"healthy","database":"connected",...}
```

## 4) Banco baseline (container)

Verificacao:
1. Postgres version: `16.12`
2. Extensao `vector`: instalada (`0.8.1`)
3. Migrations aplicadas: `15`

Snapshot de contagens:

```txt
raw_events            2
contacts              815
conversations         882
messages              15940
message_labels        962
conversation_insights 2
sales_outcomes        15
human_reviews         1
audit_log             0
rag_chunks            0
```

## 5) Validacao inicial de API

Endpoints testados:
1. `GET /health` -> `200`
2. `GET /api/dashboard/kpis` -> `200`
3. `GET /api/conversations?limit=5` -> `200`
4. `GET /api/alerts` -> `200`

## 6) Validacao inicial de webhook

Cenarios executados:
1. `scripts/test-webhook.mjs`
2. `scripts/test-webhook-2.mjs`

Resultado:
1. Ambos retornaram `200 {"status":"queued"...}`.
2. Evidencia de persistencia:
- `raw_events` recebeu 2 eventos (`test-beatriz-001` e `test-beatriz-002`).
3. Evidencia de processamento:
- mensagens inseridas;
- `message_labels` gerados para os `message_id` criados;
- `conversation_insights` atualizado para os casos de teste.

## 7) Filas baseline

Leitura direta no Redis do container (via worker):

```txt
classify: waiting=0 active=0 completed=2 failed=0
stt:      waiting=0 active=0 completed=0 failed=0
```

## 8) Riscos/observacoes residuais abertos (nao bloqueiam Fase 0)
1. Warning recorrente no worker/API:
- `Eviction policy is allkeys-lru. It should be "noeviction"`.
2. Aviso do Compose:
- campo `version` obsoleto em `docker-compose.yml`.
3. Dados antigos preexistentes no banco/redis baseline (ambiente nao zerado).

## 9) Criterio de aceite da Fase 0
Status: **ATENDIDO**.

Checklist:
1. Contrato de ambiente unificado: OK.
2. Comando e stack padrao reproduzivel: OK (all-in-docker).
3. Health API e migrations: OK.
4. Baseline de dados/filas/endpoints: OK.
5. Evidencia documentada: OK.
