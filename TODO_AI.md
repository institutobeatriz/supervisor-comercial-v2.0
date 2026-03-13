# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 52
- Proxima fase liberada: Fase 53 (a definir)
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: dead config cfg.providerMode removido de loadOperationalProvider(); 4 drills passando; build TS OK; proximo passo e avaliar fase 53

## Prioridade alta
- [ ] Fase 53: a definir — avaliar proxima necessidade conforme plano de conclusao

## Prioridade media
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`)
- [ ] Revisar politica `minTeams=0` da gate final do painel

## Fases concluidas (historico)
- [x] Fase 52: remover dead config cfg.providerMode de loadOperationalProvider()
- [x] Fase 51: avaliar proxima necessidade conforme plano de conclusao
- [x] Fase 51: decidir quando `backend/producer` vira obrigatorio sem fallback em todos os ambientes
- [x] Fase 50: card Cobertura Operacional em Executivo.tsx consumindo backend/analytics
- [x] Fase 50: degradação graciosa em 503/null
- [x] Fase 50: drill phase50 (4 drills de contrato) passando
- [x] Fase 50: test:phase50 no package.json e standalone-export.json
- [x] Fase 50: CI remoto verde run 23017071993
- [x] Fase 49: remover dead branches legacy fallback
- [x] Fase 49: hardcodar legacyFallbackState:'disabled'
- [x] Fase 48: implementar modo `service` no coletor
- [x] Fase 47: adicionar modo `api` ao coletor
- [x] Fase 46: fazer USE_COLLECTOR=true o default no producer
- [x] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico
- [x] Fase 44: implementar o coletor/stub concreto
- [x] Fase 43: transformar `phase43-disable-legacy-fallback` em enforcement real

## Bugs / riscos abertos
- O chain completo (phase30+) so e validado no workspace principal
- PR #11 aguarda review/merge pelo mantenedor do repo canonical

## Dividas tecnicas
- Avaliar extração futura do git root principal

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
