# Fullcycle Connectors Observability Backend

- Generated at: 2026-03-09T19:35:13.551Z
- Status: WARN
- Environment: development
- Stream status: unknown
- Alerting status: unknown
- API SLA status: unknown
- Owner coverage: 100%
- Breached escalations: 0

## On-call Source

- Source mode: operational_state
- Operational state loaded: yes
- Snapshot loaded: no
- Direct operational owners: 0
- Roster entries: 0
- Team fallback entries: 0

## Ownership and Escalation

| Metric | Value |
|---|---:|
| Active records | 0 |
| Assigned owners | 0 |
| Unassigned owners | 0 |
| Owner coverage % | 100 |
| Breached escalations | 0 |
| Analytics history points | 10 |

## Teams

| Team | Open incidents | Active alerts | Pending escalations | Owners | Channels |
|---|---:|---:|---:|---|---|
| integrations | 0 | 0 | 0 | n/a | slack, webhook |

## Incidents

| ID | Status | Severity | Team | Owner | Source | Escalation | Started |
|---|---|---|---|---|---|---|---|
| conn-20260309011820-mtofr | resolved | critical | integrations | unassigned | n/a | resolved | 2026-03-09T01:18:20.881Z |

## Alerts

| Key | Status | Severity | Team | Owner | Source | Escalation | Last seen |
|---|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - | - |

## Recent Analytics

| Timestamp | Coverage % | Open incidents | Active alerts | Breached escalations |
|---|---:|---:|---:|---:|
| 2026-03-09T19:35:13.551Z | 100 | 0 | 0 | 0 |
| 2026-03-09T19:29:33.472Z | 100 | 0 | 0 | 0 |
| 2026-03-09T19:06:59.343Z | 100 | 0 | 0 | 0 |
| 2026-03-09T18:58:25.253Z | 100 | 0 | 0 | 0 |
| 2026-03-09T18:58:07.602Z | 100 | 0 | 0 | 0 |
| 2026-03-09T18:55:50.855Z | 100 | 0 | 0 | 0 |
| 2026-03-09T17:27:29.536Z | 100 | 0 | 0 | 0 |
| 2026-03-09T14:34:19.351Z | 100 | 0 | 0 | 0 |
| 2026-03-09T14:33:53.327Z | 100 | 0 | 0 | 0 |
| 2026-03-09T14:33:04.082Z | 100 | 0 | 0 | 0 |

## Violations

- [BLOCKING] alert_report_unavailable: alert report unavailable at C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\fullcycle-connector-observability-alerting-report.json
- [BLOCKING] api_sla_history_unavailable: api sla history unavailable at C:\Users\user\.openclaw\workspace\supervisor-comercial\logs\monitoring\fullcycle-connector-observability-api-sla-history.json

## Operational Source Health

| Signal | Value |
|---|---|
| Workload state | idle |
| Freshness state | missing |
| Actionability | idle_gap |
| Healthy sources | 0 |
| Stale sources | 2 |
| Missing sources | 1 |
| Unknown sources | 0 |

### Sources

| Source | Loaded | Freshness | Age (min) | Max Age (min) | Timestamp | Required when active |
|---|---|---|---:|---:|---|---|
| Incident automation state | yes | stale | 1117.48 | 30 | 2026-03-09T00:57:44.829Z | yes |
| ITSM snapshot | no | missing | n/a | 30 | n/a | no |
| Fullcycle report | yes | stale | 1117.48 | 60 | 2026-03-09T00:57:44.829Z | no |
