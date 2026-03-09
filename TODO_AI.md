# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 37
- Proxima fase liberada: Fase 38
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: repo standalone automatizado, PR canonica aberta e GitHub Actions real verde; risco principal agora e a superficie CSP/inline dos dashboards HTML internos

## Prioridade alta
- [ ] Fase 38: externalizar assets inline dos dashboards HTML internos
- [ ] Fase 38: endurecer CSP das rotas HTML de observabilidade apos remover inline script/style
- [ ] Fase 38: revalidar painel/live em browser/headless e CI apos a reducao das excecoes de CSP
- [x] Fase 37: automatizar a sincronizacao/publicacao entre este projeto e `.export-repo`
- [x] Fase 37: decidir o repositorio canonico de CI remoto
- [x] Fase 37: validar o workflow em branch/PR, nao apenas em `push` direto no `master`

## Prioridade media
- [ ] Evoluir a origem do on-call de arquivos locais para fonte operacional real
- [ ] Decidir se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Avaliar se a extracao futura para um git root proprio ainda traz ganho operacional relevante apos a Fase 37

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- dashboards HTML internos continuam com `<script>` e `<style>` inline
- CSP das rotas HTML ainda depende de excecao route-scoped permissiva
- ownership de on-call ainda depende de `rotation/calendar` file-based
- o repo canonico de CI remoto segue separado do git root principal do workspace

## Dividas tecnicas
- reduzir dependencia de assets inline nos dashboards HTML internos
- substituir a origem file-based de on-call por provedor operacional real sem quebrar contratos atuais
- decidir o papel de longo prazo de `backend/analytics` na UI executiva
- avaliar se o git root principal deve ser extraido no futuro ou se o fluxo standalone ja cobre a necessidade operacional

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
