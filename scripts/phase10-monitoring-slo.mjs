import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function envInt(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function envFloat(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

function joinUrl(base, endpoint) {
  return `${normalizeBase(base)}${endpoint}`;
}

async function readJsonFile(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function parseJsonSafe(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function runHttpCheck(check, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(check.url, {
      method: check.method || 'GET',
      headers: check.headers || undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });

    const bodyText = await response.text();
    const bodyJson = parseJsonSafe(bodyText);
    const latencyMs = Date.now() - startedAt;

    const statusOk = check.statuses.includes(response.status);
    const latencyOk = latencyMs <= check.maxLatencyMs;

    let contentOk = true;
    let contentMessage = '';
    if (check.expectField) {
      const actualValue = bodyJson?.[check.expectField];
      contentOk = actualValue === check.expectValue;
      if (!contentOk) {
        contentMessage = `expected ${check.expectField}=${check.expectValue} got ${String(actualValue)}`;
      }
    }

    const ok = statusOk && latencyOk && contentOk;
    const messages = [];
    if (!statusOk) messages.push(`status=${response.status}`);
    if (!latencyOk) messages.push(`latency=${latencyMs}ms>${check.maxLatencyMs}ms`);
    if (!contentOk && contentMessage) messages.push(contentMessage);

    return {
      name: check.name,
      type: 'http',
      scope: check.scope,
      critical: check.critical,
      sloTarget: check.sloTarget,
      skipped: false,
      ok,
      status: response.status,
      latencyMs,
      target: check.url,
      message: messages.join('; '),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      name: check.name,
      type: 'http',
      scope: check.scope,
      critical: check.critical,
      sloTarget: check.sloTarget,
      skipped: false,
      ok: false,
      status: null,
      latencyMs,
      target: check.url,
      message: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function runDockerHealthCheck({
  name,
  container,
  critical,
  sloTarget,
  timeoutMs,
  required,
}) {
  const startedAt = Date.now();
  const inspected = spawnSync(
    'docker',
    [
      'inspect',
      '--format={{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      container,
    ],
    { encoding: 'utf8', timeout: timeoutMs },
  );
  const latencyMs = Date.now() - startedAt;

  if (inspected.error) {
    const message = inspected.error.message || 'docker inspect failed';
    return {
      name,
      type: 'docker',
      scope: 'worker',
      critical,
      sloTarget,
      skipped: !required,
      ok: !required,
      status: null,
      latencyMs,
      target: container,
      message: required ? message : `optional check skipped: ${message}`,
      checkedAt: new Date().toISOString(),
    };
  }

  if (inspected.status !== 0) {
    const err = (inspected.stderr || inspected.stdout || '').trim() || 'docker inspect non-zero';
    return {
      name,
      type: 'docker',
      scope: 'worker',
      critical,
      sloTarget,
      skipped: !required,
      ok: !required,
      status: null,
      latencyMs,
      target: container,
      message: required ? err : `optional check skipped: ${err}`,
      checkedAt: new Date().toISOString(),
    };
  }

  const status = (inspected.stdout || '').trim().toLowerCase();
  const ok = status === 'healthy' || status === 'running';
  return {
    name,
    type: 'docker',
    scope: 'worker',
    critical,
    sloTarget,
    skipped: false,
    ok,
    status,
    latencyMs,
    target: container,
    message: ok ? '' : `container status=${status || 'unknown'}`,
    checkedAt: new Date().toISOString(),
  };
}

function computeAvailability(runs) {
  const counters = {};

  for (const run of runs) {
    for (const check of run.checks || []) {
      if (check.skipped) continue;
      if (!counters[check.name]) counters[check.name] = { ok: 0, total: 0 };
      counters[check.name].total += 1;
      if (check.ok) counters[check.name].ok += 1;
    }
  }

  const output = {};
  for (const [name, data] of Object.entries(counters)) {
    const availabilityPct = data.total > 0
      ? Number(((data.ok / data.total) * 100).toFixed(2))
      : 100;
    output[name] = { ...data, availabilityPct };
  }
  return output;
}

async function sendAlertWebhook({
  webhookUrl,
  bearerToken,
  payload,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.text()).slice(0, 500),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildIncidentText(payload) {
  const summary = payload.summary || {};
  const failures = Array.isArray(summary.criticalFailures) ? summary.criticalFailures : [];
  const sloBreaches = Array.isArray(summary.sloBreaches) ? summary.sloBreaches : [];

  const lines = [
    `INCIDENT: ${String(payload.severity || 'unknown').toUpperCase()}`,
    `Timestamp: ${payload.timestamp}`,
  ];

  if (failures.length > 0) {
    lines.push('Critical failures:');
    for (const failure of failures) {
      lines.push(`- ${failure.name}: ${failure.message || failure.status || 'failed'}`);
    }
  }

  if (sloBreaches.length > 0) {
    lines.push('SLO breaches:');
    for (const breach of sloBreaches) {
      lines.push(`- ${breach.check}: ${breach.availabilityPct}% < ${breach.targetPct}%`);
    }
  }

  if (summary.reportFile) {
    lines.push(`Report: ${summary.reportFile}`);
  }

  return lines.join('\n');
}

async function sendSlackAlert({
  webhookUrl,
  payload,
  timeoutMs,
}) {
  const text = buildIncidentText(payload);
  return sendAlertWebhook({
    webhookUrl,
    bearerToken: '',
    payload: { text },
    timeoutMs,
  });
}

async function sendDiscordAlert({
  webhookUrl,
  payload,
  timeoutMs,
}) {
  const content = buildIncidentText(payload);
  return sendAlertWebhook({
    webhookUrl,
    bearerToken: '',
    payload: { content },
    timeoutMs,
  });
}

async function sendTelegramAlert({
  botToken,
  chatId,
  threadId,
  payload,
  timeoutMs,
}) {
  const text = buildIncidentText(payload);
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (threadId) body.message_thread_id = Number(threadId);

  return sendAlertWebhook({
    webhookUrl: `https://api.telegram.org/bot${botToken}/sendMessage`,
    bearerToken: '',
    payload: body,
    timeoutMs,
  });
}

function printCheck(result) {
  const state = result.skipped ? 'SKIP' : result.ok ? 'OK' : 'FAIL';
  const status = result.status === null ? 'n/a' : String(result.status);
  const message = result.message ? ` ${result.message}` : '';
  console.log(`[${state}] ${result.name} status=${status} latency=${result.latencyMs}ms target=${result.target}${message}`);
}

function severityRank(level) {
  return { info: 1, warning: 2, critical: 3 }[level] || 0;
}

function maxSeverity(a, b) {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function safeParseTime(value, fallbackMs) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function newIncidentId(timestamp) {
  const base = timestamp.replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `inc-${base}-${suffix}`;
}

async function main() {
  const now = new Date();
  const timestamp = now.toISOString();

  const config = {
    apiBase: normalizeBase(process.env.MONITOR_API_BASE || process.env.CI_API_URL || 'http://127.0.0.1:3000'),
    workerBase: process.env.MONITOR_WORKER_BASE ? normalizeBase(process.env.MONITOR_WORKER_BASE) : '',
    timeoutMs: envInt('MONITOR_TIMEOUT_MS', 8_000),
    historySize: envInt('MONITOR_HISTORY_SIZE', 288),
    minSamplesForSlo: envInt('MONITOR_MIN_SAMPLES_FOR_SLO', 12),
    alertCooldownMinutes: envInt('MONITOR_ALERT_COOLDOWN_MINUTES', 30),
    apiSloTarget: envFloat('MONITOR_SLO_API_AVAILABILITY', 99.5),
    workerSloTarget: envFloat('MONITOR_SLO_WORKER_AVAILABILITY', 99.0),
    maxLatencyHealthMs: envInt('MONITOR_MAX_LATENCY_HEALTH_MS', 1_500),
    maxLatencyApiMs: envInt('MONITOR_MAX_LATENCY_API_MS', 3_500),
    monitorStateFile: process.env.MONITOR_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/slo-state.json'),
    monitorReportFile: process.env.MONITOR_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/last-report.json'),
    monitorIncidentsFile: process.env.MONITOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/incidents.json'),
    expectedIntervalMinutes: envInt('MONITOR_EXPECTED_INTERVAL_MINUTES', 5),
    alertWebhookUrl: process.env.MONITOR_ALERT_WEBHOOK_URL || '',
    alertBearerToken: process.env.MONITOR_ALERT_BEARER_TOKEN || '',
    alertSlackWebhookUrl: process.env.MONITOR_ALERT_SLACK_WEBHOOK_URL || '',
    alertDiscordWebhookUrl: process.env.MONITOR_ALERT_DISCORD_WEBHOOK_URL || '',
    alertTelegramBotToken: process.env.MONITOR_ALERT_TELEGRAM_BOT_TOKEN || '',
    alertTelegramChatId: process.env.MONITOR_ALERT_TELEGRAM_CHAT_ID || '',
    alertTelegramThreadId: process.env.MONITOR_ALERT_TELEGRAM_THREAD_ID || '',
    exitOnIncident: envBool('MONITOR_EXIT_ON_INCIDENT', true),
    dockerWorkerCheck: envBool('MONITOR_DOCKER_WORKER_CHECK', true),
    dockerWorkerContainer: process.env.MONITOR_DOCKER_WORKER_CONTAINER || 'supervisor-worker',
    dockerWorkerRequired: envBool('MONITOR_DOCKER_WORKER_REQUIRED', false),
  };

  const checks = [
    {
      name: 'api_health',
      scope: 'api',
      critical: true,
      sloTarget: config.apiSloTarget,
      url: joinUrl(config.apiBase, '/health'),
      statuses: [200],
      expectField: 'status',
      expectValue: 'healthy',
      maxLatencyMs: config.maxLatencyHealthMs,
    },
    {
      name: 'api_ready',
      scope: 'api',
      critical: true,
      sloTarget: config.apiSloTarget,
      url: joinUrl(config.apiBase, '/ready'),
      statuses: [200],
      expectField: 'status',
      expectValue: 'ready',
      maxLatencyMs: config.maxLatencyHealthMs,
    },
    {
      name: 'api_dashboard_kpis',
      scope: 'api',
      critical: false,
      sloTarget: config.apiSloTarget,
      url: joinUrl(config.apiBase, '/api/dashboard/kpis'),
      statuses: [200],
      maxLatencyMs: config.maxLatencyApiMs,
    },
    {
      name: 'api_alerts',
      scope: 'api',
      critical: false,
      sloTarget: config.apiSloTarget,
      url: joinUrl(config.apiBase, '/api/alerts'),
      statuses: [200],
      maxLatencyMs: config.maxLatencyApiMs,
    },
  ];

  if (config.workerBase) {
    checks.push(
      {
        name: 'worker_health',
        scope: 'worker',
        critical: true,
        sloTarget: config.workerSloTarget,
        url: joinUrl(config.workerBase, '/health'),
        statuses: [200],
        expectField: 'status',
        expectValue: 'healthy',
        maxLatencyMs: config.maxLatencyHealthMs,
      },
      {
        name: 'worker_ready',
        scope: 'worker',
        critical: true,
        sloTarget: config.workerSloTarget,
        url: joinUrl(config.workerBase, '/ready'),
        statuses: [200],
        expectField: 'status',
        expectValue: 'ready',
        maxLatencyMs: config.maxLatencyHealthMs,
      },
    );
  }

  const currentChecks = [];
  for (const check of checks) {
    currentChecks.push(await runHttpCheck(check, config.timeoutMs));
  }

  if (config.dockerWorkerCheck) {
    currentChecks.push(
      runDockerHealthCheck({
        name: 'worker_container_health',
        container: config.dockerWorkerContainer,
        critical: true,
        sloTarget: config.workerSloTarget,
        timeoutMs: config.timeoutMs,
        required: config.dockerWorkerRequired,
      }),
    );
  }

  const previousState = await readJsonFile(
    config.monitorStateFile,
    { version: 1, lastAlertAt: null, runs: [] },
  );
  const incidentsState = await readJsonFile(
    config.monitorIncidentsFile,
    { version: 1, activeIncidentId: null, incidents: [] },
  );

  const runRecord = {
    timestamp,
    checks: currentChecks.map((check) => ({
      name: check.name,
      ok: check.ok,
      skipped: check.skipped,
      critical: check.critical,
      scope: check.scope,
      status: check.status,
      latencyMs: check.latencyMs,
      sloTarget: check.sloTarget,
    })),
  };

  const nextRuns = Array.isArray(previousState.runs) ? [...previousState.runs, runRecord] : [runRecord];
  const trimmedRuns = nextRuns.slice(-config.historySize);

  const availability = computeAvailability(trimmedRuns);
  const criticalFailures = currentChecks.filter((check) => check.critical && !check.ok && !check.skipped);

  const sloBreaches = [];
  for (const check of currentChecks) {
    if (check.skipped || typeof check.sloTarget !== 'number') continue;
    const stats = availability[check.name];
    if (!stats || stats.total < config.minSamplesForSlo) continue;
    if (stats.availabilityPct < check.sloTarget) {
      sloBreaches.push({
        check: check.name,
        scope: check.scope,
        availabilityPct: stats.availabilityPct,
        targetPct: check.sloTarget,
        sampleSize: stats.total,
      });
    }
  }

  const incident = criticalFailures.length > 0 || sloBreaches.length > 0;
  const severity = criticalFailures.length > 0 ? 'critical' : sloBreaches.length > 0 ? 'warning' : 'info';

  const report = {
    timestamp,
    incident,
    severity,
    checks: currentChecks,
    availability,
    sloBreaches,
    criticalFailures: criticalFailures.map((check) => ({
      name: check.name,
      status: check.status,
      message: check.message,
    })),
    config: {
      apiBase: config.apiBase,
      workerBase: config.workerBase || null,
      dockerWorkerCheck: config.dockerWorkerCheck,
      dockerWorkerContainer: config.dockerWorkerContainer,
      minSamplesForSlo: config.minSamplesForSlo,
      apiSloTarget: config.apiSloTarget,
      workerSloTarget: config.workerSloTarget,
      historySize: config.historySize,
      stateFile: config.monitorStateFile,
      reportFile: config.monitorReportFile,
      incidentsFile: config.monitorIncidentsFile,
      expectedIntervalMinutes: config.expectedIntervalMinutes,
      alertWebhookConfigured: Boolean(config.alertWebhookUrl),
      alertSlackConfigured: Boolean(config.alertSlackWebhookUrl),
      alertDiscordConfigured: Boolean(config.alertDiscordWebhookUrl),
      alertTelegramConfigured: Boolean(config.alertTelegramBotToken && config.alertTelegramChatId),
    },
  };

  const nextState = {
    version: 1,
    lastAlertAt: previousState.lastAlertAt || null,
    runs: trimmedRuns,
  };

  let alertAttempts = [];
  const hasAnyAlertTarget = Boolean(
    config.alertWebhookUrl
      || config.alertSlackWebhookUrl
      || config.alertDiscordWebhookUrl
      || (config.alertTelegramBotToken && config.alertTelegramChatId),
  );

  if (incident && hasAnyAlertTarget) {
    const cooldownMs = config.alertCooldownMinutes * 60 * 1000;
    const lastAlertAtMs = nextState.lastAlertAt ? Date.parse(nextState.lastAlertAt) : 0;
    const inCooldown = lastAlertAtMs > 0 && (now.getTime() - lastAlertAtMs < cooldownMs);

    if (!inCooldown) {
      const payload = {
        source: 'supervisor-comercial-monitor',
        timestamp,
        severity,
        incident: true,
        summary: {
          criticalFailures: report.criticalFailures,
          sloBreaches,
          reportFile: config.monitorReportFile,
        },
      };

      if (config.alertWebhookUrl) {
        const response = await sendAlertWebhook({
          webhookUrl: config.alertWebhookUrl,
          bearerToken: config.alertBearerToken,
          payload,
          timeoutMs: config.timeoutMs,
        });
        alertAttempts.push({ target: 'webhook', ...response });
      }

      if (config.alertSlackWebhookUrl) {
        const response = await sendSlackAlert({
          webhookUrl: config.alertSlackWebhookUrl,
          payload,
          timeoutMs: config.timeoutMs,
        });
        alertAttempts.push({ target: 'slack', ...response });
      }

      if (config.alertDiscordWebhookUrl) {
        const response = await sendDiscordAlert({
          webhookUrl: config.alertDiscordWebhookUrl,
          payload,
          timeoutMs: config.timeoutMs,
        });
        alertAttempts.push({ target: 'discord', ...response });
      }

      if (config.alertTelegramBotToken && config.alertTelegramChatId) {
        const response = await sendTelegramAlert({
          botToken: config.alertTelegramBotToken,
          chatId: config.alertTelegramChatId,
          threadId: config.alertTelegramThreadId,
          payload,
          timeoutMs: config.timeoutMs,
        });
        alertAttempts.push({ target: 'telegram', ...response });
      }

      const someAlertSucceeded = alertAttempts.some((attempt) => attempt.ok);
      if (someAlertSucceeded) {
        nextState.lastAlertAt = timestamp;
      }
    } else {
      alertAttempts = [{
        target: 'cooldown',
        ok: true,
        status: null,
        body: 'alert suppressed by cooldown window',
      }];
    }
  }

  report.alertAttempts = alertAttempts;

  if (!Array.isArray(incidentsState.incidents)) incidentsState.incidents = [];
  if (typeof incidentsState.activeIncidentId !== 'string') incidentsState.activeIncidentId = null;

  const failedChecks = currentChecks.filter((check) => !check.ok && !check.skipped);
  const firstFailureAtMs = failedChecks.length > 0
    ? Math.min(...failedChecks.map((check) => safeParseTime(check.checkedAt, Date.parse(timestamp))))
    : Date.parse(timestamp);
  const detectionAtMs = Date.parse(timestamp);

  if (incident) {
    let activeIncident = incidentsState.activeIncidentId
      ? incidentsState.incidents.find((inc) => inc.id === incidentsState.activeIncidentId && inc.status === 'open')
      : null;

    if (!activeIncident) {
      const id = newIncidentId(timestamp);
      activeIncident = {
        id,
        status: 'open',
        startedAt: new Date(firstFailureAtMs).toISOString(),
        detectedAt: timestamp,
        lastSeenAt: timestamp,
        resolvedAt: null,
        durationMs: null,
        mttdMs: Math.max(0, detectionAtMs - firstFailureAtMs),
        expectedWorstCaseMttdMs: config.expectedIntervalMinutes * 60_000,
        severity,
        maxSeverity: severity,
        criticalFailures: report.criticalFailures,
        sloBreaches,
        checks: currentChecks.map((check) => ({
          name: check.name,
          ok: check.ok,
          status: check.status,
          message: check.message,
          checkedAt: check.checkedAt,
        })),
        alertEvents: alertAttempts.length > 0
          ? [{ timestamp, attempts: alertAttempts }]
          : [],
      };
      incidentsState.incidents.push(activeIncident);
      incidentsState.activeIncidentId = id;
    } else {
      activeIncident.lastSeenAt = timestamp;
      activeIncident.severity = severity;
      activeIncident.maxSeverity = maxSeverity(activeIncident.maxSeverity || activeIncident.severity || 'info', severity);
      activeIncident.criticalFailures = report.criticalFailures;
      activeIncident.sloBreaches = sloBreaches;
      activeIncident.checks = currentChecks.map((check) => ({
        name: check.name,
        ok: check.ok,
        status: check.status,
        message: check.message,
        checkedAt: check.checkedAt,
      }));

      const currentStartedAtMs = safeParseTime(activeIncident.startedAt, firstFailureAtMs);
      if (firstFailureAtMs < currentStartedAtMs) {
        activeIncident.startedAt = new Date(firstFailureAtMs).toISOString();
      }

      if (alertAttempts.length > 0) {
        if (!Array.isArray(activeIncident.alertEvents)) activeIncident.alertEvents = [];
        activeIncident.alertEvents.push({ timestamp, attempts: alertAttempts });
      }
    }
  } else if (incidentsState.activeIncidentId) {
    const activeIncident = incidentsState.incidents.find(
      (inc) => inc.id === incidentsState.activeIncidentId && inc.status === 'open',
    );
    if (activeIncident) {
      const startedAtMs = safeParseTime(activeIncident.startedAt, Date.parse(timestamp));
      const detectedAtMs = safeParseTime(activeIncident.detectedAt, Date.parse(timestamp));
      activeIncident.status = 'resolved';
      activeIncident.resolvedAt = timestamp;
      activeIncident.lastSeenAt = timestamp;
      activeIncident.durationMs = Math.max(0, Date.parse(timestamp) - startedAtMs);
      activeIncident.mttdMs = Math.max(0, detectedAtMs - startedAtMs);
    }
    incidentsState.activeIncidentId = null;
  }

  const openIncidents = incidentsState.incidents.filter((inc) => inc.status === 'open').length;
  report.incidentContext = {
    activeIncidentId: incidentsState.activeIncidentId,
    incidentsFile: config.monitorIncidentsFile,
    totalIncidents: incidentsState.incidents.length,
    openIncidents,
  };

  await writeJsonFile(config.monitorStateFile, nextState);
  await writeJsonFile(config.monitorReportFile, report);
  await writeJsonFile(config.monitorIncidentsFile, incidentsState);

  console.log(`Monitoring report: ${config.monitorReportFile}`);
  console.log(`Monitoring state: ${config.monitorStateFile}`);
  console.log(`Incidents file: ${config.monitorIncidentsFile}`);
  currentChecks.forEach(printCheck);

  for (const [name, stats] of Object.entries(availability)) {
    console.log(`[WINDOW] ${name} availability=${stats.availabilityPct}% (${stats.ok}/${stats.total})`);
  }

  if (sloBreaches.length > 0) {
    console.log('[SLO] Breaches detected:');
    for (const breach of sloBreaches) {
      console.log(
        ` - ${breach.check}: ${breach.availabilityPct}% < target ${breach.targetPct}% (samples=${breach.sampleSize})`,
      );
    }
  }

  if (!incident) {
    console.log('Monitoring status: OK');
    return;
  }

  console.error(`Monitoring status: INCIDENT (${severity})`);
  if (config.exitOnIncident) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected monitoring failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
