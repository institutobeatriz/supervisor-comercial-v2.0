import fs from 'node:fs/promises';
import path from 'node:path';

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
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

function safeMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function toMinutes(ms) {
  if (ms === null || ms === undefined) return null;
  return Number((ms / 60_000).toFixed(2));
}

function toSeconds(ms) {
  if (ms === null || ms === undefined) return null;
  return Number((ms / 1_000).toFixed(2));
}

function fmt(value, suffix = '') {
  return value === null || value === undefined ? 'n/a' : `${value}${suffix}`;
}

async function main() {
  const incidentsFile = process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json');
  const reportFile = process.env.RELIABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/reliability-summary.json');
  const windowDays = envInt('RELIABILITY_WINDOW_DAYS', 30);
  const enforceTargets = envBool('RELIABILITY_ENFORCE_TARGETS', false);
  const targetMttrMinutes = envFloat('RELIABILITY_TARGET_MTTR_MIN', 120);
  const targetMttdSeconds = envFloat('RELIABILITY_TARGET_MTTD_SEC', 300);
  const maxOpenIncidents = envInt('RELIABILITY_MAX_OPEN_INCIDENTS', 0);

  const state = await readJson(incidentsFile, { version: 1, activeIncidentId: null, incidents: [] });
  const incidents = Array.isArray(state.incidents) ? state.incidents : [];

  const nowMs = Date.now();
  const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = incidents.filter((inc) => {
    const startedAtMs = safeMs(inc.startedAt);
    return Number.isFinite(startedAtMs) && startedAtMs >= windowStartMs;
  });

  const openIncidents = inWindow.filter((inc) => inc.status === 'open');
  const resolvedIncidents = inWindow.filter((inc) => inc.status === 'resolved');

  const mttrSamples = resolvedIncidents
    .map((inc) => (typeof inc.durationMs === 'number' ? inc.durationMs : null))
    .filter((v) => typeof v === 'number');

  const mttdSamples = inWindow
    .map((inc) => {
      if (typeof inc.mttdMs === 'number') return inc.mttdMs;
      const startedAtMs = safeMs(inc.startedAt);
      const detectedAtMs = safeMs(inc.detectedAt);
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(detectedAtMs)) return null;
      return Math.max(0, detectedAtMs - startedAtMs);
    })
    .filter((v) => typeof v === 'number');

  const bySeverity = {};
  for (const inc of inWindow) {
    const sev = inc.maxSeverity || inc.severity || 'unknown';
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }

  const mttrAvgMs = average(mttrSamples);
  const mttrP95Ms = percentile(mttrSamples, 95);
  const mttdAvgMs = average(mttdSamples);
  const mttdP95Ms = percentile(mttdSamples, 95);

  const summary = {
    generatedAt: new Date().toISOString(),
    windowDays,
    incidentsFile,
    totals: {
      totalIncidents: inWindow.length,
      openIncidents: openIncidents.length,
      resolvedIncidents: resolvedIncidents.length,
    },
    bySeverity,
    mttd: {
      samples: mttdSamples.length,
      avgMs: mttdAvgMs,
      p95Ms: mttdP95Ms,
      avgSec: toSeconds(mttdAvgMs),
      p95Sec: toSeconds(mttdP95Ms),
    },
    mttr: {
      samples: mttrSamples.length,
      avgMs: mttrAvgMs,
      p95Ms: mttrP95Ms,
      avgMin: toMinutes(mttrAvgMs),
      p95Min: toMinutes(mttrP95Ms),
    },
    targets: {
      enforce: enforceTargets,
      maxOpenIncidents,
      targetMttrMinutes,
      targetMttdSeconds,
    },
  };

  await writeJson(reportFile, summary);

  console.log(`Reliability report: ${reportFile}`);
  console.log(`[RELIABILITY] incidents=${summary.totals.totalIncidents} open=${summary.totals.openIncidents} resolved=${summary.totals.resolvedIncidents}`);
  console.log(`[RELIABILITY] MTTD avg=${fmt(summary.mttd.avgSec, 's')} p95=${fmt(summary.mttd.p95Sec, 's')}`);
  console.log(`[RELIABILITY] MTTR avg=${fmt(summary.mttr.avgMin, 'min')} p95=${fmt(summary.mttr.p95Min, 'min')}`);

  if (!enforceTargets) return;

  const violations = [];
  if (summary.totals.openIncidents > maxOpenIncidents) {
    violations.push(`open incidents ${summary.totals.openIncidents} > ${maxOpenIncidents}`);
  }
  if (summary.mttr.avgMin !== null && summary.mttr.avgMin > targetMttrMinutes) {
    violations.push(`MTTR avg ${summary.mttr.avgMin}min > target ${targetMttrMinutes}min`);
  }
  if (summary.mttd.avgSec !== null && summary.mttd.avgSec > targetMttdSeconds) {
    violations.push(`MTTD avg ${summary.mttd.avgSec}s > target ${targetMttdSeconds}s`);
  }

  if (violations.length > 0) {
    console.error('[RELIABILITY] Target violations:');
    for (const v of violations) console.error(` - ${v}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected reliability metrics failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
