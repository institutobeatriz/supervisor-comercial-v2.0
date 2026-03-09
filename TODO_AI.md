# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 35
- Proxima fase liberada: Fase 36
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual da Fase 36: andamento parcial com bloqueio operacional (`remote origin` ausente)

## Prioridade alta
- [ ] Fase 36: conectar este repo a um `remote origin` existente ou autorizar a criacao/publicacao de um remoto privado
- [x] Fase 36: reduzir o ruido de bootstrap do painel (`401` antes do `adminKey`) sem quebrar a validacao headless/live
- [ ] Fase 36: executar a trilha das Fases 34/35 em runner GitHub real com evidencia objetiva do browser e dos services
- [ ] Fase 36: confirmar que o gate live permanece verde em CI com os endpoints legados endurecidos em `200`

## Prioridade media
- [ ] Decidir se os dashboards HTML internos devem migrar gradualmente para assets externos para reduzir dependencia de CSP route-scoped
- [ ] Avaliar se `backend/analytics` deve aparecer diretamente na UI executiva do painel
- [ ] Definir horizonte de descontinuacao formal da camada legada agora que a compatibilidade backend-first esta materializada
- [x] Criar preflight objetivo para verificar `gh auth` + `remote origin` + capacidade de consultar workflows/runs

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) com a memoria atual
- [ ] Evoluir a origem do on-call de arquivos locais para fonte operacional real sem perder o contrato atual

## Bugs / riscos abertos
- caminho CI real das Fases 34/35 ainda nao foi exercitado em runner GitHub neste turno
- repositorio local nao possui `remote origin`, bloqueando GitHub Actions reais
- dashboards HTML internos continuam com `<script>`/`<style>` inline, embora agora protegidos por CSP especifico de rota
- ownership de on-call ainda depende de `rotation/calendar` file-based

## Dividas tecnicas
- decidir o papel de longo prazo da trilha legada agora que ela foi compatibilizada via backend-first
- reduzir dependencia de assets inline nos dashboards HTML internos
- decidir o papel exato de `backend/analytics` na UI, hoje validado live mas ainda sem consumo dedicado na tela
- transformar o preflight GitHub da Fase 36 em execucao real assim que houver remoto conectado

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas na fase
