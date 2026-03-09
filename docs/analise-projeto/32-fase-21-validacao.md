# 32 - Fase 21 - Runtime Enterprise de Conectores (SLO + Incidente + Alerta)

## Data
- 2026-03-09 (America/Sao_Paulo)

## Objetivo da fase
Evoluir a governanca de conectores para modo runtime:
1. medir SLO por integracao com janela historica;
2. detectar degradacao por conector e abrir/resolver incidente;
3. disparar alerta com cooldown para canais operacionais.

## Implementacoes realizadas
1. Runtime de conectores:
- criado `scripts/phase21-connectors-runtime.mjs` com:
  - leitura de `FULLCYCLE_CONNECTOR_TELEMETRY_FILE`;
  - agregacao por conector (`provider/channel`) em janela configuravel;
  - KPI por integracao:
    - success rate;
    - timeout rate;
    - HTTP error rate;
    - p95 (worst/avg);
    - contract errors;
  - enforcement por metas (`FULLCYCLE_CONNECTOR_TARGET_*`);
  - lifecycle de incidente em `FULLCYCLE_CONNECTOR_INCIDENTS_FILE`;
  - alerta webhook/slack/discord/telegram com cooldown.

2. Relatorios e dashboards:
- saidas novas:
  - `FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE`;
  - `FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE`.

3. Drill automatizado:
- criado `scripts/phase21-connectors-runtime-drill.mjs` cobrindo:
  - cenario degradado com falha em modo enforced;
  - cooldown de alerta em reexecucao degradada;
  - resolucao automatica do incidente em cenario saudavel.

4. Integracao de operacao/CI:
- `package.json` atualizado com:
  - `test:phase21`
  - `monitor:fullcycle:connectors`
- `.github/workflows/ci.yml` atualizado com:
  - `Connector runtime drill (phase21)`
  - `Connector runtime gate`
  - env de runtime/SLO de conectores.

5. Documentacao:
- atualizados:
  - `.env.example`
  - `README.md`
  - `docs/monitoramento-externo.md`
  - `docs/runbook-operacional.md`

## Validacao tecnica executada
1. `npm run test:phase21`
- resultado: sucesso.
- saida: `[OK] phase21 drill connector runtime pass/fail/cooldown behavior validated`.

2. Regressao das fases anteriores:
- `npm run test:phase20` => sucesso.
- `npm run test:phase19` => sucesso.

3. Operacao runtime:
- `npm run monitor:fullcycle:connectors` => sucesso (`status=warn` no baseline atual com enforcement desligado).
- execucao estrita com targets calibrados (`FULLCYCLE_CONNECTOR_ENFORCE_TARGETS=true`) => sucesso (`status=pass`).

## Evidencias
1. `scripts/phase21-connectors-runtime.mjs`
2. `scripts/phase21-connectors-runtime-drill.mjs`
3. `logs/monitoring/phase21-drill/fullcycle-connector-runtime-report.json`
4. `logs/monitoring/phase21-drill/fullcycle-connector-incidents.json`
5. `logs/monitoring/fullcycle-connector-runtime-report.json`
6. `docs/fullcycle-connectors-runtime.md`

## Riscos residuais
1. ruido de telemetria de ambientes de teste pode contaminar baseline local.
2. thresholds de SLO por conector ainda precisam tuning em ambiente homolog/producao.
3. homologacao final com APIs reais de provedores externos continua como etapa operacional.

## Conclusao
Fase 21 concluida:
1. runtime de conectores com SLO por integracao operacionalizado;
2. incidentes de degradacao e alertas com cooldown implementados;
3. gate de runtime integrado ao CI;
4. base pronta para homologacao produtiva e tuning final por provedor.
