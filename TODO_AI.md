# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 44
- Proxima fase liberada: Fase 45
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: coletor dedicado implementado (stub, modos `file`/`synthetic`), `collectorSources` no provider, producer integra coletor opcionalmente; proximo passo e propagar Fases 43/44 para o repo standalone canonico

## Prioridade alta
- [ ] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico (PR + GitHub Actions)
- [ ] Fase 45: validar CI remoto verde apos propagacao
- [ ] Fase 45: decidir quando `USE_COLLECTOR=true` deve virar o default no producer
- [x] Fase 44: implementar o coletor/stub concreto respeitando a `OPERATIONAL_COLLECTOR_INTERFACE`
- [x] Fase 44: adicionar `collectorSources` ao provider para bypass do file-reading
- [x] Fase 44: validar que contratos das Fases 41/42/43 continuam validos apos integracao do coletor
- [x] Fase 43: transformar `phase43-disable-legacy-fallback` em enforcement real em todos os caminhos observability
- [x] Fase 43: impedir reintroducao de `legacy_files` em smoke/live/compat/API
- [x] Fase 43: definir a interface do coletor/servico dedicado que substituira a alimentacao file-based do producer
- [x] Fase 42: conectar o provider operacional canônico a um produtor/coletor dedicado
- [x] Fase 42: definir criterios objetivos de desativacao do fallback `legacy_files`
- [x] Fase 42: validar a troca do produtor preservando `backend/provider`, `backend/summary`, `backend/analytics`, painel, smoke e live
- [x] Fase 41: decidir o caminho canonico da ingestao operacional
- [x] Fase 41: formalizar o contrato versionado `fullcycle.observability.operational-provider.v1`
- [x] Fase 41: integrar backend/API/painel/live/smoke ao provider operacional canônico
- [x] Fase 41: validar `materialize/replay/fail`, governanca live e CI remoto
- [x] Fase 40: medir frescor e saude da fonte operacional (`incident automation`, `itsm snapshot`, `fullcycle report`)
- [x] Fase 40: expor esse estado em `backend/report`, `backend/analytics` e painel para diferenciar `sem workload ativo` de `fonte operacional indisponivel`
- [x] Fase 40: validar cenarios `healthy/stale/missing` na trilha live, compat e CI remoto

## Prioridade media
- [ ] Propagar Fases 43 e 44 para o repo standalone canonico (PR + GitHub Actions)
- [ ] Decidir quando `backend/provider` e `backend/producer` devem virar dependencias obrigatorias sem fallback em todos os ambientes
- [ ] Definir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- o coletor é um stub: integração com serviço externo real fica para iteração futura
- o producer usa o coletor apenas quando `USE_COLLECTOR=true`: migração default fica para iteração futura
- o fallback `legacy_files` persiste no codigo-base como compatibilidade, com enforcement ativo bloqueando sua ativacao inadvertida
- o chain completo (phase30+) so e validado no workspace principal; o worktree esparso executa o drill sem o chain
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto continua separado do git root principal do workspace
- as Fases 43 e 44 ainda nao foram propagadas para o repo standalone canonico de CI

## Dividas tecnicas
- integrar o coletor com um servico externo real substituindo o stub atual
- decidir o rollout default do coletor no producer (migrar `USE_COLLECTOR` para `true` por default)
- decidir o papel de longo prazo de `backend/analytics` na UI executiva
- avaliar se o git root principal deve ser extraido no futuro ou se o fluxo standalone ja cobre a necessidade operacional
- manter alinhados os contratos dos dashboards HTML internos com a trilha live/compat real

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
