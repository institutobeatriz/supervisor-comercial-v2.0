# 25 - Fase 14 - Integracao Paging/ITSM e SLA por Severidade

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Concluir integracao operacional de resposta a incidente:
1. abertura/fechamento automatico de paging e ticket;
2. idempotencia por `incident.id`;
3. tier de SLA por severidade (P1/P2/P3);
4. validacao automatizada com endpoints mock;
5. snapshot da automacao no CI.

## Implementacoes realizadas
1. Sincronizador de automacao de incidentes:
- criado `scripts/phase14-itsm-paging-sync.mjs`;
- entrada: `MONITOR_INCIDENTS_FILE` (`incidents.json`);
- saida:
  - `INCIDENT_AUTOMATION_STATE_FILE` (estado idempotente por incidente);
  - `INCIDENT_AUTOMATION_REPORT_FILE` (sumario da execucao);
- canais suportados:
  - paging (`ONCALL_PAGING_WEBHOOK_URL`);
  - ticketing ITSM (`ITSM_TICKET_WEBHOOK_URL`);
- acoes:
  - `open` quando incidente esta `open` e ainda nao sincronizado;
  - `resolve` quando incidente esta `resolved` e ja foi aberto antes.

2. SLA por severidade:
- mapeamento automatico:
  - `critical` -> `P1`
  - `warning` -> `P2`
  - `info` -> `P3`
- targets configuraveis por env:
  - `SLA_P1_ACK_MIN`, `SLA_P1_RESOLVE_MIN`
  - `SLA_P2_ACK_MIN`, `SLA_P2_RESOLVE_MIN`
  - `SLA_P3_ACK_MIN`, `SLA_P3_RESOLVE_MIN`

3. Drill de integracao:
- criado `scripts/phase14-itsm-paging-drill.mjs`;
- valida:
  - abertura paging + ticket;
  - resolucao paging + ticket;
  - idempotencia (reexecucao sem duplicar chamadas).

4. Comandos oficiais adicionados:
- `package.json`:
  - `monitor:itsm`
  - `test:phase14`

5. CI e operacao:
- `.github/workflows/ci.yml` atualizado:
  - executa `monitor:itsm` apos `monitor:postmortem`;
  - publica estado/relatorio de automacao no artifact de confiabilidade.
- `.env.example`, `README.md`, `docs/monitoramento-externo.md`, `docs/runbook-operacional.md` atualizados.

## Validacao tecnica executada
1. `npm run test:phase14`
- resultado: sucesso (open+resolve+idempotencia aprovados).

2. `npm run monitor:itsm`
- resultado: sucesso (snapshot local gerado; sem falha em ausencia de endpoint configurado).

3. Qualidade global:
- `npm run lint` => sucesso.
- `npm run typecheck` => sucesso.
- `npm run build` => sucesso.

## Evidencias
1. `logs/monitoring/phase14-drill/incident-automation-state.json`
2. `logs/monitoring/phase14-drill/incident-automation-report.json`
3. `scripts/phase14-itsm-paging-sync.mjs`
4. `scripts/phase14-itsm-paging-drill.mjs`
5. `.github/workflows/ci.yml`

## Riscos residuais
1. Integracao real depende de endpoints de paging/ITSM estaveis e autenticados.
2. Comportamento de ownership/escalonamento depende das regras do destino externo.
3. Abertura de ticket nao substitui necessidade de classificacao humana de causa raiz.

## Conclusao
Fase 14 concluida:
1. incidente agora possui trilha automatizada para on-call e ticketing;
2. sincronizacao e idempotente e rastreavel em estado persistido;
3. SLA por severidade foi padronizado por configuracao;
4. validacao automatizada cobre fluxo open/resolve ponta a ponta.
