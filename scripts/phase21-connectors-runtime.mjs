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

function envFloat(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function pct(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Number(((n / d) * 100).toFixed(2));
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function incidentId(ts) {
  const base = String(ts).replace(/[-:.TZ]/g, '').slice(0, 14);
  const rnd = Math.random().toString(36).slice(2, 7);
  return `conn-${base}-${rnd}`;
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

function buildAlertText(payload) {
  const lines = [
    `CONNECTOR INCIDENT: ${String(payload.severity || 'warning').toUpperCase()}`,
    `Timestamp: ${payload.timestamp}`,
  ];
  for (const item of payload.summary?.violations || []) {
    lines.push(`- ${item.connector} ${item.code}: ${item.message}`);
  }
  if (payload.summary?.reportFile) {
    lines.push(`Report: ${payload.summary.reportFile}`);
  }
  return lines.join('\n');
}

async function sendSlackAlert({ webhookUrl, payload, timeoutMs }) {
  return sendAlertWebhook({
    webhookUrl,
    bearerToken: '',
    payload: { text: buildAlertText(payload) },
    timeoutMs,
  });
}

async function sendDiscordAlert({ webhookUrl, payload, timeoutMs }) {
  return sendAlertWebhook({
    webhookUrl,
    bearerToken: '',
    payload: { content: buildAlertText(payload) },
    timeoutMs,
  });
}

async function sendTelegramAlert({ botToken, chatId, threadId, payload, timeoutMs }) {
  const body = {
    chat_id: chatId,
    text: buildAlertText(payload),
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

function aggregateConnectors(historyWindow) {
  const map = new Map();
  for (const run of historyWindow) {
    const runTs = String(run?.timestamp || '');
    const connectors = run?.connectors && typeof run.connectors === 'object' && !Array.isArray(run.connectors)
      ? run.connectors
      : {};
    for (const [key, itemRaw] of Object.entries(connectors)) {
      const item = itemRaw && typeof itemRaw === 'object' ? itemRaw : {};
      if (!map.has(key)) {
        map.set(key, {
          key,
          provider: String(item.provider || '').trim() || 'unknown',
          channel: String(item.channel || '').trim() || 'unknown',
          endpointConfigured: Boolean(item.endpointConfigured),
          runsSeen: 0,
          passRuns: 0,
          failRuns: 0,
          total: 0,
          success: 0,
          failed: 0,
          skipped: 0,
          attempted: 0,
          httpAttempts: 0,
          retried: 0,
          timeouts: 0,
          httpErrors: 0,
          contractRequestErrors: 0,
          contractResponseErrors: 0,
          p95Values: [],
          lastSeenAt: runTs || null,
        });
      }
      const agg = map.get(key);
      agg.runsSeen += 1;
      if (String(run?.status || '').toLowerCase() === 'pass') agg.passRuns += 1;
      if (String(run?.status || '').toLowerCase() === 'fail') agg.failRuns += 1;
      agg.total += num(item.total);
      agg.success += num(item.success);
      agg.failed += num(item.failed);
      agg.skipped += num(item.skipped);
      agg.attempted += num(item.attempted);
      agg.httpAttempts += num(item.httpAttempts);
      agg.retried += num(item.retried);
      agg.timeouts += num(item.timeouts);
      agg.httpErrors += num(item.httpErrors);
      agg.contractRequestErrors += num(item.contractRequestErrors);
      agg.contractResponseErrors += num(item.contractResponseErrors);
      const p95 = Number(item?.latencyMs?.p95);
      if (Number.isFinite(p95)) agg.p95Values.push(p95);
      const currentLastMs = parseMs(agg.lastSeenAt);
      const candidateMs = parseMs(runTs);
      if (Number.isFinite(candidateMs) && (!Number.isFinite(currentLastMs) || candidateMs > currentLastMs)) {
        agg.lastSeenAt = runTs;
      }
      agg.provider = String(item.provider || agg.provider || 'unknown').trim() || 'unknown';
      agg.channel = String(item.channel || agg.channel || 'unknown').trim() || 'unknown';
      agg.endpointConfigured = Boolean(item.endpointConfigured);
    }
  }

  const rows = [];
  for (const agg of map.values()) {
    const executionTotal = agg.success + agg.failed;
    const successRatePct = executionTotal > 0 ? pct(agg.success, executionTotal) : 100;
    const timeoutRatePct = agg.httpAttempts > 0 ? pct(agg.timeouts, agg.httpAttempts) : 0;
    const httpErrorRatePct = agg.httpAttempts > 0 ? pct(agg.httpErrors, agg.httpAttempts) : 0;
    const avgP95 = agg.p95Values.length > 0
      ? Number((agg.p95Values.reduce((s, v) => s + v, 0) / agg.p95Values.length).toFixed(2))
      : null;
    const worstP95 = agg.p95Values.length > 0 ? Math.max(...agg.p95Values) : null;
    rows.push({
      key: agg.key,
      provider: agg.provider,
      channel: agg.channel,
      endpointConfigured: agg.endpointConfigured,
      runsSeen: agg.runsSeen,
      passRuns: agg.passRuns,
      failRuns: agg.failRuns,
      total: agg.total,
      success: agg.success,
      failed: agg.failed,
      skipped: agg.skipped,
      attempted: agg.attempted,
      httpAttempts: agg.httpAttempts,
      retried: agg.retried,
      timeouts: agg.timeouts,
      httpErrors: agg.httpErrors,
      contractRequestErrors: agg.contractRequestErrors,
      contractResponseErrors: agg.contractResponseErrors,
      contractErrors: agg.contractRequestErrors + agg.contractResponseErrors,
      successRatePct,
      timeoutRatePct,
      httpErrorRatePct,
      latencyAvgP95Ms: avgP95,
      latencyWorstP95Ms: worstP95,
      lastSeenAt: agg.lastSeenAt,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

function buildViolations(connectors, cfg) {
  const violations = [];
  for (const item of connectors) {
    if (item.runsSeen < cfg.minSamples) continue;

    if (item.successRatePct < cfg.targetSuccessRatePct) {
      violations.push({
        connector: item.key,
        code: 'success_rate_below_target',
        blocking: true,
        severity: 'critical',
        message: `success rate ${item.successRatePct}% < ${cfg.targetSuccessRatePct}%`,
      });
    }

    if (item.timeoutRatePct > cfg.targetTimeoutRatePctMax) {
      violations.push({
        connector: item.key,
        code: 'timeout_rate_above_target',
        blocking: true,
        severity: 'critical',
        message: `timeout rate ${item.timeoutRatePct}% > ${cfg.targetTimeoutRatePctMax}%`,
      });
    }

    if (item.httpErrorRatePct > cfg.targetHttpErrorRatePctMax) {
      violations.push({
        connector: item.key,
        code: 'http_error_rate_above_target',
        blocking: true,
        severity: 'critical',
        message: `http error rate ${item.httpErrorRatePct}% > ${cfg.targetHttpErrorRatePctMax}%`,
      });
    }

    if (Number.isFinite(item.latencyWorstP95Ms) && item.latencyWorstP95Ms > cfg.targetP95LatencyMs) {
      violations.push({
        connector: item.key,
        code: 'p95_latency_above_target',
        blocking: true,
        severity: 'warning',
        message: `worst p95 ${item.latencyWorstP95Ms}ms > ${cfg.targetP95LatencyMs}ms`,
      });
    }

    if (item.contractErrors > cfg.targetContractErrorsMax) {
      violations.push({
        connector: item.key,
        code: 'contract_errors_above_target',
        blocking: true,
        severity: 'warning',
        message: `contract errors ${item.contractErrors} > ${cfg.targetContractErrorsMax}`,
      });
    }
  }
  return violations;
}

async function main() {
  const ts = nowIso();
  const cfg = {
    telemetryFile: process.env.FULLCYCLE_CONNECTOR_TELEMETRY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-telemetry.json'),
    reportFile: process.env.FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-runtime-report.json'),
    dashboardFile: process.env.FULLCYCLE_CONNECTOR_RUNTIME_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-runtime.md'),
    incidentsFile: process.env.FULLCYCLE_CONNECTOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-incidents.json'),
    windowRuns: Math.max(1, envInt('FULLCYCLE_CONNECTOR_WINDOW_RUNS', 50)),
    minSamples: Math.max(1, envInt('FULLCYCLE_CONNECTOR_MIN_SAMPLES', 5)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_ENFORCE_TARGETS', false),
    exitOnIncident: envBool('FULLCYCLE_CONNECTOR_EXIT_ON_INCIDENT', true),
    targetSuccessRatePct: envFloat('FULLCYCLE_CONNECTOR_TARGET_SUCCESS_RATE_PCT', 99),
    targetTimeoutRatePctMax: envFloat('FULLCYCLE_CONNECTOR_TARGET_TIMEOUT_RATE_PCT_MAX', 1),
    targetHttpErrorRatePctMax: envFloat('FULLCYCLE_CONNECTOR_TARGET_HTTP_ERROR_RATE_PCT_MAX', 1),
    targetP95LatencyMs: envFloat('FULLCYCLE_CONNECTOR_TARGET_P95_LATENCY_MS', 5000),
    targetContractErrorsMax: envInt('FULLCYCLE_CONNECTOR_TARGET_CONTRACT_ERRORS_MAX', 0),
    alertCooldownMinutes: Math.max(0, envInt('FULLCYCLE_CONNECTOR_ALERT_COOLDOWN_MINUTES', 30)),
    timeoutMs: Math.max(1000, envInt('FULLCYCLE_CONNECTOR_ALERT_TIMEOUT_MS', 8000)),
    alertWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL || process.env.MONITOR_ALERT_WEBHOOK_URL || '',
    alertBearerToken: process.env.FULLCYCLE_CONNECTOR_ALERT_BEARER_TOKEN || process.env.MONITOR_ALERT_BEARER_TOKEN || '',
    alertSlackWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_SLACK_WEBHOOK_URL || process.env.MONITOR_ALERT_SLACK_WEBHOOK_URL || '',
    alertDiscordWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_DISCORD_WEBHOOK_URL || process.env.MONITOR_ALERT_DISCORD_WEBHOOK_URL || '',
    alertTelegramBotToken: process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_BOT_TOKEN || process.env.MONITOR_ALERT_TELEGRAM_BOT_TOKEN || '',
    alertTelegramChatId: process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_CHAT_ID || process.env.MONITOR_ALERT_TELEGRAM_CHAT_ID || '',
    alertTelegramThreadId: process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_THREAD_ID || process.env.MONITOR_ALERT_TELEGRAM_THREAD_ID || '',
  };

  const telemetry = await readJson(cfg.telemetryFile, { history: [] });
  const history = Array.isArray(telemetry?.history) ? telemetry.history : [];
  const historyWindow = history.slice(-cfg.windowRuns);
  const connectors = aggregateConnectors(historyWindow);
  const violations = buildViolations(connectors, cfg);
  const blockingViolations = violations.filter((item) => item.blocking);
  const incident = blockingViolations.length > 0;
  const severity = blockingViolations.some((item) => item.severity === 'critical') ? 'critical' : (incident ? 'warning' : 'info');

  const report = {
    generatedAt: ts,
    status: incident ? (cfg.enforceTargets ? 'fail' : 'warn') : 'pass',
    incident,
    severity,
    config: {
      telemetryFile: cfg.telemetryFile,
      windowRuns: cfg.windowRuns,
      minSamples: cfg.minSamples,
      enforceTargets: cfg.enforceTargets,
      targets: {
        successRatePct: cfg.targetSuccessRatePct,
        timeoutRatePctMax: cfg.targetTimeoutRatePctMax,
        httpErrorRatePctMax: cfg.targetHttpErrorRatePctMax,
        p95LatencyMs: cfg.targetP95LatencyMs,
        contractErrorsMax: cfg.targetContractErrorsMax,
      },
    },
    summary: {
      historyEntries: history.length,
      historyWindowEntries: historyWindow.length,
      connectors: connectors.length,
      connectorsWithSamples: connectors.filter((item) => item.runsSeen >= cfg.minSamples).length,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
    },
    connectors,
    violations,
  };

  const incidentsState = await readJson(cfg.incidentsFile, { version: 1, activeIncidentId: null, lastAlertAt: null, incidents: [] });
  if (!Array.isArray(incidentsState.incidents)) incidentsState.incidents = [];
  if (typeof incidentsState.activeIncidentId !== 'string') incidentsState.activeIncidentId = null;

  const hasAlertTargets = Boolean(
    cfg.alertWebhookUrl
      || cfg.alertSlackWebhookUrl
      || cfg.alertDiscordWebhookUrl
      || (cfg.alertTelegramBotToken && cfg.alertTelegramChatId),
  );
  let alertAttempts = [];

  if (incident) {
    let active = incidentsState.activeIncidentId
      ? incidentsState.incidents.find((item) => item.id === incidentsState.activeIncidentId && item.status === 'open')
      : null;
    if (!active) {
      active = {
        id: incidentId(ts),
        status: 'open',
        startedAt: ts,
        detectedAt: ts,
        resolvedAt: null,
        severity,
        maxSeverity: severity,
        violations: blockingViolations,
        alertEvents: [],
      };
      incidentsState.incidents.push(active);
      incidentsState.activeIncidentId = active.id;
    } else {
      active.severity = severity;
      if (active.maxSeverity !== 'critical' && severity === 'critical') {
        active.maxSeverity = 'critical';
      }
      active.violations = blockingViolations;
      active.lastSeenAt = ts;
    }

    if (hasAlertTargets) {
      const cooldownMs = cfg.alertCooldownMinutes * 60_000;
      const lastAlertMs = parseMs(incidentsState.lastAlertAt);
      const nowMs = parseMs(ts);
      const inCooldown = Number.isFinite(lastAlertMs) && Number.isFinite(nowMs) && (nowMs - lastAlertMs < cooldownMs);

      if (inCooldown) {
        alertAttempts.push({
          target: 'cooldown',
          ok: true,
          status: null,
          body: 'alert suppressed by cooldown',
        });
      } else {
        const payload = {
          source: 'supervisor-comercial-connectors',
          timestamp: ts,
          severity,
          incident: true,
          summary: {
            reportFile: cfg.reportFile,
            violations: blockingViolations,
          },
        };

        if (cfg.alertWebhookUrl) {
          const result = await sendAlertWebhook({
            webhookUrl: cfg.alertWebhookUrl,
            bearerToken: cfg.alertBearerToken,
            payload,
            timeoutMs: cfg.timeoutMs,
          });
          alertAttempts.push({ target: 'webhook', ...result });
        }
        if (cfg.alertSlackWebhookUrl) {
          const result = await sendSlackAlert({
            webhookUrl: cfg.alertSlackWebhookUrl,
            payload,
            timeoutMs: cfg.timeoutMs,
          });
          alertAttempts.push({ target: 'slack', ...result });
        }
        if (cfg.alertDiscordWebhookUrl) {
          const result = await sendDiscordAlert({
            webhookUrl: cfg.alertDiscordWebhookUrl,
            payload,
            timeoutMs: cfg.timeoutMs,
          });
          alertAttempts.push({ target: 'discord', ...result });
        }
        if (cfg.alertTelegramBotToken && cfg.alertTelegramChatId) {
          const result = await sendTelegramAlert({
            botToken: cfg.alertTelegramBotToken,
            chatId: cfg.alertTelegramChatId,
            threadId: cfg.alertTelegramThreadId,
            payload,
            timeoutMs: cfg.timeoutMs,
          });
          alertAttempts.push({ target: 'telegram', ...result });
        }

        if (alertAttempts.some((item) => item.ok)) {
          incidentsState.lastAlertAt = ts;
        }
      }
    }

    if (alertAttempts.length > 0) {
      if (!Array.isArray(active.alertEvents)) active.alertEvents = [];
      active.alertEvents.push({ timestamp: ts, attempts: alertAttempts });
    }
  } else if (incidentsState.activeIncidentId) {
    const active = incidentsState.incidents.find((item) => item.id === incidentsState.activeIncidentId && item.status === 'open');
    if (active) {
      active.status = 'resolved';
      active.resolvedAt = ts;
      active.lastSeenAt = ts;
    }
    incidentsState.activeIncidentId = null;
  }

  report.alertAttempts = alertAttempts;
  report.incidentContext = {
    incidentsFile: cfg.incidentsFile,
    activeIncidentId: incidentsState.activeIncidentId,
    totalIncidents: incidentsState.incidents.length,
    openIncidents: incidentsState.incidents.filter((item) => item.status === 'open').length,
  };

  await writeJson(cfg.reportFile, report);
  await writeJson(cfg.incidentsFile, incidentsState);

  const md = [];
  md.push('# Fullcycle Connector Runtime');
  md.push('');
  md.push(`- Generated at: ${ts}`);
  md.push(`- Status: ${report.status.toUpperCase()}`);
  md.push(`- Incident: ${incident ? 'yes' : 'no'}`);
  md.push(`- Severity: ${severity}`);
  md.push(`- Connectors evaluated: ${report.summary.connectors}`);
  md.push(`- Violations: ${report.summary.violations}`);
  md.push('');
  md.push('| Connector | Success rate | Timeout rate | HTTP error rate | Worst p95 (ms) | Contract errors | Runs seen |');
  md.push('|---|---|---|---|---|---|---|');
  if (connectors.length === 0) {
    md.push('| - | n/a | n/a | n/a | n/a | 0 | 0 |');
  } else {
    for (const item of connectors) {
      md.push(`| ${item.key} | ${item.successRatePct}% | ${item.timeoutRatePct}% | ${item.httpErrorRatePct}% | ${item.latencyWorstP95Ms ?? 'n/a'} | ${item.contractErrors} | ${item.runsSeen} |`);
    }
  }
  md.push('');
  md.push('## Violations');
  md.push('');
  if (violations.length === 0) {
    md.push('- none');
  } else {
    for (const v of violations) {
      md.push(`- [${v.blocking ? 'BLOCKING' : 'INFO'}] ${v.connector} ${v.code}: ${v.message}`);
    }
  }
  md.push('');
  await writeText(cfg.dashboardFile, md.join('\n'));

  console.log(`Connector runtime report: ${cfg.reportFile}`);
  console.log(`Connector runtime dashboard: ${cfg.dashboardFile}`);
  console.log(`[CONNECTOR-RUNTIME] status=${report.status} connectors=${report.summary.connectors} violations=${report.summary.violations}`);

  if (report.status === 'fail' || (incident && cfg.exitOnIncident && cfg.enforceTargets)) {
    for (const item of blockingViolations) {
      console.error(`[CONNECTOR-RUNTIME] ${item.connector} ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase21 connector runtime failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
