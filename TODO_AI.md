# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 47
- Proxima fase liberada: Fase 48 (a definir)
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: coletor tem modos file/synthetic/api; modo api chama endpoint interno com fetch+timeout; CI verde run 22981720840; proximo passo e avaliar fase 48 conforme plano

## Prioridade alta
- [ ] Fase 48: avaliar proxima necessidade conforme plano de conclusao (`09-plano-conclusao-dashboard-comercial.md`)
- [ ] Fase 48: implementar modo `service` do coletor (terceiro modo declarado em OPERATIONAL_COLLECTOR_INTERFACE)
- [x] Fase 47: adicionar modo `api` ao coletor (buildApiSources, mapApiSourcesToCollectorFormat, branch api em collectOperationalSources)
- [x] Fase 47: drill phase47 (api_unreachable/api_mode_contract/mode_env_selection) passando
- [x] Fase 47: test:phase47 no package.json e standalone-export.json
- [x] Fase 47: CI remoto verde run 22981720840
- [x] Fase 46: fazer USE_COLLECTOR=true o default no producer
- [x] Fase 46: expor collectorEnabled/collectorMode no summary do producer
- [x] Fase 46: adicionar enforcement smoke phase46
- [x] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico (PR + GitHub Actions)
- [x] Fase 45: validar CI remoto verde apos propagacao
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
- [ ] Implementar modo `service` do coletor (terceiro modo declarado em OPERATIONAL_COLLECTOR_INTERFACE)
- [ ] Decidir quando `backend/provider` e `backend/producer` devem virar dependencias obrigatorias sem fallback em todos os ambientes
- [ ] Definir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- o modo `service` do coletor (OPERATIONAL_COLLECTOR_INTERFACE) ainda nao esta implementado
- o modo `api` usa endpoint interno real, mas CI usa mock server; integracao com producao requer URL/key configurados
- o producer usa o coletor por default agora, mas o stub lê arquivos locais (mode=file) em CI sem dados reais
- o fallback `legacy_files` persiste no codigo-base como compatibilidade, com enforcement ativo bloqueando sua ativacao inadvertida
- o chain completo (phase30+) so e validado no workspace principal; o worktree esparso executa o drill sem o chain
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto continua separado do git root principal do workspace
- arquivos untracked no git principal nao sao populados no worktree esparso; cada sync pode deletar arquivos do export-repo se nao estiverem no worktree; mitigacao: copiar untracked antes de cada sync
- PR #10 aguarda review/merge pelo mantenedor do repo canonical

## Dividas tecnicas
- implementar modo `service` do coletor substituindo o stub atual por chamada a servico dedicado
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
