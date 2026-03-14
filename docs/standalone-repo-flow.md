# Fluxo Canonico do Repo Standalone

## Objetivo
Este projeto ainda vive dentro de um repo guarda-chuva local. Por isso, o fluxo canonico de CI remoto passa pelo repo standalone publicado em `.export-repo` e no GitHub `institutobeatriz/supervisor-comercial-v2.0`.

## Regra operacional
- Fonte de trabalho local: `C:/Users/user/.openclaw/workspace/supervisor-comercial`
- Repo canonico de CI/PR: `C:/Users/user/.openclaw/workspace/supervisor-comercial/.export-repo`
- Repo remoto de CI: `https://github.com/institutobeatriz/supervisor-comercial-v2.0`
- Enquanto este projeto nao for extraido para um git root proprio, o standalone publicado continua sendo a referencia oficial para `branch -> PR -> GitHub Actions`.

## Artefatos da Fase 37
- Config declarativa: `config/standalone-export.json`
- Sync idempotente: `scripts/phase37-standalone-sync.mjs`
- Publish branch/PR: `scripts/phase37-standalone-publish.mjs`
- Drill local: `scripts/phase37-standalone-sync-drill.mjs`

## Comandos oficiais
```bash
npm run standalone:sync
npm run standalone:sync:check
npm run test:phase37
npm run standalone:publish
```

## Sequencia recomendada
1. Trabalhar normalmente neste workspace.
2. Rodar `npm run test:phase37` para validar a automacao de sync.
3. Rodar `npm run standalone:sync` para alinhar `.export-repo` ao estado atual.
4. Rodar `npm run standalone:sync:check` para confirmar drift zero.
5. Rodar `npm run standalone:publish` para criar branch `codex/...`, subir para o remoto e abrir PR.
6. Se necessario, usar `node scripts/phase37-standalone-publish.mjs --watch-ci` para aguardar o resultado da GitHub Actions.

## Guardrails
- Nao editar `.export-repo` manualmente como fluxo normal. O esperado e regenerar via sync.
- Nao incluir `.env`, `logs`, `node_modules`, `tmp`, `temp` e dumps locais no repo standalone.
- Nao usar branch sem prefixo `codex/` quando a automacao abrir publicacoes a partir do Codex.
- Ao fechar fase, registrar no handoff qual branch/PR foi aberta e qual run do GitHub validou a entrega.

## Decisao atual
- Decisao efetiva da Fase 37: o repo standalone publicado e o repositorio canonico de CI remoto por enquanto.
- Extrair este projeto para um git root proprio continua possivel no futuro, mas deixa de ser pre-requisito para evolucao segura do dashboard comercial e da trilha enterprise.
