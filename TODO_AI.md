# TODO AI

## Estado da fila
- Ultima fase concluida: Fase 65
- Proxima fase liberada: Fase 66 (a definir — projeto em estado production_ready)
- Fonte historica: `docs/analise-projeto/10-memoria-execucao-fases.md`
- Estado atual: production_ready (F58); pipeline integro (F59); exclusoes CI documentadas (F60); evidencias auditadas (F61); consistencia bidirecional validada (F62); consistencia cruzada validada (F63); meta-drill auditoria (F64); meta-drill implementacao (F65)

## Prioridade alta
- [ ] Fase 66: a definir — projeto em estado production_ready; avaliar necessidade de evolucao

## Prioridade baixa
- [ ] Padronizar documentos legados da raiz (`ROADMAP.md`, `STATUS-v2.md`, `IMPLEMENTATION_PLAN.md`) — fora do worktree git, requer decisao de move-los

## Fases concluidas (historico)
- [x] Fase 65: meta-drill de implementacao (bloco 43-56) — 13 drills passando; phase45 excluido (propagation); validateCommands cobre 50 test:phase commands
- [x] Fase 64: meta-drill de auditoria (bloco 57-63) — 7 drills passando; fix evergreen em phase58/61/62/63 (>= em vez de ===); validateCommands cobre 49 test:phase commands
- [x] Fase 63: drill de consistencia cruzada dos arquivos de rastreamento — HANDOFF/TODO/memoria validados mutuamente; 64 rows CONCLUIDA (fases 0-63); validateCommands cobre 48 test:phase commands
- [x] Fase 62: drill de consistencia bidirecional package.json vs validateCommands — 7 exclusoes documentadas confirmadas (3-5 Docker, 10-13 dados reais); 4 drills passando; validateCommands cobre 47 test:phase commands
- [x] Fase 61: drill de auditoria de evidencias — 61 CONCLUIDA rows; 29 evidencias pos-worktree presentes (32-60); 32 ausencias pre-worktree documentadas (0-31); validateCommands cobre 46 test:phase commands
- [x] Fase 60: drill de auditoria das exclusoes intencionais do CI — 16 fases documentadas; 4 drills; validateCommands cobre 45 test:phase commands
- [x] Fase 59: drill de integridade do pipeline de CI — 44 test:phase commands validados; CI verde run 23072976792
- [x] Fase 58: drill de completeness readiness — validateCommands cobre 43 fases; projeto formalizado como production_ready
- [x] Fase 57: drill de decisao de extracao git root — conclusao: nao necessario
- [x] Fase 56: standalone sync drill no CI — test:phase37 e test:phase56 adicionados
- [x] Fase 55: fechamento do gap CI phase14-30 — meta-drill phase55 (17 drills)
- [x] Fase 54: fechamento do gap CI — test:phase38-42 adicionados; regressao phase42 corrigida
- [x] Fase 53: drill formaliza politica minTeams
- [x] Fase 52: remover dead config cfg.providerMode de loadOperationalProvider()
- [x] Fase 51: decidir quando backend/producer vira obrigatorio sem fallback
- [x] Fase 50: card Cobertura Operacional em Executivo.tsx
- [x] Fase 49: remover dead branches legacy fallback
- [x] Fase 48: implementar modo service no coletor
- [x] Fase 47: adicionar modo api ao coletor
- [x] Fase 46: fazer USE_COLLECTOR=true o default no producer
- [x] Fase 45: propagar Fases 43 e 44 para o repo standalone canonico
- [x] Fase 44: implementar o coletor/stub concreto
- [x] Fase 43: transformar phase43-disable-legacy-fallback em enforcement real

## Bugs / riscos abertos
- Testes phase3-5 (Docker) e phase10-13 (dados reais) NAO estao no validateCommands (documentado nas Fases 60 e 62)
- PRs aguardam review/merge pelo mantenedor do repo canonical

## Mapa de cobertura por meta-drills
| Meta-drill | Bloco coberto      | Fases |
|------------|--------------------|-------|
| phase54    | CI gap closure     | 38-42 |
| phase55    | Early phases       | 14-30 |
| phase56    | Standalone sync    | 37    |
| phase64    | Audit suite        | 57-63 |
| phase65    | Implementation     | 43-56 |

## Dividas tecnicas
- Decisao sobre extracao git root: FORMALIZADA na Fase 57 — nao necessario
- Projeto production_ready: FORMALIZADO na Fase 58
- Integridade do pipeline: VALIDADA na Fase 59 (44 test:phase commands)
- Exclusoes intencionais do CI: AUDITADAS na Fase 60 (16 fases, 4 categorias)
- Consistencia de evidencias: AUDITADA na Fase 61
- Consistencia bidirecional package.json vs validateCommands: VALIDADA na Fase 62
- Consistencia cruzada dos arquivos de rastreamento: VALIDADA na Fase 63
- Meta-drill de auditoria (57-63): VALIDADO na Fase 64
- Meta-drill de implementacao (43-56): VALIDADO na Fase 65

## Checklist obrigatorio para troca de IA
- [x] atualizar `HANDOFF.md`
- [x] atualizar `TODO_AI.md`
- [x] atualizar memoria oficial e evidencia da fase
- [x] listar arquivos alterados
- [x] registrar testes executados
- [x] registrar pendencias e proximo passo exato
- [x] criar commit WIP focado apenas no andamento atual
