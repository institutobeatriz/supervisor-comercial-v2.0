# 16 - Fase 5 - Validacao de LLM, STT, Vision e RAG

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Confirmar que os pipelines de IA funcionam com comportamento previsivel e fallback seguro:
- LLM (classificacao + fallback entre provedores);
- STT (base64, URL e URL criptografada);
- Vision (positivo/negativo e degradacao segura em PDF invalido);
- RAG (indexacao assincrona + fallback textual).

## Correcoes estruturais aplicadas
1. `packages/llm/src/index.ts`
- adicionado fallback real entre provedores (`kimi`, `deepseek`, `glm5`);
- normalizacao de schema de saida (intent/stage/sentiment/confidence/value);
- controle de retries apenas para falhas retryable (rate-limit/rede), com fail-fast para erros nao retryable.

2. `infra/migrations/019_rag_chunks_unique_conv_text.sql`
- deduplicacao de dados legados em `rag_chunks`;
- criacao de indice unico `idx_rag_chunks_conv_text_unique` para suportar `ON CONFLICT (conversation_id, chunk_text)` do worker.

3. Nova suite automatizada:
- `scripts/phase5-llm-stt-vision-rag-validation.mjs`
- comando `npm run test:phase5` adicionado ao `package.json`.

## Execucao
Comando:
```bash
npm run test:phase5
```

Resultado:
- `12 passed, 0 failed, 0 warnings`

## Matriz validada (suite)
1. LLM sem chave retorna classificacao default segura.
2. LLM normaliza schema de resposta de provider.
3. LLM realiza fallback quando provider primario falha.
4. STT via base64 (mock provider) transcreve com sucesso.
5. STT via URL (mock provider) transcreve com sucesso.
6. STT via URL criptografada (decrypt local + mock provider) transcreve com sucesso.
7. Vision detecta comprovante positivo por texto.
8. Vision rejeita falso positivo por texto.
9. Vision em PDF invalido retorna fail-safe (`method = none`).
10. RAG confirma presenca de chave unica para `ON CONFLICT`.
11. Job `rag-index` conclui sem erro estrutural e gera `rag_chunks`.
12. Busca RAG faz fallback textual quando embedding esta indisponivel.

## Evidencias tecnicas
1. Migration aplicada no banco docker:
- `_migrations` contem `019_rag_chunks_unique_conv_text.sql`.
- indice `idx_rag_chunks_conv_text_unique` presente em `pg_indexes`.
2. Worker sem erro `42P10` de `ON CONFLICT` na janela de validacao apos a migration.
3. Runner executado com fallback automatico para container `supervisor-api` quando DB local nao corresponde ao schema do projeto.

## Observacoes
1. Logs de teste incluem mensagens esperadas de fallback (LLM e RAG) e erro controlado de parse em PDF invalido (Vision), sem impacto no resultado final da suite.
2. Esta fase valida robustez funcional dos pipelines; avaliacao de acuracia de negocio com dataset expandido pode ser aprofundada em iteracao futura de tuning.

## Conclusao
Fase 5 concluida com validacao automatizada e correcoes estruturais aplicadas em LLM e RAG, deixando os pipelines IA mais resilientes e rastreaveis para o fechamento funcional do dashboard.
