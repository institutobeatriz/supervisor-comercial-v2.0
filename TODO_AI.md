# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 38
- Proxima fase liberada: Fase 39
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: dashboards HTML internos sem inline/CSP permissiva; gate live voltou para `pass`; gap estrutural principal agora e a origem file-based do on-call

## Prioridade alta
- [ ] Fase 39: substituir a origem file-based de on-call por fonte operacional real
- [ ] Fase 39: preservar contratos atuais de `backend/analytics`, `incidents/alerts` e painel durante a troca da fonte
- [ ] Fase 39: validar owner coverage, escalations e UI apos integrar a fonte operacional real
- [x] Fase 38: externalizar assets inline dos dashboards HTML internos
- [x] Fase 38: endurecer CSP das rotas HTML de observabilidade apos remover inline script/style
- [x] Fase 38: revalidar painel/live em browser/headless e CI local apos a reducao das excecoes de CSP

## Prioridade media
- [ ] Republicar a Fase 38 no repo standalone canonico e confirmar GitHub Actions remota
- [ ] Decidir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- ownership de on-call ainda depende de `rotation/calendar` locais
- o repo canonico de CI remoto ainda nao recebeu a Fase 38
- `docs/fullcycle-connectors-observability-live-governance.md` continua sendo artefato gerado e muda a cada execucao da rotina live
- o repo canonico de CI remoto segue separado do git root principal do workspace

## Dividas tecnicas
- substituir a origem file-based de on-call por provedor operacional real sem quebrar contratos atuais
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
- [ ] criar commit WIP focado apenas no andamento atual
