# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 48
- Proxima fase liberada: Fase 49 (a definir)
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: OPERATIONAL_COLLECTOR_INTERFACE.integrationModes completamente implementado (file/api/service); CI verde run 22983410484; proximo passo e avaliar fase 49

## Prioridade alta
- [ ] Fase 49: avaliar proxima necessidade conforme plano de conclusao
- [ ] Fase 49: decidir quando `backend/producer` vira obrigatorio sem fallback em todos os ambientes
- [x] Fase 48: implementar modo `service` (lazy poll, cache TTL 300s, NaN-safe)
- [x] Fase 48: drill phase48 (cache_hit/cache_miss/stale_refresh/env_selection) passando
- [x] Fase 48: test:phase48 no package.json e standalone-export.json
- [x] Fase 48: CI remoto verde run 22983410484
- [x] Fase 47: adicionar modo `api` ao coletor (buildApiSources, mapApiSourcesToCollectorFormat)
- [x] Fase 46: fazer USE_COLLECTOR=true o default no producer
- [x] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico (PR + GitHub Actions)
- [x] Fase 44: implementar o coletor/stub concreto respeitando a `OPERATIONAL_COLLECTOR_INTERFACE`
- [x] Fase 43: transformar `phase43-disable-legacy-fallback` em enforcement real

## Prioridade media
- [ ] Definir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`)
- [ ] Revisar politica `minTeams=0` da gate final do painel

## Bugs / riscos abertos
- O producer usa o coletor por default (`USE_COLLECTOR=true`) mas em CI usa mode=file sem arquivos reais
- O fallback `legacy_files` persiste com enforcement ativo bloqueando ativacao inadvertida
- O chain completo (phase30+) so e validado no workspace principal
- PR #10 aguarda review/merge pelo mantenedor do repo canonical
- `buildServiceSources` sem guard contra stampede concorrente (harmless para use case atual)

## Dividas tecnicas
- Decidir quando `backend/producer` vira obrigatorio sem fallback
- `backend/analytics` na UI executiva
- Avaliar extração futura do git root principal

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
