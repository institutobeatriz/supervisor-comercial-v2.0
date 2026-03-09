# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 36
- Proxima fase liberada: Fase 37
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: CI real do GitHub validado e verde; risco principal agora e drift operacional entre workspace e repo standalone

## Prioridade alta
- [ ] Fase 37: automatizar a sincronizacao/publicacao entre este projeto e `.export-repo`
- [ ] Fase 37: decidir qual repositorio sera canonico (`.export-repo` publicado ou extracao deste projeto para git root proprio)
- [ ] Fase 37: validar o mesmo workflow em branch/PR, nao apenas em `push` direto no `master`
- [x] Fase 36: publicar a copia standalone no GitHub com escrita real para `gushiprata-web`
- [x] Fase 36: executar a trilha das Fases 34/35 em runner GitHub real com evidencia objetiva do browser e dos services
- [x] Fase 36: confirmar que o gate live permanece verde em CI com os endpoints legados endurecidos em `200`

## Prioridade media
- [ ] Reduzir dependencia de assets inline nos dashboards HTML internos
- [ ] Evoluir a origem do on-call de arquivos locais para fonte operacional real
- [ ] Decidir se `backend/analytics` deve aparecer diretamente na UI executiva do painel

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Revisar se a politica `minTeams=0` da gate final do painel deve continuar so em CI limpo ou se precisa de dataset minimo sintetico

## Bugs / riscos abertos
- o fluxo de exportacao para `.export-repo` ainda depende de sincronizacao manual
- dashboards HTML internos continuam com `<script>`/`<style>` inline, embora protegidos por CSP especifico de rota
- ownership de on-call ainda depende de `rotation/calendar` file-based
- a gate final do painel em CI agora aceita `minTeams=0`; a validacao forte de times reais continua coberta na Fase 34 live com dataset controlado

## Dividas tecnicas
- transformar o fluxo standalone do GitHub em publicacao deterministicamente reproduzivel
- reduzir dependencia de assets inline nos dashboards HTML internos
- decidir o papel de longo prazo de `backend/analytics` na UI executiva
- substituir a origem file-based de on-call por provedor operacional real sem quebrar contratos atuais

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
