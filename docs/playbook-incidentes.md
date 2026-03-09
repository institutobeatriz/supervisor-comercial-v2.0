# Playbook de Incidentes

## Objetivo
Padronizar resposta operacional com foco em:
1. redução de MTTD/MTTR;
2. mitigação rápida;
3. comunicação clara;
4. aprendizado pós-incidente.

## Classificação de severidade
1. `P1` (crítico):
- API indisponível para usuários;
- webhook parado com perda de eventos;
- worker inoperante com fila crescendo sem processamento.
2. `P2` (alto):
- degradação parcial com impacto em módulos críticos;
- erro recorrente em integrações LLM/STT/vision sem perda total de serviço.
3. `P3` (médio/baixo):
- falha isolada ou intermitente sem impacto amplo;
- alertas de tendência com serviço operacional.

## SLO de resposta
1. `P1`: reconhecimento em até 10 min; mitigação inicial em até 30 min.
2. `P2`: reconhecimento em até 30 min; mitigação inicial em até 2 h.
3. `P3`: reconhecimento no próximo ciclo operacional.

## Fluxo de resposta
1. Detectar:
- `npm run monitor:check` / alertas recebidos.
2. Confirmar:
- checar `logs/monitoring/last-report.json` e `incidents.json`.
3. Classificar:
- definir severidade (`P1/P2/P3`) e owner.
4. Mitigar:
- executar ações de contenção (restart, rollback, failover, desativação de feature).
5. Validar:
- rodar smoke/health (`/health`, `/ready`, `test:ci:api-smoke`).
6. Encerrar:
- incidente só fecha com estabilidade confirmada.
7. Pós-mortem:
- causa raiz, ação corretiva e prevenção.

## Checklist técnico rápido
1. API:
- `curl http://localhost:3000/health`
- `curl http://localhost:3000/ready`
2. Worker:
- `docker compose ps`
- `docker compose logs -f worker`
3. Filas:
- validar backlog e erros de processamento.
4. Banco/Redis:
- status `healthy` no compose.
5. Integrações:
- chaves e timeouts em `.env`.

## Comunicação mínima
1. `T0`: incidente detectado (serviço afetado, severidade, owner).
2. `T+15/T+30`: atualização de progresso e mitigação.
3. encerramento: causa, impacto, janela, ações.

## Pós-mortem (template curto)
1. Resumo e impacto.
2. Timeline (detecção, mitigação, resolução).
3. Causa raiz.
4. O que funcionou / não funcionou.
5. Ações corretivas com responsável e prazo.
