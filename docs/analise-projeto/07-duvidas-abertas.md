# 07 - Duvidas Abertas

## Metodo
Cada item abaixo foi marcado com:
- `EVIDENCIA` quando ha base direta no codigo lido;
- `HIPOTESE` quando a conclusao depende de informacao externa (ambiente/producao/historico).

---

## 1) Itens com HIPOTESE

### QH-01 - O endpoint `/api/conversations/:id` funciona em producao?
- Tipo: `HIPOTESE`
- Motivo da incerteza: no repositorio, SQL usa colunas ausentes em `messages`, mas banco de producao pode ter drift/manual patch.
- Evidencia local: `apps/api/src/routes/conversations.ts` x `infra/migrations/001_init.sql`.
- O que validar depois: `\d messages` no banco real e teste de chamada real do endpoint.

### QH-02 - O fluxo de revisao humana esta ativo sem erro no ambiente real?
- Tipo: `HIPOTESE`
- Motivo da incerteza: SQL de update usa `reviewer/notes`, schema versionado define `reviewed_by/review_notes`.
- Evidencia local: `packages/db/src/queries.ts` x `infra/migrations/002_human_reviews.sql`.
- O que validar depois: aprovar/rejeitar revisao em ambiente integrado e observar erro SQL.

### QH-03 - A branch PDF local do worker e usada em runtime?
- Tipo: `HIPOTESE`
- Motivo da incerteza: branch exige `job.data.base64`, mas webhook de vision nao envia `base64`.
- Evidencia local: `apps/worker/src/index.ts` e `apps/api/src/routes/webhook.ts`.
- O que validar depois: inspecionar payload real da fila `vision` e logs de execucao.

### QH-04 - O middleware `withGovernance` esta aplicado por algum caminho nao lido (ou externo)?
- Tipo: `HIPOTESE`
- Motivo da incerteza: nao foi encontrado uso direto em `apps/**` e `packages/**`, mas pode haver branch/entrypoint alternativo fora do recorte.
- Evidencia local: busca textual sem ocorrencias de chamada.
- O que validar depois: tracing em runtime dos workers e testes de limite estourado.

### QH-05 - Scripts legados (`run-worker*.cmd/ps1`, `worker-entry.mjs`) ainda sao usados por operacao real?
- Tipo: `HIPOTESE`
- Motivo da incerteza: coexistencia de scripts antigos e novos sem runbook oficial versionado.
- Evidencia local: arquivos com targets distintos (`dist/worker.mjs` vs `dist/index.js`).
- O que validar depois: confirmar com operador qual comando oficial de start.

### QH-06 - Existe tabela `alert_history` no banco de producao por migration manual?
- Tipo: `HIPOTESE`
- Motivo da incerteza: rota depende dela, mas nao ha migration correspondente no repositorio.
- Evidencia local: `apps/api/src/routes/alerts.ts`.
- O que validar depois: schema introspection em producao e historico de DDL fora do Git.

### QH-07 - A divergencia de dimensao de embeddings (1024 vs 1536) impacta ambiente atual?
- Tipo: `HIPOTESE`
- Motivo da incerteza: depende da ordem historica de aplicacao de migrations e estado do banco.
- Evidencia local: `001_init.sql` e `015_rag_chunks.sql`.
- O que validar depois: introspecao de coluna `rag_chunks.embedding` no banco ativo.

### QH-08 - Caminho de log de auditoria esta consistente em todos os modos de execucao?
- Tipo: `HIPOTESE`
- Motivo da incerteza: `metrics.ts` usa caminho absoluto e `audit/logger.ts` usa composicao relativa por CWD.
- Evidencia local: `apps/api/src/routes/metrics.ts`, `packages/audit/src/logger.ts`.
- O que validar depois: rodar API/worker em Docker, PM2 e local comparando diretorios de logs.

---

## 2) Itens com EVIDENCIA (sem incerteza principal)

### QE-01 - Existem segredos hardcoded no repositorio
- Tipo: `EVIDENCIA`
- Arquivos: `packages/llm/src/index.ts`, `apps/api/src/routes/reviews.ts`, `apps/dashboard/src/pages/Reviews.tsx`, scripts de sync/test.

### QE-02 - Formula de conversao diverge entre API e DB
- Tipo: `EVIDENCIA`
- Arquivos: `apps/api/src/routes/dashboard.ts` vs `packages/db/src/queries.ts`.

### QE-03 - `report` worker esta placeholder
- Tipo: `EVIDENCIA`
- Arquivo: `apps/worker/src/index.ts` (`TODO: Gerar relatório`).

### QE-04 - `.claude/settings.json` esta invalido
- Tipo: `EVIDENCIA`
- Arquivo contem JSON valido encerrado e bloco markdown extra em seguida.

---

## 3) Validacoes recomendadas para fechar as hipoteses

1. Rodar checklist de schema real
- `\d messages`, `\d human_reviews`, `\d rag_chunks`, existencia de `alert_history`.

2. Exercitar fluxos E2E
- webhook duplicado, review approve/reject, detalhe de conversa, PDF/documento em vision.

3. Validar observabilidade
- destino real de JSONL em cada modo de execucao.

4. Confirmar runbook oficial
- comando unico de start para API/worker e desativacao de scripts legados.
