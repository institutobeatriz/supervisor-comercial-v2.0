# Fase 34 - Observability Live Governance

- Gerado em: 2026-03-11T10:23:49.784Z
- Status: fail
- Runtime profile: desktop
- Infra mode: docker-bootstrap
- API base: n/a

## Resumo executivo
- Phase33 status: fail
- Smoke OK: 0
- Smoke FAIL: 0
- Contratos validados: 0 (minimo requerido: 0)
- Falhas de contrato: 0
- Checks obrigatorios aprovados: 0/24
- Browser connection: missing
- Browser exceptions: null
- Analytics endpoint: null

## Checks obrigatorios
- health: missing (check missing from smoke report)
- ready: missing (check missing from smoke report)
- observability_summary: missing (check missing from smoke report)
- observability_feed: missing (check missing from smoke report)
- observability_history: missing (check missing from smoke report)
- observability_archive: missing (check missing from smoke report)
- observability_dashboard: missing (check missing from smoke report)
- observability_dashboard_asset_css: missing (check missing from smoke report)
- observability_stream_once: missing (check missing from smoke report)
- observability_api_sla_summary: missing (check missing from smoke report)
- observability_api_sla_history: missing (check missing from smoke report)
- observability_incidents_summary: missing (check missing from smoke report)
- observability_incidents: missing (check missing from smoke report)
- observability_alerts_summary: missing (check missing from smoke report)
- observability_alerts: missing (check missing from smoke report)
- observability_backend_summary: missing (check missing from smoke report)
- observability_backend_provider: missing (check missing from smoke report)
- observability_backend_producer: missing (check missing from smoke report)
- observability_backend_report: missing (check missing from smoke report)
- observability_backend_analytics: missing (check missing from smoke report)
- observability_realtime_panel: missing (check missing from smoke report)
- observability_realtime_panel_asset_css: missing (check missing from smoke report)
- observability_realtime_panel_asset_js: missing (check missing from smoke report)
- observability_backend_dashboard: missing (check missing from smoke report)

## Artefatos
- outputDir: logs/monitoring/phase34-live
- liveReportFile: logs/monitoring/phase34-live/live-validation-report.json
- smokeReportFile: logs/monitoring/phase34-live/smoke-report.json
- browserScreenshotFile: logs/monitoring/phase34-live/panel-screenshot.png
- browserDomFile: logs/monitoring/phase34-live/panel-dom.html
- browserLogFile: logs/monitoring/phase34-live/browser.log
- apiLogFile: logs/monitoring/phase34-live/api.log
- governanceReportFile: logs/monitoring/fullcycle-connector-observability-live-governance-report.json
- governanceDashboardFile: docs/fullcycle-connectors-observability-live-governance.md
- governanceAuditFile: logs/monitoring/fullcycle-connector-observability-live-governance-audit.jsonl

## Violacoes
- phase33::phase33_runtime_validation_failed: Error: docker engine unavailable for phase33 live validation
    at ensureDockerReady (file:///C:/Users/user/.openclaw/workspace/supervisor-comercial/scripts/phase33-observability-live-runtime-validation.mjs:508:9)
    at async main (file:///C:/Users/user/.openclaw/workspace/supervisor-comercial/scripts/phase33-observability-live-runtime-validation.mjs:980:7)
- phase33_live_validation_failed: phase33 exited with status=1
- phase33_live_status_not_pass: live validation status=fail
- phase34_smoke_report_missing: structured smoke report not found
- phase34_required_contract_checks_failed: health: check missing from smoke report || ready: check missing from smoke report || observability_summary: check missing from smoke report || observability_feed: check missing from smoke report || observability_history: check missing from smoke report || observability_archive: check missing from smoke report || observability_dashboard: check missing from smoke report || observability_dashboard_asset_css: check missing from smoke report || observability_stream_once: check missing from smoke report || observability_api_sla_summary: check missing from smoke report || observability_api_sla_history: check missing from smoke report || observability_incidents_summary: check missing from smoke report || observability_incidents: check missing from smoke report || observability_alerts_summary: check missing from smoke report || observability_alerts: check missing from smoke report || observability_backend_summary: check missing from smoke report || observability_backend_provider: check missing from smoke report || observability_backend_producer: check missing from smoke report || observability_backend_report: check missing from smoke report || observability_backend_analytics: check missing from smoke report || observability_realtime_panel: check missing from smoke report || observability_realtime_panel_asset_css: check missing from smoke report || observability_realtime_panel_asset_js: check missing from smoke report || observability_backend_dashboard: check missing from smoke report
- phase34_runtime_artifacts_missing: C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\phase34-live\panel-screenshot.png, C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\phase34-live\panel-dom.html, C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\phase34-live\browser.log, C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\phase34-live\api.log, C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\phase34-live\smoke-report.json
- phase34_browser_connection_not_connected: panelConnection=missing
