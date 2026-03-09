# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 39
- Proxima fase liberada: Fase 40
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: backend observability oficial agora resolve owner por trilha operacional-first; o gap estrutural principal passou a ser a saude/frescor dessa fonte operacional

## Prioridade alta
- [ ] Fase 40: medir frescor e saude da fonte operacional (`incident automation`, `itsm snapshot`, `fullcycle report`)
- [ ] Fase 40: expor esse estado em `backend/report`, `backend/analytics` e painel para diferenciar `sem workload ativo` de `fonte operacional indisponivel`
- [ ] Fase 40: validar cenarios `healthy/stale/missing` na trilha live, compat e CI remoto
- [x] Fase 39: substituir a origem file-based de on-call por fonte operacional-first
- [x] Fase 39: preservar contratos atuais de `backend/analytics`, `incidents/alerts` e painel durante a troca da fonte
- [x] Fase 39: validar owner coverage, escalations e UI apos integrar a fonte operacional
- [x] Fase 38: externalizar assets inline dos dashboards HTML internos
- [x] Fase 38: endurecer CSP das rotas HTML de observabilidade apos remover inline script/style
- [x] Fase 38: revalidar painel/live em browser/headless e CI local apos a reducao das excecoes de CSP

## Prioridade media
- [ ] Decidir se a Fase 40 deve continuar com materializacao local controlada ou iniciar leitura de provider externo dedicado
- [ ] Decidir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- a origem operacional oficial ainda depende de artefatos locais (`incident-automation-state`, `itsm-snapshot`, `fullcycle-report`)
- ainda nao existe telemetria explicita de frescor/staleness por fonte operacional na API/painel
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto segue separado do git root principal do workspace

## Dividas tecnicas
- substituir artefatos operacionais locais por provider/servico dedicado sem quebrar contratos atuais
- adicionar semantica objetiva de `healthy/stale/missing` para a origem operacional no backend e no painel
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
