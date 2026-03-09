import fs from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf-8');
}

function fmt(value, suffix = '') {
  if (value === null || value === undefined) return 'n/a';
  return `${value}${suffix}`;
}

function fmtDate(iso) {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  return d.toISOString();
}

function durationMin(ms) {
  if (typeof ms !== 'number') return 'n/a';
  return (ms / 60_000).toFixed(2);
}

async function main() {
  const incidentsFile = process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json');
  const reliabilityFile = process.env.RELIABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/reliability-summary.json');
  const dashboardFile = process.env.RELIABILITY_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/reliability-dashboard.md');

  const incidentsState = await readJson(incidentsFile, { incidents: [], activeIncidentId: null });
  const reliability = await readJson(reliabilityFile, null);
  const incidents = Array.isArray(incidentsState.incidents) ? incidentsState.incidents : [];

  const latest = [...incidents]
    .sort((a, b) => Date.parse(b.startedAt || '') - Date.parse(a.startedAt || ''))
    .slice(0, 10);

  const lines = [];
  lines.push('# Reliability Dashboard');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Incidents file: \`${incidentsFile}\``);
  lines.push(`- Reliability source: \`${reliabilityFile}\``);
  lines.push('');

  if (reliability) {
    lines.push('## KPI');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    lines.push(`| Total incidents (window) | ${reliability?.totals?.totalIncidents ?? 'n/a'} |`);
    lines.push(`| Open incidents | ${reliability?.totals?.openIncidents ?? 'n/a'} |`);
    lines.push(`| Resolved incidents | ${reliability?.totals?.resolvedIncidents ?? 'n/a'} |`);
    lines.push(`| MTTD avg | ${fmt(reliability?.mttd?.avgSec, 's')} |`);
    lines.push(`| MTTD p95 | ${fmt(reliability?.mttd?.p95Sec, 's')} |`);
    lines.push(`| MTTR avg | ${fmt(reliability?.mttr?.avgMin, 'min')} |`);
    lines.push(`| MTTR p95 | ${fmt(reliability?.mttr?.p95Min, 'min')} |`);
    lines.push('');
  }

  lines.push('## Recent Incidents');
  lines.push('');
  lines.push('| ID | Status | Max Severity | Started | Detected | Resolved | Duration (min) |');
  lines.push('|---|---|---|---|---|---|---|');

  if (latest.length === 0) {
    lines.push('| - | - | - | - | - | - | - |');
  } else {
    for (const inc of latest) {
      lines.push(
        `| ${inc.id || '-'} | ${inc.status || '-'} | ${inc.maxSeverity || inc.severity || '-'} | ${fmtDate(inc.startedAt)} | ${fmtDate(inc.detectedAt)} | ${fmtDate(inc.resolvedAt)} | ${durationMin(inc.durationMs)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Active Incident');
  lines.push('');
  lines.push(`- Active incident id: ${incidentsState.activeIncidentId || 'none'}`);
  lines.push('');

  await writeText(dashboardFile, lines.join('\n'));
  console.log(`Reliability dashboard generated: ${dashboardFile}`);
}

main().catch((error) => {
  console.error(`Unexpected reliability dashboard failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
