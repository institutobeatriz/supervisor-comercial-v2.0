# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 40
- Proxima fase liberada: Fase 41
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: backend observability oficial agora publica `workloadState`, `freshnessState` e `actionabilityState`; o gap estrutural principal passou a ser a dependencia de artefatos operacionais locais

## Prioridade alta
- [ ] Fase 41: decidir o caminho canonico da ingestao operacional (`provider externo` vs `materializacao controlada`)
- [ ] Fase 41: preservar os sinais da Fase 40 (`idle`, `idle_gap`, freshness por fonte) no caminho novo
- [ ] Fase 41: validar contrato/endpoints/painel depois da decisao estrutural da ingestao
- [x] Fase 40: medir frescor e saude da fonte operacional (`incident automation`, `itsm snapshot`, `fullcycle report`)
- [x] Fase 40: expor esse estado em `backend/report`, `backend/analytics` e painel para diferenciar `sem workload ativo` de `fonte operacional indisponivel`
- [x] Fase 40: validar cenarios `healthy/stale/missing` na trilha live, compat e CI remoto
- [x] Fase 39: substituir a origem file-based de on-call por fonte operacional-first
- [x] Fase 39: preservar contratos atuais de `backend/analytics`, `incidents/alerts` e painel durante a troca da fonte
- [x] Fase 39: validar owner coverage, escalations e UI apos integrar a fonte operacional
- [x] Fase 38: externalizar assets inline dos dashboards HTML internos
- [x] Fase 38: endurecer CSP das rotas HTML de observabilidade apos remover inline script/style
- [x] Fase 38: revalidar painel/live em browser/headless e CI local apos a reducao das excecoes de CSP

## Prioridade media
- [ ] Definir contrato/versionamento oficial da coleta operacional, caso a Fase 41 mantenha materializacao local controlada
- [ ] Decidir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- a origem operacional oficial ainda depende de artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`)
- ainda nao existe provider dedicado substituindo a materializacao local da fonte operacional
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto segue separado do git root principal do workspace

## Dividas tecnicas
- substituir artefatos operacionais locais por provider/servico dedicado sem quebrar os sinais e contratos da Fase 40
- formalizar contrato/versionamento da ingestao operacional para evitar drift entre produtores e consumidores
- decidir o papel de longo prazo de `backend/analytics` na UI executiva
- avaliar se o git root principal deve ser extraido no futuro ou se o fluxo standalone ja cobre a necessidade operacional
- manter alinhados os contratos dos dashboards HTML internos com a trilha de compatibilidade real

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
