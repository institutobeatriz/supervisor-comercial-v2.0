# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 42
- Proxima fase liberada: Fase 43
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: o backend observability agora usa um produtor dedicado para alimentar o provider operacional canônico versionado `fullcycle.observability.operational-provider.v1`; o gap estrutural principal passou a ser o enforcement final contra `legacy_files` e a futura origem produtiva desse producer

## Prioridade alta
- [ ] Fase 43: transformar `phase43-disable-legacy-fallback` em enforcement real em todos os caminhos observability
- [ ] Fase 43: impedir reintroducao de `legacy_files` em smoke/live/compat/API
- [ ] Fase 43: definir a interface do coletor/servico dedicado que substituira a alimentacao file-based do producer
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
- [ ] Definir o rollout de um coletor/servico operacional real por tras do producer dedicado
- [ ] Decidir quando `backend/provider` e `backend/producer` devem virar dependencias obrigatorias sem fallback em todos os ambientes
- [ ] Definir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- o producer dedicado ainda e alimentado por artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`)
- o fallback `legacy_files` ainda existe no codigo-base, embora ja esteja desabilitado no caminho oficial da Fase 42
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto segue separado do git root principal do workspace

## Dividas tecnicas
- substituir a alimentacao file-based do producer por um coletor/servico dedicado sem quebrar os contratos das Fases 41/42
- formalizar o enforcement definitivo e a remocao progressiva do fallback `legacy_files`
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
