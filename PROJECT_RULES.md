# PROJECT RULES

## Objetivo deste arquivo
Este arquivo existe para permitir alternancia segura entre Codex, Claude Code, OpenClaw e humano sem perda de contexto e sem recomeçar o projeto do zero.

## Ordem obrigatoria de leitura
Antes de qualquer alteracao, ler nesta ordem:
1. `AGENTS.md`
2. `CLAUDE.md` quando a ferramenta suportar instrucoes desse arquivo
3. `PROJECT_RULES.md`
4. `HANDOFF.md`
5. `TODO_AI.md`
6. `docs/analise-projeto/10-memoria-execucao-fases.md`
7. evidencia mais recente da fase atual em `docs/analise-projeto/`
8. `README.md`, `docs/runbook-operacional.md` e `docs/monitoramento-externo.md` quando a tarefa tocar operacao/infra/CI

## Fontes de verdade do projeto
- Politica global e padrao premium: `AGENTS.md`
- Memoria historica das fases: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Evidencia tecnica por fase: `docs/analise-projeto/11-...` ate a fase mais recente
- Plano executivo principal: `docs/analise-projeto/09-plano-conclusao-dashboard-comercial.md`
- Estado atual para passagem de bastao: `HANDOFF.md`
- Fila objetiva do que vem a seguir: `TODO_AI.md`

## Stack real do projeto
- API: Fastify + TypeScript
- Worker: BullMQ + Redis
- Dashboard web: React + Vite
- Banco: PostgreSQL + pgvector
- IA: GLM-5, Kimi, DeepSeek, Opus/GPT, Groq STT, Vision, RAG
- Infra: Docker Compose + CI GitHub Actions
- Runtime: Node.js 20+, npm workspaces, ESModules

## Regras obrigatorias
1. Preservar a arquitetura atual e a trilha de fases ja concluida.
2. Nao criar documentacao paralela que contradiga `docs/analise-projeto`.
3. Nao refatorar amplamente sem necessidade objetiva da fase atual.
4. Reaproveitar arquivos existentes antes de criar novos.
5. Nao renomear arquivos, rotas, endpoints ou variaveis de ambiente sem justificativa.
6. Nao quebrar compatibilidade da API interna de observabilidade sem atualizar CI, smoke, docs e memoria.
7. Nao remover validacoes, RBAC, auth, gates ou trilhas de auditoria sem revisar impacto.
8. Nao reverter mudancas de terceiros nem limpar worktree sujo sem pedido explicito.
9. Ao assumir uma fase, validar primeiro o estado atual com evidencia e testes existentes.
10. Ao concluir, atualizar `HANDOFF.md` e `TODO_AI.md`.

## Padrrao de execucao
1. Entender a fase atual e o proximo passo liberado na memoria.
2. Ler os arquivos citados no `HANDOFF.md`.
3. Executar apenas o proximo passo necessario.
4. Validar com teste/drill/build/smoke compatível com a mudanca.
5. Registrar o resultado no handoff.

## Regra especial para este repositório
Este projeto ja possui historico extenso de fases. O `HANDOFF.md` deve resumir o agora; a memoria em `docs/analise-projeto/10-memoria-execucao-fases.md` e o historico oficial.

## Troca entre IAs
Antes de trocar de ferramenta:
1. atualizar `HANDOFF.md`;
2. atualizar `TODO_AI.md`;
3. listar arquivos alterados;
4. registrar testes executados e riscos residuais;
5. se estiver usando Git de forma operacional, preferir commit WIP claro:
- `handoff(phase32): route matrix mapping started`
- `handoff(observability): panel live smoke pending`

## Fechamento automatico por fase
Ao concluir cada fase, o agente deve fazer automaticamente:
1. atualizar `HANDOFF.md` com estado atual, arquivos alterados, testes, riscos e proximo passo;
2. atualizar `TODO_AI.md` refletindo a fila apos a fase concluida;
3. atualizar a memoria oficial em `docs/analise-projeto/10-memoria-execucao-fases.md` e a evidencia da fase;
4. criar commit WIP focado apenas nos arquivos da fase concluida.

### Regra do commit WIP
1. nunca incluir mudancas alheias nao relacionadas;
2. preferir staging seletivo por arquivo;
3. mensagem padrao:
- `handoff(phaseNN): resumo curto`
- exemplo: `handoff(phase31): backend-first panel completed`

## Antes de finalizar qualquer tarefa
1. verificar se o app/build/script relevante continua iniciando;
2. rodar os testes/drills diretamente afetados;
3. listar pendencias, riscos e proximos passos;
4. deixar o proximo passo exato no `HANDOFF.md`.

## Nao fazer
1. Nao inventar comportamento nao sustentado por codigo ou docs.
2. Nao duplicar plano em varios arquivos concorrentes.
3. Nao trocar layout ou contratos sem necessidade da fase.
4. Nao apagar evidencias de fases anteriores.
5. Nao sair executando a proxima fase sem registrar o estado da fase atual.
