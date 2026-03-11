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

function nowIso() {
  return new Date().toISOString();
}

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function statusSeverity(status) {
  const val = String(status || 'unknown').toLowerCase();
  if (val === 'fail') return 'critical';
  if (val === 'warn') return 'warning';
  if (val === 'pass') return 'info';
  return 'warning';
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

async function appendLine(filePath, line) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf-8');
}

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function writeJsonLines(filePath, entries) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = entries.map((entry) => JSON.stringify(entry)).join('\n');
  await fs.writeFile(filePath, content ? `${content}\n` : '', 'utf-8');
}

function tail(arr, size) {
  if (!Array.isArray(arr) || arr.length <= size) return arr;
  return arr.slice(arr.length - size);
}

function reportAgeMinutes(report, nowMs) {
  const generatedAt = report?.generatedAt || report?.summary?.generatedAt || null;
  const tsMs = parseMs(generatedAt);
  if (!Number.isFinite(tsMs)) return null;
  return round((nowMs - tsMs) / 60_000, 2);
}

function violationKey(item) {
  return `${String(item?.code || 'unknown')}::${String(item?.message || '').trim()}`;
}

function createEvent(cursor, timestamp, payload) {
  return {
    cursor,
    id: `obs-stream-${cursor}`,
    timestamp,
    ...payload,
  };
}

