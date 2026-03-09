# 43 - Fase 32 - Validacao

## Escopo da fase
Evoluir o backend dedicado de observabilidade para:
1. resolver owner dinamico por rotacao/calendario de on-call;
2. preservar o baseline de consolidacao da Fase 30 sem duplicar a logica principal;
3. medir cobertura de ownership e escalations pendentes;
4. persistir analytics historico do backend dedicado;
5. expor analytics na API interna, smoke e CI.

## Entregas principais
1. Script oficial da fase:
- `scripts/phase32-observability-backend-oncall-analytics.mjs`
2. Drill automatizado pass/fail:
- `scripts/phase32-observability-backend-oncall-analytics-drill.mjs`
3. Evolucao da API interna:
- `apps/api/src/routes/observability.ts`
4. Evolucao operacional/CI:
- `package.json`
- `scripts/ci-api-smoke.mjs`
- `.github/workflows/ci.yml`
5. Documentacao:
- `.env.example`
- `README.md`
- `docs/runbook-operacional.md`
- `docs/monitoramento-externo.md`

## Contrato implementado
### Backend oficial com owner dinamico
1. O alias `monitor:fullcycle:observability:backend` passa a apontar para a Fase 32.
2. A Fase 32 executa a Fase 30 como baseline e depois enriquece `incidents` e `alerts` com:
- `owner`
- `ownerSource`
- `ownerRuleId`
- `ownerAssignedAt`
- `ownerTimezone`
- `ownerTier`
- `ownerReferenceTime`
- `escalation`
3. A resolucao de owner segue esta ordem:
- `calendar_override`
- `calendar_holiday`
- `rotation`
- `default`
- `unassigned`
4. A fase passa a calcular cobertura de ownership, owners nao atribuidos e escalations estourados.

### Analytics historico
1. O backend passa a persistir historico em `FULLCYCLE_CONNECTOR_OBS_BACKEND_ANALYTICS_FILE`.
2. Cada ponto historico registra:
- `timestamp`
- `environment`
- `openIncidents`
- `activeAlerts`
- `ownerCoveragePct`
- `unassignedOwners`
- `breachedEscalations`
- resumo por equipe
- severidade agregada
3. O report do backend passa a expor `analytics.current` e referencia ao arquivo historico.

### API interna
1. Novo endpoint executivo:
- `GET /api/observability/connectors/backend/analytics`
2. O smoke da API interna passa a cobrir esse endpoint.

## Validacoes executadas
1. Sintaxe:
- `node --check scripts/phase32-observability-backend-oncall-analytics.mjs` => sucesso
- `node --check scripts/phase32-observability-backend-oncall-analytics-drill.mjs` => sucesso
- `node --check scripts/ci-api-smoke.mjs` => sucesso
2. Drill da fase:
- `npm run test:phase32` => sucesso
3. Regressao:
- `npm run test:phase30` => sucesso
- `npm run test:phase31` => sucesso
4. Build/API:
- `npm run build -w @supervisor/api` => sucesso
5. Gate operacional controlado:
- `npm run monitor:fullcycle:observability:backend` com dataset controlado da Fase 32 => sucesso
- resultado observado: `status=pass`, `coverage=100%`, `active=2`, `escalations=2`, `history=3`

## Evidencias
1. Drill/gate controlado:
- `logs/monitoring/phase32-drill/backend-store.json`
- `logs/monitoring/phase32-drill/backend-report.json`
- `logs/monitoring/phase32-drill/backend-analytics.json`
- `logs/monitoring/phase32-drill/backend-dashboard.md`
- `logs/monitoring/phase32-drill/backend-audit.jsonl`
2. Codigo e contrato:
- `scripts/phase32-observability-backend-oncall-analytics.mjs`
- `scripts/phase32-observability-backend-oncall-analytics-drill.mjs`
- `apps/api/src/routes/observability.ts`
- `scripts/ci-api-smoke.mjs`

## Resultado observado
1. O backend oficial deixa de depender apenas de owner estatico derivado da matriz de roteamento.
2. A governanca de on-call das Fases 16/17 passa a influenciar diretamente o store dedicado do backend.
3. Ownership coverage e escalations passam a fazer parte do contrato executivo do backend.
4. A API interna passa a oferecer leitura historica do backend sem precisar abrir os arquivos locais diretamente.

## Riscos residuais
1. O smoke expandido da API nao foi executado contra uma API live neste turno.
2. O painel operacional nao foi validado em browser/headless ponta a ponta neste turno.
3. A integracao de on-call continua file-based (`rotation/calendar`), sem provedor externo real nesta fase.

## Proxima fase sugerida
1. Fase 33 - executar smoke live da API interna e validacao browser/headless do painel/backend analytics para fechar o gap de runtime real.
