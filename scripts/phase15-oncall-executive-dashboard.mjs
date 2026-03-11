import fs from 'node:fs/promises';
import path from 'node:path';

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function safeMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function fmtIso(value) {
  const ms = safeMs(value);
  if (!Number.isFinite(ms)) return 'n/a';
  return new Date(ms).toISOString();
}

function fmtMinutes(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  return `${(ms / 60_000).toFixed(2)} min`;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sanitizeFileName(value) {
  return String(value || 'incident-unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function tierBySeverity(severity) {
  if (severity === 'critical') return 'P1';
  if (severity === 'warning') return 'P2';
  return 'P3';
}

function ensureTier(summaryByTier, tier) {
  if (!summaryByTier[tier]) {
    summaryByTier[tier] = {
      incidents: 0,
      open: 0,
      resolved: 0,
      ack: { measured: 0, met: 0, breached: 0 },
      resolve: { measured: 0, met: 0, breached: 0 },
    };
  }
  return summaryByTier[tier];
}

function findFirstEventTime(events, action, channels) {
  if (!Array.isArray(events)) return NaN;
  const candidates = events
    .filter((event) => event?.action === action && channels.includes(event?.channel))
    .map((event) => safeMs(event?.timestamp))
    .filter((value) => Number.isFinite(value));
  if (candidates.length === 0) return NaN;
  return Math.min(...candidates);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const config = {
    windowDays: envInt('ONCALL_WINDOW_DAYS', 30),
    incidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    automationStateFile: process.env.INCIDENT_AUTOMATION_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'),
    reliabilityFile: process.env.RELIABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/reliability-summary.json'),
    dashboardFile: process.env.ONCALL_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/oncall-dashboard.md'),
    executiveReportFile: process.env.ONCALL_EXECUTIVE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/executive-sla-report.json'),
    auditFile: process.env.ONCALL_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/executive-audit-trail.jsonl'),
    postmortemDir: process.env.POSTMORTEM_OUTPUT_DIR || path.resolve(process.cwd(), 'docs/postmortems'),
  };

  const incidentsState = await readJson(config.incidentsFile, { incidents: [] });
  const incidentsRaw = Array.isArray(incidentsState.incidents) ? incidentsState.incidents : [];
  const automationState = await readJson(config.automationStateFile, { incidents: {} });
  const automationRecords = (automationState && typeof automationState === 'object' && !Array.isArray(automationState) && typeof automationState.incidents === 'object' && automationState.incidents)
    ? automationState.incidents
    : {};
  const reliability = await readJson(config.reliabilityFile, null);

  const windowStartMs = nowMs - (config.windowDays * 24 * 60 * 60 * 1000);
  const incidents = incidentsRaw.filter((incident) => {
    const startedAtMs = safeMs(incident.startedAt);
    return Number.isFinite(startedAtMs) && startedAtMs >= windowStartMs;
  });

  const summaryByTier = {};
  const ackSamples = [];
  const resolveSamples = [];
  const openIncidents = [];
  const auditEntries = [];
  const recent = [];

  for (const incident of incidents) {
    const incidentId = incident.id;
    const severity = incident.maxSeverity || incident.severity || 'info';
    const tier = tierBySeverity(severity);
    const status = incident.status || 'unknown';
    const record = automationRecords[incidentId] || {};
    const sla = record.sla || {};

    const detectedAtMs = safeMs(record?.incident?.detectedAt || incident.detectedAt);
    const resolvedAtMs = safeMs(record?.incident?.resolvedAt || incident.resolvedAt);
    const ackAtMs = safeMs(record?.paging?.openedAt) || findFirstEventTime(record.events, 'open', ['paging', 'itsm']);

    const ackTargetMs = Number.isFinite(sla?.ackTargetMinutes) ? sla.ackTargetMinutes * 60_000 : NaN;
    const resolveTargetMs = Number.isFinite(sla?.resolveTargetMinutes) ? sla.resolveTargetMinutes * 60_000 : NaN;

    const ackLatencyMs = (Number.isFinite(detectedAtMs) && Number.isFinite(ackAtMs))
      ? Math.max(0, ackAtMs - detectedAtMs)
      : NaN;
    const resolveLatencyMs = (Number.isFinite(detectedAtMs) && Number.isFinite(resolvedAtMs))
      ? Math.max(0, resolvedAtMs - detectedAtMs)
      : NaN;

    const ackMet = Number.isFinite(ackLatencyMs) && Number.isFinite(ackTargetMs) ? ackLatencyMs <= ackTargetMs : null;
    const resolveMet = Number.isFinite(resolveLatencyMs) && Number.isFinite(resolveTargetMs) ? resolveLatencyMs <= resolveTargetMs : null;

    const tierSummary = ensureTier(summaryByTier, tier);
    tierSummary.incidents += 1;
    if (status === 'open') tierSummary.open += 1;
    if (status === 'resolved') tierSummary.resolved += 1;

    if (Number.isFinite(ackLatencyMs) && Number.isFinite(ackTargetMs)) {
      tierSummary.ack.measured += 1;
      if (ackMet) tierSummary.ack.met += 1;
      else tierSummary.ack.breached += 1;
      ackSamples.push(ackLatencyMs);
    }

    if (Number.isFinite(resolveLatencyMs) && Number.isFinite(resolveTargetMs)) {
      tierSummary.resolve.measured += 1;
      if (resolveMet) tierSummary.resolve.met += 1;
      else tierSummary.resolve.breached += 1;
      resolveSamples.push(resolveLatencyMs);
    }

    const expectedPostmortem = path.resolve(config.postmortemDir, `${sanitizeFileName(incidentId)}.md`);
    const hasPostmortem = await fileExists(expectedPostmortem);

    const timeline = {
      startedAt: fmtIso(record?.incident?.startedAt || incident.startedAt),
      detectedAt: fmtIso(record?.incident?.detectedAt || incident.detectedAt),
      ackAt: fmtIso(record?.paging?.openedAt || null),
      resolvedAt: fmtIso(record?.incident?.resolvedAt || incident.resolvedAt),
    };

    const incidentSnapshot = {
      id: incidentId,
      status,
      severity,
      tier,
      owner: record.owner || null,
      ackLatencyMs: Number.isFinite(ackLatencyMs) ? ackLatencyMs : null,
      ackTargetMs: Number.isFinite(ackTargetMs) ? ackTargetMs : null,
      ackMet,
      resolveLatencyMs: Number.isFinite(resolveLatencyMs) ? resolveLatencyMs : null,
      resolveTargetMs: Number.isFinite(resolveTargetMs) ? resolveTargetMs : null,
      resolveMet,
      timeline,
      pagingExternalId: record?.paging?.externalId || null,
      ticketExternalId: record?.ticket?.externalId || null,
      postmortemFile: hasPostmortem ? expectedPostmortem : null,
    };

    recent.push({
      ...incidentSnapshot,
      sortTime: safeMs(record?.incident?.startedAt || incident.startedAt),
    });

    if (status === 'open') {
      const elapsedResolveMs = Number.isFinite(detectedAtMs) ? Math.max(0, nowMs - detectedAtMs) : NaN;
      const burnRatePct = Number.isFinite(resolveTargetMs) && resolveTargetMs > 0 && Number.isFinite(elapsedResolveMs)
        ? Number((elapsedResolveMs / resolveTargetMs * 100).toFixed(2))
        : null;
      openIncidents.push({
        id: incidentId,
        tier,
        severity,
        owner: record.owner || 'unassigned',
        detectedAt: fmtIso(record?.incident?.detectedAt || incident.detectedAt),
        elapsed: fmtMinutes(elapsedResolveMs),
        resolveTarget: Number.isFinite(resolveTargetMs) ? fmtMinutes(resolveTargetMs) : 'n/a',
        burnRatePct,
      });
    }

    auditEntries.push({
      timestamp: nowIso,
      source: 'phase15-oncall-dashboard',
      incidentId,
      status,
      severity,
      tier,
      owner: record.owner || null,
      ack: {
        latencyMs: Number.isFinite(ackLatencyMs) ? ackLatencyMs : null,
        targetMs: Number.isFinite(ackTargetMs) ? ackTargetMs : null,
        met: ackMet,
      },
      resolve: {
        latencyMs: Number.isFinite(resolveLatencyMs) ? resolveLatencyMs : null,
        targetMs: Number.isFinite(resolveTargetMs) ? resolveTargetMs : null,
        met: resolveMet,
      },
      integrations: {
        pagingExternalId: record?.paging?.externalId || null,
        ticketExternalId: record?.ticket?.externalId || null,
      },
      postmortemFile: hasPostmortem ? expectedPostmortem : null,
    });
  }

  const ackAvg = average(ackSamples);
  const ackP95 = percentile(ackSamples, 95);
  const resolveAvg = average(resolveSamples);
  const resolveP95 = percentile(resolveSamples, 95);

  const report = {
    generatedAt: nowIso,
    windowDays: config.windowDays,
    sources: {
      incidentsFile: config.incidentsFile,
      automationStateFile: config.automationStateFile,
      reliabilityFile: config.reliabilityFile,
      postmortemDir: config.postmortemDir,
    },
    totals: {
      incidents: incidents.length,
      open: openIncidents.length,
      resolved: incidents.filter((incident) => incident.status === 'resolved').length,
    },
    sla: {
      ack: {
        samples: ackSamples.length,
        avgMs: ackAvg,
        p95Ms: ackP95,
        avgMin: Number.isFinite(ackAvg) ? Number((ackAvg / 60_000).toFixed(2)) : null,
        p95Min: Number.isFinite(ackP95) ? Number((ackP95 / 60_000).toFixed(2)) : null,
      },
      resolve: {
        samples: resolveSamples.length,
        avgMs: resolveAvg,
        p95Ms: resolveP95,
        avgMin: Number.isFinite(resolveAvg) ? Number((resolveAvg / 60_000).toFixed(2)) : null,
        p95Min: Number.isFinite(resolveP95) ? Number((resolveP95 / 60_000).toFixed(2)) : null,
      },
      byTier: summaryByTier,
    },
    reliability: reliability || null,
    openIncidents,
    recentIncidents: recent
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
      .slice(0, 20)
      .map(({ sortTime, ...item }) => item),
  };

  await writeJson(config.executiveReportFile, report);

  const auditLines = auditEntries.map((entry) => JSON.stringify(entry));
  await writeText(config.auditFile, auditLines.length > 0 ? `${auditLines.join('\n')}\n` : '');

  const md = [];
  md.push('# On-Call Dashboard');
  md.push('');
  md.push(`- Generated at: ${nowIso}`);
  md.push(`- Window: last ${config.windowDays} days`);
  md.push(`- Incidents file: \`${config.incidentsFile}\``);
  md.push(`- Automation state: \`${config.automationStateFile}\``);
  md.push(`- Executive report: \`${config.executiveReportFile}\``);
  md.push(`- Audit trail: \`${config.auditFile}\``);
  md.push('');
  md.push('## SLA KPI');
  md.push('');
  md.push('| KPI | Value |');
  md.push('|---|---|');
  md.push(`| Incidents (window) | ${report.totals.incidents} |`);
  md.push(`| Open incidents | ${report.totals.open} |`);
  md.push(`| Resolved incidents | ${report.totals.resolved} |`);
  md.push(`| Ack avg | ${Number.isFinite(ackAvg) ? fmtMinutes(ackAvg) : 'n/a'} |`);
  md.push(`| Ack p95 | ${Number.isFinite(ackP95) ? fmtMinutes(ackP95) : 'n/a'} |`);
  md.push(`| Resolve avg | ${Number.isFinite(resolveAvg) ? fmtMinutes(resolveAvg) : 'n/a'} |`);
  md.push(`| Resolve p95 | ${Number.isFinite(resolveP95) ? fmtMinutes(resolveP95) : 'n/a'} |`);
  md.push('');
  md.push('## SLA by Tier');
  md.push('');
  md.push('| Tier | Incidents | Open | Resolved | Ack met | Ack breached | Resolve met | Resolve breached |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const tier of ['P1', 'P2', 'P3']) {
    const item = summaryByTier[tier] || {
      incidents: 0,
      open: 0,
      resolved: 0,
      ack: { met: 0, breached: 0 },
      resolve: { met: 0, breached: 0 },
    };
    md.push(`| ${tier} | ${item.incidents} | ${item.open} | ${item.resolved} | ${item.ack.met} | ${item.ack.breached} | ${item.resolve.met} | ${item.resolve.breached} |`);
  }
  md.push('');
  md.push('## Open Incidents');
  md.push('');
  md.push('| ID | Tier | Severity | Owner | Detected | Elapsed | Resolve target | Burn rate |');
  md.push('|---|---|---|---|---|---|---|---|');
  if (openIncidents.length === 0) {
    md.push('| - | - | - | - | - | - | - | - |');
  } else {
    for (const incident of openIncidents) {
      md.push(`| ${incident.id} | ${incident.tier} | ${incident.severity} | ${incident.owner} | ${incident.detectedAt} | ${incident.elapsed} | ${incident.resolveTarget} | ${incident.burnRatePct === null ? 'n/a' : `${incident.burnRatePct}%`} |`);
    }
  }
  md.push('');
  md.push('## Recent Incident Snapshot');
  md.push('');
  md.push('| ID | Status | Tier | Ack | Resolve | Ticket | Postmortem |');
  md.push('|---|---|---|---|---|---|---|');
  if (report.recentIncidents.length === 0) {
    md.push('| - | - | - | - | - | - | - |');
  } else {
    for (const incident of report.recentIncidents) {
      md.push(`| ${incident.id} | ${incident.status} | ${incident.tier} | ${incident.ackMet === null ? 'n/a' : incident.ackMet ? 'met' : 'breach'} | ${incident.resolveMet === null ? 'n/a' : incident.resolveMet ? 'met' : 'breach'} | ${incident.ticketExternalId || 'n/a'} | ${incident.postmortemFile ? 'yes' : 'no'} |`);
    }
  }
  md.push('');

  await writeText(config.dashboardFile, md.join('\n'));

  console.log(`On-call dashboard: ${config.dashboardFile}`);
  console.log(`Executive SLA report: ${config.executiveReportFile}`);
  console.log(`Executive audit trail: ${config.auditFile}`);
  console.log(`[ONCALL] incidents=${report.totals.incidents} open=${report.totals.open} resolved=${report.totals.resolved}`);
}

main().catch((error) => {
  console.error(`Unexpected phase15 dashboard failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