async function main() {
  const ts = nowIso();
  const nowMs = parseMs(ts);

  const cfg = {
    observabilityReportFile: process.env.FULLCYCLE_CONNECTOR_OBSERVABILITY_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-report.json'),
    productizationReportFile: process.env.FULLCYCLE_CONNECTOR_PRODUCTIZATION_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-productization-report.json'),
    apiGovernanceReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-governance-report.json'),
    streamStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-state.json'),
    streamEventsFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_EVENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-stream-events.jsonl'),
    streamReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    streamDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-realtime.md'),
    streamAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-audit.jsonl'),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ENFORCE_TARGETS', false),
    requireObservabilityPass: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_OBSERVABILITY_PASS', true),
    requireProductizationPass: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_PRODUCTIZATION_PASS', true),
    requireApiGovernancePass: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_GOVERNANCE_PASS', true),
    requireApiNoBlockingViolations: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_REQUIRE_API_NO_BLOCKING_VIOLATIONS', true),
    maxOpenCriticalIncidents: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_OPEN_CRITICAL_INCIDENTS', 0)),
    maxReportAgeMin: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_REPORT_AGE_MIN', 240)),
    maxEventHistory: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_MAX_EVENT_HISTORY', 2000)),
  };

  const [observabilityReport, productizationReport, apiGovernanceReport, prevState, existingEvents] = await Promise.all([
    readJson(cfg.observabilityReportFile, null),
    readJson(cfg.productizationReportFile, null),
    readJson(cfg.apiGovernanceReportFile, null),
    readJson(cfg.streamStateFile, {}),
    readJsonLines(cfg.streamEventsFile),
  ]);

  const sourceStatus = {
    observability: String(observabilityReport?.status || 'unknown').toLowerCase(),
    productization: String(productizationReport?.status || 'unknown').toLowerCase(),
    apiGovernance: String(apiGovernanceReport?.status || 'unknown').toLowerCase(),
  };

  const apiBlockingViolations = Number(apiGovernanceReport?.summary?.blockingViolations ?? 0);
  const openCriticalIncidents = Number(observabilityReport?.summary?.openCriticalIncidents ?? 0);
  const reportAges = {
    observabilityMinutes: reportAgeMinutes(observabilityReport, nowMs),
    productizationMinutes: reportAgeMinutes(productizationReport, nowMs),
    apiGovernanceMinutes: reportAgeMinutes(apiGovernanceReport, nowMs),
  };

  const violations = [];
  if (cfg.requireObservabilityPass && sourceStatus.observability !== 'pass') {
    violations.push({
      code: 'observability_not_pass',
      blocking: true,
      message: `observability status is ${sourceStatus.observability}, expected pass`,
    });
  }
  if (cfg.requireProductizationPass && sourceStatus.productization !== 'pass') {
    violations.push({
      code: 'productization_not_pass',
      blocking: true,
      message: `productization status is ${sourceStatus.productization}, expected pass`,
    });
  }
  if (cfg.requireApiGovernancePass && sourceStatus.apiGovernance !== 'pass') {
    violations.push({
      code: 'api_governance_not_pass',
      blocking: true,
      message: `api governance status is ${sourceStatus.apiGovernance}, expected pass`,
    });
  }
  if (cfg.requireApiNoBlockingViolations && apiBlockingViolations > 0) {
    violations.push({
      code: 'api_governance_blocking_violations_present',
      blocking: true,
      message: `api governance has ${apiBlockingViolations} blocking violation(s)`,
    });
  }
  if (openCriticalIncidents > cfg.maxOpenCriticalIncidents) {
    violations.push({
      code: 'open_critical_incidents_exceeded',
      blocking: true,
      message: `open critical incidents=${openCriticalIncidents} exceeds max ${cfg.maxOpenCriticalIncidents}`,
    });
  }
  for (const [name, age] of Object.entries(reportAges)) {
    if (Number.isFinite(age) && age > cfg.maxReportAgeMin) {
      violations.push({
        code: `report_stale_${name}`,
        blocking: true,
        message: `${name} age ${age}min exceeds max ${cfg.maxReportAgeMin}min`,
      });
    }
  }

  const previousSourceStatus = prevState?.sourceStatus && typeof prevState.sourceStatus === 'object'
    ? prevState.sourceStatus
    : {};
  const previousViolationKeys = new Set(Array.isArray(prevState?.activeViolationKeys) ? prevState.activeViolationKeys : []);
  const activeViolationKeys = new Set(violations.map(violationKey));

  let cursor = Number(prevState?.cursor || 0);
  const generatedEvents = [];

  generatedEvents.push(createEvent(++cursor, ts, {
    type: 'snapshot',
    source: 'observability_realtime',
    severity: 'info',
    status: 'ok',
    message: 'realtime snapshot generated',
    metadata: {
      sourceStatus,
      openCriticalIncidents,
      apiBlockingViolations,
      reportAges,
    },
  }));

  for (const [source, current] of Object.entries(sourceStatus)) {
    const previous = String(previousSourceStatus[source] || 'unknown').toLowerCase();
    if (previous !== current) {
      generatedEvents.push(createEvent(++cursor, ts, {
        type: 'status_changed',
        source,
        severity: statusSeverity(current),
        status: current,
        message: `${source} status changed from ${previous} to ${current}`,
        metadata: { previous, current },
      }));
    }
  }

  for (const violation of violations) {
    const key = violationKey(violation);
    if (!previousViolationKeys.has(key)) {
      generatedEvents.push(createEvent(++cursor, ts, {
        type: 'violation_opened',
        source: 'governance',
        severity: violation.blocking ? 'critical' : 'warning',
        status: 'open',
        code: violation.code,
        message: violation.message,
      }));
    }
  }

  for (const key of previousViolationKeys) {
    if (!activeViolationKeys.has(key)) {
      generatedEvents.push(createEvent(++cursor, ts, {
        type: 'violation_resolved',
        source: 'governance',
        severity: 'info',
        status: 'resolved',
        message: key,
      }));
    }
  }

  const mergedEvents = tail([...existingEvents, ...generatedEvents], cfg.maxEventHistory);
  await writeJsonLines(cfg.streamEventsFile, mergedEvents);

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const state = {
    version: 1,
    generatedAt: ts,
    status,
    cursor,
    sourceStatus,
    openCriticalIncidents,
    apiBlockingViolations,
    activeViolationKeys: [...activeViolationKeys],
    reportAges,
    latestEventId: mergedEvents.length > 0 ? mergedEvents[mergedEvents.length - 1].id : null,
  };
  await writeJson(cfg.streamStateFile, state);

  const report = {
    generatedAt: ts,
    status,
    summary: {
      cursor,
      eventsGenerated: generatedEvents.length,
      totalEventsRetained: mergedEvents.length,
      openCriticalIncidents,
      apiBlockingViolations,
      sourceStatus,
      reportAges,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
    },
    config: cfg,
    violations,
    generatedEvents,
  };
  await writeJson(cfg.streamReportFile, report);

  const dashboard = [];
  dashboard.push('# Fullcycle Connectors Realtime Observability');
  dashboard.push('');
  dashboard.push(`- Generated at: ${ts}`);
  dashboard.push(`- Status: ${status.toUpperCase()}`);
  dashboard.push(`- Cursor: ${cursor}`);
  dashboard.push(`- Events generated this run: ${generatedEvents.length}`);
  dashboard.push(`- Total events retained: ${mergedEvents.length}`);
  dashboard.push('');
  dashboard.push('| Source | Status |');
  dashboard.push('|---|---|');
  dashboard.push(`| Observability | ${sourceStatus.observability} |`);
  dashboard.push(`| Productization | ${sourceStatus.productization} |`);
  dashboard.push(`| API governance | ${sourceStatus.apiGovernance} |`);
  dashboard.push('');
  dashboard.push('| Metric | Value |');
  dashboard.push('|---|---:|');
  dashboard.push(`| Open critical incidents | ${openCriticalIncidents} |`);
  dashboard.push(`| API blocking violations | ${apiBlockingViolations} |`);
  dashboard.push(`| Observability age (min) | ${reportAges.observabilityMinutes ?? 'n/a'} |`);
  dashboard.push(`| Productization age (min) | ${reportAges.productizationMinutes ?? 'n/a'} |`);
  dashboard.push(`| API governance age (min) | ${reportAges.apiGovernanceMinutes ?? 'n/a'} |`);
  dashboard.push('');
  dashboard.push('## Latest Events');
  dashboard.push('');
  const latestEvents = tail(mergedEvents, 20);
  if (latestEvents.length === 0) {
    dashboard.push('- none');
  } else {
    for (const event of latestEvents) {
      dashboard.push(`- [${event.severity}] #${event.cursor} ${event.type} (${event.source}): ${event.message}`);
    }
  }
  dashboard.push('');
  dashboard.push('## Violations');
  dashboard.push('');
  if (violations.length === 0) {
    dashboard.push('- none');
  } else {
    for (const violation of violations) {
      dashboard.push(`- [${violation.blocking ? 'BLOCKING' : 'INFO'}] ${violation.code}: ${violation.message}`);
    }
  }
  dashboard.push('');
  await writeText(cfg.streamDashboardFile, dashboard.join('\n'));

  await appendLine(cfg.streamAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase27-observability-realtime-stream',
    status,
    summary: report.summary,
    violations,
    streamStateFile: cfg.streamStateFile,
    streamEventsFile: cfg.streamEventsFile,
    streamReportFile: cfg.streamReportFile,
  }));

  console.log(`Observability realtime report: ${cfg.streamReportFile}`);
  console.log(`Observability realtime dashboard: ${cfg.streamDashboardFile}`);
  console.log(`Observability realtime state: ${cfg.streamStateFile}`);
  console.log(`Observability realtime events: ${cfg.streamEventsFile}`);
  console.log(`[OBS-REALTIME] status=${status} cursor=${cursor} generated=${generatedEvents.length} violations=${violations.length}`);

  if (status === 'fail') {
    for (const violation of blockingViolations) {
      console.error(`[OBS-REALTIME] ${violation.code}: ${violation.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase27 realtime failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
