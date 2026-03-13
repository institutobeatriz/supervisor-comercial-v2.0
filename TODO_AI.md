# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 57
- Proxima fase liberada: Fase 58 (a definir)
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: git root extraction decision formalizada (Fase 57); próximo candidato: padronizar docs legados da raiz

## Prioridade alta
- [ ] Fase 58: a definir — avaliar proxima necessidade conforme plano de conclusao

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`)

## Fases concluidas (historico)
- [x] Fase 57: drill de decisão de extração git root — conclusão: não necessário; 4 drills passando; decisão arquivada em JSON
- [x] Fase 56: standalone sync drill no CI — test:phase37 e test:phase56 adicionados; último gap CI fechado
- [x] Fase 55: fechamento do gap CI phase14-30 — meta-drill phase55 (17 drills)
- [x] Fase 54: fechamento do gap CI — test:phase38-42 adicionados; regressão phase42 corrigida
- [x] Fase 53: drill formaliza política minTeams
- [x] Fase 52: remover dead config cfg.providerMode de loadOperationalProvider()
- [x] Fase 51: decidir quando `backend/producer` vira obrigatorio sem fallback
- [x] Fase 50: card Cobertura Operacional em Executivo.tsx
- [x] Fase 49: remover dead branches legacy fallback
- [x] Fase 48: implementar modo `service` no coletor
- [x] Fase 47: adicionar modo `api` ao coletor
- [x] Fase 46: fazer USE_COLLECTOR=true o default no producer
- [x] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico
- [x] Fase 44: implementar o coletor/stub concreto
- [x] Fase 43: transformar `phase43-disable-legacy-fallback` em enforcement real

## Bugs / riscos abertos
- Testes phase3-5 (Docker) e phase10-13 (dados reais) NÃO estão no validateCommands
- PRs aguardam review/merge pelo mantenedor do repo canonical

## Dividas tecnicas
- Decisão sobre extração git root: FORMALIZADA na Fase 57 — não necessário neste estágio

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
