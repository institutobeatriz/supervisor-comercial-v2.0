# 49 - Fase 38 - Hardening de CSP e Assets dos Dashboards Internos

## Objetivo da fase
Eliminar dependencia de CSS/JS inline nos dashboards HTML internos de observabilidade, endurecer a CSP route-scoped e provar que o runtime live continua funcional apos a reducao da superficie de excecao.

## Escopo fechado
1. Painel backend-first realtime (`/api/observability/connectors/realtime/panel`).
2. Dashboard executivo servido em `/api/observability/connectors/dashboard`.
3. Rotas internas de assets associadas a ambos os HTMLs.
4. Smoke, drills e gate live para refletir o novo contrato.

## Entregas implementadas
1. Painel realtime com assets externos:
- `scripts/phase31-observability-panel-backend-template.html`
- `scripts/phase31-observability-panel-backend-integration.mjs`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.css`
- `scripts/assets/fullcycle-connectors-observability-ops-panel.js`
2. Dashboard executivo/original com shell HTML e assets externos:
- `scripts/phase24-observability-layer.mjs`
- `scripts/assets/fullcycle-connectors-observability.css`
- `scripts/assets/fullcycle-connectors-observability.js`
3. Dashboard legado materializado sem CSS inline:
- `scripts/phase35-observability-legacy-convergence.mjs`
- `scripts/assets/fullcycle-connectors-observability-compat.css`
4. API interna endurecida:
- `apps/api/src/routes/observability.ts`
5. Validacao e governanca:
- `scripts/ci-api-smoke.mjs`
- `scripts/phase24-observability-drill.mjs`
- `scripts/phase31-observability-panel-backend-integration-drill.mjs`
- `scripts/phase33-observability-live-runtime-validation.mjs`
- `scripts/phase34-observability-live-governance.mjs`
- `scripts/phase38-observability-csp-hardening.mjs`
- `package.json`
- `.github/workflows/ci.yml`

## Decisoes tecnicas
1. O painel realtime passou a usar `<template id="phase31-panel-data">` e JS externo para evitar inline script.
2. O dashboard executivo materializado pela fase de compatibilidade passou a ser server-rendered com CSS externo apenas; nao foi adicionado JS desnecessario.
3. A CSP das rotas HTML foi reduzida para `style-src 'self'` e `script-src 'self'`, sem `unsafe-inline`.
4. As rotas de assets foram mantidas separadas de dados e servem apenas arquivos whitelisted por nome/extensao.
5. O runtime live passou a limpar `artifactsDir` no inicio para impedir falso positivo por assets antigos.

## Validacao executada
1. Sintaxe:
- `node --check scripts/phase24-observability-layer.mjs`
- `node --check scripts/phase31-observability-panel-backend-integration.mjs`
- `node --check scripts/phase35-observability-legacy-convergence.mjs`
- `node --check scripts/ci-api-smoke.mjs`
- `node --check scripts/phase33-observability-live-runtime-validation.mjs`
- `node --check scripts/phase38-observability-csp-hardening.mjs`
2. Drills locais:
- `npm run test:phase24`
- `npm run test:phase31`
- `npm run test:phase35`
- `npm run test:phase38`
3. Build:
- `npm run build -w @supervisor/api`
4. Runtime live oficial:
- `npm run test:phase34`
- `npm run monitor:fullcycle:observability:live`

## Resultado observado
1. `npm run test:phase38` => `pass`.
2. `npm run test:phase34` => `status=pass`, `contracts=21/21`.
3. `npm run monitor:fullcycle:observability:live` => `status=pass`, `contracts=21/21`.
4. O smoke live passou a aprovar:
- `observability_dashboard`
- `observability_dashboard_asset_css`
- `observability_realtime_panel`
- `observability_realtime_panel_asset_css`
- `observability_realtime_panel_asset_js`
5. O dashboard executivo deixou de retornar HTML com `<style>` inline no fluxo live.
6. O painel realtime continuou funcional em browser/headless com assets externos.

## Evidencia objetiva
1. `logs/monitoring/fullcycle-connector-observability-live-governance-report.json`
2. `logs/monitoring/phase34-live/live-validation-report.json`
3. `logs/monitoring/phase34-live/smoke-report.json`
4. `logs/monitoring/phase34-live/panel-dom.html`
5. `logs/monitoring/phase24-drill/fullcycle-connectors-observability.html`
6. `logs/monitoring/phase31-drill/panel-dashboard.html`

## Riscos residuais
1. A camada de on-call segue dependente de arquivos locais (`rotation/calendar`).
2. O repo standalone remoto ainda nao foi republicado nesta fase.
3. O dashboard executivo materializado continua sendo gerado pela trilha de compatibilidade; qualquer evolucao visual futura precisa considerar essa origem como fonte real do endpoint `/dashboard`.

## Proxima fase liberada
Fase 39 - substituir a origem file-based de on-call por fonte operacional real, preservando os contratos atuais de backend analytics, incidents/alerts e painel.
