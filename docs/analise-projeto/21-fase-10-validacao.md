# 21 - Fase 10 - Monitoramento Externo e SLO

## Data
- 2026-03-08 (America/Sao_Paulo)

## Objetivo da fase
Implantar monitoramento operacional continuo com:
1. probes sinteticos de API e worker;
2. janela historica para SLO;
3. alerta webhook com cooldown;
4. documentacao de operacao e configuracao.

## Implementacoes realizadas
1. Novo script operacional:
- `scripts/phase10-monitoring-slo.mjs`
- checks de:
  - `GET /health`
  - `GET /ready`
  - `GET /api/dashboard/kpis`
  - `GET /api/alerts`
  - health do container `supervisor-worker` via `docker inspect`
- persistencia:
  - `logs/monitoring/last-report.json`
  - `logs/monitoring/slo-state.json`
- regras de incidente:
  - falha de check critico na execucao atual; ou
  - breach de SLO na janela.
- alerta webhook:
  - `MONITOR_ALERT_WEBHOOK_URL`
  - `MONITOR_ALERT_BEARER_TOKEN` (opcional)
  - cooldown por `MONITOR_ALERT_COOLDOWN_MINUTES`.

2. Integracao de comandos no projeto:
- `package.json`
  - `monitor:check`
  - `test:phase10`

3. Configuracao de ambiente:
- `.env.example` com bloco completo `MONITOR_*` para:
  - bases monitoradas;
  - metas de SLO;
  - timeout/latencia;
  - arquivos de estado/relatorio;
  - webhook de alertas.

4. Documentacao operacional:
- `docs/monitoramento-externo.md` (guia completo de operacao).
- `docs/runbook-operacional.md` atualizado com secao de monitoramento/SLO.
- `README.md` atualizado com comandos da fase.

## Validacao tecnica executada
1. Probe de monitoramento em runtime real:
```bash
npm run monitor:check
```
Resultado:
- todos os checks `OK`;
- sem incidente;
- janela inicial com disponibilidade 100% (1/1 por check).

2. Evidencia de relatorio:
- `logs/monitoring/last-report.json`:
  - `incident: false`
  - `severity: info`
  - checks de API e worker `ok: true`
  - `sloBreaches: []`

3. Qualidade global:
```bash
npm run lint
npm run typecheck
npm run build
```
Resultado:
- todos os comandos com sucesso.

## Riscos residuais
1. Build do dashboard ainda emite warning de chunk > 500kb devido `exceljs` on-demand.
2. Alerta webhook depende de configuracao externa (`MONITOR_ALERT_WEBHOOK_URL`).
3. Janela SLO inicia com poucas amostras (warm-up ate atingir `MONITOR_MIN_SAMPLES_FOR_SLO`).

## Conclusao
Fase 10 concluida com monitoramento centralizado operacional:
1. probes sintéticos ativos;
2. estado SLO persistido;
3. caminho de alerta pronto para integracao externa;
4. runbook e README atualizados para operacao recorrente.
