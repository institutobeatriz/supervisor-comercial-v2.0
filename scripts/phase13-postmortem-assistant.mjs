import fs from 'node:fs/promises';
import path from 'node:path';

function envBool(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function sanitizeFileName(value) {
  return String(value || 'incident-unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function formatIso(value) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'n/a';
  return parsed.toISOString();
}

function formatMinutes(ms) {
  if (typeof ms !== 'number') return 'n/a';
  return `${(ms / 60_000).toFixed(2)} min`;
}

function formatSeconds(ms) {
  if (typeof ms !== 'number') return 'n/a';
  return `${(ms / 1_000).toFixed(2)} s`;
}

function renderFailureList(failures) {
  if (!Array.isArray(failures) || failures.length === 0) return ['- none'];
  return failures.map((failure) => {
    const details = failure.message || (failure.status !== null && failure.status !== undefined ? `status=${failure.status}` : 'no details');
    return `- ${failure.name || 'unknown_check'}: ${details}`;
  });
}

function renderBreachList(breaches) {
  if (!Array.isArray(breaches) || breaches.length === 0) return ['- none'];
  return breaches.map((breach) => (
    `- ${breach.check || 'unknown_check'}: ${breach.availabilityPct ?? 'n/a'}% < ${breach.targetPct ?? 'n/a'}%`
  ));
}

function renderAlertAttempts(alertEvents) {
  if (!Array.isArray(alertEvents) || alertEvents.length === 0) return ['- none'];

  const lines = [];
  for (const event of alertEvents) {
    lines.push(`- ${formatIso(event.timestamp)}:`);
    const attempts = Array.isArray(event.attempts) ? event.attempts : [];
    if (attempts.length === 0) {
      lines.push('  - no alert attempts');
      continue;
    }
    for (const attempt of attempts) {
      lines.push(`  - ${attempt.target || 'unknown'} -> ok=${attempt.ok ? 'true' : 'false'} status=${attempt.status ?? 'n/a'}`);
    }
  }
  return lines;
}

function buildTimelineRows(incident) {
  const rows = [];
  if (incident.startedAt) rows.push(`| ${formatIso(incident.startedAt)} | started | first failing signal observed |`);
  if (incident.detectedAt) rows.push(`| ${formatIso(incident.detectedAt)} | detected | monitor classified as incident |`);
  if (incident.lastSeenAt) rows.push(`| ${formatIso(incident.lastSeenAt)} | last_seen | last monitor observation during incident |`);
  if (incident.resolvedAt) rows.push(`| ${formatIso(incident.resolvedAt)} | resolved | monitor marked incident as recovered |`);
  if (rows.length === 0) rows.push('| n/a | unknown | missing incident timestamps |');
  return rows;
}

function buildPostmortemMarkdown(incident, sourceFile) {
  const id = incident.id || 'incident-unknown';
  const status = incident.status || 'unknown';
  const severity = incident.maxSeverity || incident.severity || 'unknown';

  const lines = [];
  lines.push(`# Postmortem - ${id}`);
  lines.push('');
  lines.push('## Metadata');
  lines.push(`- incident_id: ${id}`);
  lines.push(`- status: ${status}`);
  lines.push(`- max_severity: ${severity}`);
  lines.push(`- started_at: ${formatIso(incident.startedAt)}`);
  lines.push(`- detected_at: ${formatIso(incident.detectedAt)}`);
  lines.push(`- resolved_at: ${formatIso(incident.resolvedAt)}`);
  lines.push(`- mttd: ${formatSeconds(incident.mttdMs)}`);
  lines.push(`- duration: ${formatMinutes(incident.durationMs)}`);
  lines.push(`- source_incidents_file: ${sourceFile}`);
  lines.push(`- generated_at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Impact Summary');
  lines.push('- Scope: [to fill by owner]');
  lines.push('- User impact: [to fill by owner]');
  lines.push('- Business impact: [to fill by owner]');
  lines.push('');
  lines.push('## Trigger Signals');
  lines.push('### Critical failures');
  lines.push(...renderFailureList(incident.criticalFailures));
  lines.push('');
  lines.push('### SLO breaches');
  lines.push(...renderBreachList(incident.sloBreaches));
  lines.push('');
  lines.push('### Alert dispatch attempts');
  lines.push(...renderAlertAttempts(incident.alertEvents));
  lines.push('');
  lines.push('## Technical Timeline');
  lines.push('| Timestamp | Event | Evidence |');
  lines.push('|---|---|---|');
  lines.push(...buildTimelineRows(incident));
  lines.push('');
  lines.push('## Root Cause');
  lines.push('- Hypothesis: [to validate with logs and traces]');
  lines.push('- Confirmed cause: [to fill]');
  lines.push('');
  lines.push('## Corrective Actions');
  lines.push('1. [Immediate correction]');
  lines.push('2. [Validation step]');
  lines.push('');
  lines.push('## Preventive Actions');
  lines.push('1. [Permanent fix]');
  lines.push('2. [Test/monitoring hardening]');
  lines.push('');
  lines.push('## QA Checklist');
  lines.push('- [ ] Timeline validated with logs');
  lines.push('- [ ] Root cause reviewed by owner');
  lines.push('- [ ] Corrective action deployed');
  lines.push('- [ ] Preventive action added to backlog');
  lines.push('- [ ] Stakeholders notified');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const incidentsFile = process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json');
  const outputDir = process.env.POSTMORTEM_OUTPUT_DIR || path.resolve(process.cwd(), 'docs/postmortems');
  const includeOpen = envBool('POSTMORTEM_INCLUDE_OPEN', false);
  const overwrite = envBool('POSTMORTEM_OVERWRITE', false);
  const maxItems = envInt('POSTMORTEM_MAX_ITEMS', 50);

  const state = await readJson(incidentsFile, { incidents: [] });
  const incidents = Array.isArray(state.incidents) ? state.incidents : [];

  const selected = incidents
    .filter((incident) => includeOpen || incident.status === 'resolved')
    .sort((a, b) => Date.parse(b.startedAt || '') - Date.parse(a.startedAt || ''))
    .slice(0, Math.max(0, maxItems));

  await fs.mkdir(outputDir, { recursive: true });

  const generated = [];
  const skipped = [];

  for (const incident of selected) {
    const fileName = `${sanitizeFileName(incident.id || `incident-${Date.now()}`)}.md`;
    const targetFile = path.resolve(outputDir, fileName);
    const alreadyExists = await pathExists(targetFile);

    if (alreadyExists && !overwrite) {
      skipped.push(targetFile);
      continue;
    }

    const markdown = buildPostmortemMarkdown(incident, incidentsFile);
    await writeText(targetFile, markdown);
    generated.push(targetFile);
  }

  const indexLines = [];
  indexLines.push('# Postmortems Index');
  indexLines.push('');
  indexLines.push(`- Generated at: ${new Date().toISOString()}`);
  indexLines.push(`- Incidents source: \`${incidentsFile}\``);
  indexLines.push(`- Include open incidents: ${includeOpen ? 'yes' : 'no'}`);
  indexLines.push(`- Generated files: ${generated.length}`);
  indexLines.push(`- Skipped files: ${skipped.length}`);
  indexLines.push('');
  indexLines.push('## Generated');
  if (generated.length === 0) {
    indexLines.push('- none');
  } else {
    for (const filePath of generated) indexLines.push(`- ${filePath}`);
  }
  indexLines.push('');
  indexLines.push('## Skipped');
  if (skipped.length === 0) {
    indexLines.push('- none');
  } else {
    for (const filePath of skipped) indexLines.push(`- ${filePath}`);
  }
  indexLines.push('');

  const indexFile = path.resolve(outputDir, 'index.md');
  await writeText(indexFile, indexLines.join('\n'));

  console.log(`Postmortem output dir: ${outputDir}`);
  console.log(`[POSTMORTEM] generated=${generated.length} skipped=${skipped.length} index=${indexFile}`);
}

main().catch((error) => {
  console.error(`Unexpected postmortem assistant failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
