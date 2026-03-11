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

function parseMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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

function statusSeverity(status) {
  const val = String(status || 'unknown').toLowerCase();
  if (val === 'fail') return 'critical';
  if (val === 'warn') return 'warning';
  if (val === 'pass') return 'info';
  return 'warning';
}

function issueKey(item) {
  return `${String(item?.source || 'unknown')}::${String(item?.code || 'unknown')}`;
}

function tail(arr, size) {
  if (!Array.isArray(arr) || arr.length <= size) return arr;
  return arr.slice(arr.length - size);
}

async function sendJson({
  url,
  bearerToken,
  payload,
  timeoutMs,
  dryRun,
}) {
  if (!url) {
    return {
      attempted: false,
      ok: true,
      status: null,
      body: 'channel not configured',
      dryRun,
    };
  }

  if (dryRun) {
    return {
      attempted: true,
      ok: true,
      status: 200,
      body: 'dry-run',
      dryRun: true,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.text()).slice(0, 500);
    return {
      attempted: true,
      ok: response.ok,
      status: response.status,
      body,
      dryRun: false,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: null,
      body: error instanceof Error ? error.message : String(error),
      dryRun: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildAlertText(payload) {
  const opened = Array.isArray(payload.openedIssues) ? payload.openedIssues : [];
  const resolved = Array.isArray(payload.resolvedIssues) ? payload.resolvedIssues : [];
  const lines = [
    `OBS-REALTIME ALERT: ${String(payload.severity || 'warning').toUpperCase()}`,
    `Timestamp: ${payload.timestamp}`,
    `Status: ${payload.status}`,
  ];
  if (opened.length > 0) {
    lines.push('Opened issues:');
    for (const item of opened) lines.push(`- ${item.code}: ${item.message}`);
  }
  if (resolved.length > 0) {
    lines.push('Resolved issues:');
    for (const item of resolved) lines.push(`- ${item}`);
  }
  if (payload.summary?.apiSla) {
    const sla = payload.summary.apiSla;
    lines.push(`API SLA availability=${sla.availabilityPct ?? 'n/a'}% worstLatency=${sla.worstLatencyMs ?? 'n/a'}ms payloadAge=${sla.observedPayloadAgeMinutes ?? 'n/a'}min`);
  }
  return lines.join('\n');
}

async function sendFanout({
  channels,
  alertPayload,
  timeoutMs,
  dryRun,
}) {
  const deliveries = [];
  const text = buildAlertText(alertPayload);

  deliveries.push({
    channel: 'webhook',
    ...(await sendJson({
      url: channels.webhookUrl,
      bearerToken: channels.webhookBearerToken,
      payload: alertPayload,
      timeoutMs,
      dryRun,
    })),
  });

  deliveries.push({
    channel: 'slack',
    ...(await sendJson({
      url: channels.slackWebhookUrl,
      bearerToken: '',
      payload: { text },
      timeoutMs,
      dryRun,
    })),
  });

  deliveries.push({
    channel: 'discord',
    ...(await sendJson({
      url: channels.discordWebhookUrl,
      bearerToken: '',
      payload: { content: text },
      timeoutMs,
      dryRun,
    })),
  });

  const telegramUrl = channels.telegramBotToken && channels.telegramChatId
    ? `${String(channels.telegramBaseUrl || 'https://api.telegram.org').replace(/\/+$/, '')}/bot${channels.telegramBotToken}/sendMessage`
    : '';

  const telegramPayload = {
    chat_id: channels.telegramChatId,
    text,
    disable_web_page_preview: true,
  };
  if (channels.telegramThreadId) {
    telegramPayload.message_thread_id = Number(channels.telegramThreadId);
  }

  deliveries.push({
    channel: 'telegram',
    ...(await sendJson({
      url: telegramUrl,
      bearerToken: '',
      payload: telegramPayload,
      timeoutMs,
      dryRun,
    })),
  });

  return deliveries;
}

function computeApiSlaSnapshot(apiGovernanceReport, timestamp) {
  const summary = apiGovernanceReport?.summary && typeof apiGovernanceReport.summary === 'object'
    ? apiGovernanceReport.summary
    : {};
  const checked = Number(summary.endpointsChecked ?? 0);
  const passed = Number(summary.endpointsPassed ?? 0);
  const availabilityPct = checked > 0 ? round((passed / checked) * 100, 2) : null;
  return {
    timestamp,
    status: String(apiGovernanceReport?.status || 'unknown').toLowerCase(),
    endpointsChecked: checked,
    endpointsPassed: passed,
    availabilityPct,
    worstLatencyMs: Number(summary.worstLatencyMs ?? 0),
    avgLatencyMs: Number(summary.avgLatencyMs ?? 0),
    observedPayloadAgeMinutes: Number(summary.observedPayloadAgeMinutes ?? 0),
    blockingViolations: Number(summary.blockingViolations ?? 0),
    totalViolations: Number(summary.violations ?? 0),
  };
}

function findThresholdViolations({
  streamReport,
  apiGovernanceReport,
  apiSlaSnapshot,
  cfg,
}) {
  const violations = [];
  const streamStatus = String(streamReport?.status || 'unknown').toLowerCase();
  const apiStatus = String(apiGovernanceReport?.status || 'unknown').toLowerCase();

  if (cfg.requireStreamPass && streamStatus !== 'pass') {
    violations.push({
      source: 'stream',
      code: 'stream_not_pass',
      blocking: true,
      severity: statusSeverity(streamStatus),
      message: `stream status is ${streamStatus}, expected pass`,
    });
  }

  if (cfg.requireApiGovernancePass && apiStatus !== 'pass') {
    violations.push({
      source: 'api_governance',
      code: 'api_governance_not_pass',
      blocking: true,
      severity: statusSeverity(apiStatus),
      message: `api governance status is ${apiStatus}, expected pass`,
    });
  }

  if (apiSlaSnapshot.blockingViolations > cfg.maxBlockingViolations) {
    violations.push({
      source: 'api_sla',
      code: 'api_sla_blocking_violations_above_target',
      blocking: true,
      severity: 'critical',
      message: `blocking violations ${apiSlaSnapshot.blockingViolations} > ${cfg.maxBlockingViolations}`,
    });
  }

  if (Number.isFinite(apiSlaSnapshot.availabilityPct) && apiSlaSnapshot.availabilityPct < cfg.minAvailabilityPct) {
    violations.push({
      source: 'api_sla',
      code: 'api_sla_availability_below_target',
      blocking: true,
      severity: 'critical',
      message: `availability ${apiSlaSnapshot.availabilityPct}% < ${cfg.minAvailabilityPct}%`,
    });
  }

  if (Number.isFinite(apiSlaSnapshot.worstLatencyMs) && apiSlaSnapshot.worstLatencyMs > cfg.maxLatencyMs) {
    violations.push({
      source: 'api_sla',
      code: 'api_sla_latency_above_target',
      blocking: true,
      severity: 'warning',
      message: `worst latency ${apiSlaSnapshot.worstLatencyMs}ms > ${cfg.maxLatencyMs}ms`,
    });
  }

  if (Number.isFinite(apiSlaSnapshot.observedPayloadAgeMinutes) && apiSlaSnapshot.observedPayloadAgeMinutes > cfg.maxPayloadAgeMinutes) {
    violations.push({
      source: 'api_sla',
      code: 'api_sla_payload_age_above_target',
      blocking: true,
      severity: 'warning',
      message: `payload age ${apiSlaSnapshot.observedPayloadAgeMinutes}min > ${cfg.maxPayloadAgeMinutes}min`,
    });
  }

  const streamViolations = Array.isArray(streamReport?.violations) ? streamReport.violations : [];
  for (const item of streamViolations) {
    const code = String(item?.code || '').trim();
    if (!code) continue;
    violations.push({
      source: 'stream',
      code,
      blocking: Boolean(item?.blocking),
      severity: String(item?.severity || 'warning').toLowerCase(),
      message: String(item?.message || code),
    });
  }

  return violations;
}

async function main() {
  const ts = nowIso();
  const nowMs = parseMs(ts);

  const cfg = {
    streamReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-realtime-report.json'),
    apiGovernanceReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-governance-report.json'),
    alertStateFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_STATE_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-state.json'),
    alertReportFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-report.json'),
    alertDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-alerting.md'),
    alertAuditFile: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-alerting-audit.jsonl'),
    apiSlaHistoryFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-sla-history.json'),
    apiSlaDashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_SLA_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-api-sla.md'),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ENFORCE_TARGETS', false),
    requireStreamPass: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_STREAM_PASS', true),
    requireApiGovernancePass: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_REQUIRE_API_GOVERNANCE_PASS', true),
    minAvailabilityPct: envFloat('FULLCYCLE_CONNECTOR_OBS_API_SLA_MIN_AVAILABILITY_PCT', 99),
    maxLatencyMs: envFloat('FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_LATENCY_MS', 3500),
    maxPayloadAgeMinutes: envFloat('FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_PAYLOAD_AGE_MIN', 240),
    maxBlockingViolations: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_API_SLA_MAX_BLOCKING_VIOLATIONS', 0)),
    maxActiveIssues: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_MAX_ACTIVE_ISSUES', 30)),
    historyMaxPoints: Math.max(10, envInt('FULLCYCLE_CONNECTOR_OBS_API_SLA_HISTORY_MAX_POINTS', 720)),
    alertOnlyOnNew: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_ONLY_ON_NEW', true),
    alertNotifyResolved: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_NOTIFY_RESOLVED', true),
    alertCooldownMinutes: Math.max(0, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_COOLDOWN_MINUTES', 30)),
    alertTimeoutMs: Math.max(1000, envInt('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TIMEOUT_MS', 8000)),
    alertDryRun: envBool('FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DRY_RUN', false),
    webhookUrl: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL
      || process.env.MONITOR_ALERT_WEBHOOK_URL
      || '',
    webhookBearerToken: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_BEARER_TOKEN
      || process.env.FULLCYCLE_CONNECTOR_ALERT_BEARER_TOKEN
      || process.env.MONITOR_ALERT_BEARER_TOKEN
      || '',
    slackWebhookUrl: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_SLACK_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_SLACK_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_SLACK_WEBHOOK_URL
      || process.env.MONITOR_ALERT_SLACK_WEBHOOK_URL
      || '',
    discordWebhookUrl: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_DISCORD_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_DISCORD_WEBHOOK_URL
      || process.env.FULLCYCLE_CONNECTOR_ALERT_DISCORD_WEBHOOK_URL
      || process.env.MONITOR_ALERT_DISCORD_WEBHOOK_URL
      || '',
    telegramBotToken: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_BOT_TOKEN
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_BOT_TOKEN
      || process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_BOT_TOKEN
      || process.env.MONITOR_ALERT_TELEGRAM_BOT_TOKEN
      || '',
    telegramChatId: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_CHAT_ID
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_CHAT_ID
      || process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_CHAT_ID
      || process.env.MONITOR_ALERT_TELEGRAM_CHAT_ID
      || '',
    telegramThreadId: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_THREAD_ID
      || process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_THREAD_ID
      || process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_THREAD_ID
      || process.env.MONITOR_ALERT_TELEGRAM_THREAD_ID
      || '',
    telegramBaseUrl: process.env.FULLCYCLE_CONNECTOR_OBS_STREAM_ALERT_TELEGRAM_BASE_URL || 'https://api.telegram.org',
  };

  const [streamReport, apiGovernanceReport, alertStateRaw, apiSlaHistoryRaw] = await Promise.all([
    readJson(cfg.streamReportFile, null),
    readJson(cfg.apiGovernanceReportFile, null),
    readJson(cfg.alertStateFile, {}),
    readJson(cfg.apiSlaHistoryFile, { version: 1, generatedAt: null, history: [] }),
  ]);

  const violations = [];
  if (!streamReport) {
    violations.push({
      source: 'stream',
      code: 'stream_report_missing',
      blocking: true,
      severity: 'critical',
      message: `stream report not found at ${cfg.streamReportFile}`,
    });
  }
  if (!apiGovernanceReport) {
    violations.push({
      source: 'api_governance',
      code: 'api_governance_report_missing',
      blocking: true,
      severity: 'critical',
      message: `api governance report not found at ${cfg.apiGovernanceReportFile}`,
    });
  }

  const apiSlaSnapshot = computeApiSlaSnapshot(apiGovernanceReport, ts);
  const thresholdViolations = (!streamReport || !apiGovernanceReport)
    ? []
    : findThresholdViolations({ streamReport, apiGovernanceReport, apiSlaSnapshot, cfg });
  violations.push(...thresholdViolations);

  if (violations.length > cfg.maxActiveIssues) {
    violations.push({
      source: 'alerting',
      code: 'active_issues_above_limit',
      blocking: true,
      severity: 'critical',
      message: `active issues ${violations.length} > ${cfg.maxActiveIssues}`,
    });
  }

  const prevState = alertStateRaw && typeof alertStateRaw === 'object' ? alertStateRaw : {};
  const prevOpenIssueKeys = new Set(Array.isArray(prevState.openIssueKeys) ? prevState.openIssueKeys : []);
  const prevLastIssueSentAt = prevState.lastIssueSentAt && typeof prevState.lastIssueSentAt === 'object'
    ? prevState.lastIssueSentAt
    : {};
  const currentIssueMap = new Map(violations.map((item) => [issueKey(item), item]));
  const currentOpenIssueKeys = new Set(currentIssueMap.keys());

  const newlyOpenedIssues = [...currentIssueMap.entries()]
    .filter(([key]) => !prevOpenIssueKeys.has(key))
    .map(([, item]) => item);
  const resolvedIssueKeys = [...prevOpenIssueKeys].filter((key) => !currentOpenIssueKeys.has(key));

  const cooldownMs = cfg.alertCooldownMinutes * 60_000;
  const nowTsMs = nowMs;
  const lastDispatchMs = parseMs(prevState.lastDispatchAt);
  const inGlobalCooldown = Number.isFinite(lastDispatchMs)
    && Number.isFinite(nowTsMs)
    && (nowTsMs - lastDispatchMs < cooldownMs);

  const persistentIssuesEligible = cfg.alertOnlyOnNew
    ? []
    : violations.filter((item) => {
      const key = issueKey(item);
      const lastIssueSentMs = parseMs(prevLastIssueSentAt[key]);
      if (!Number.isFinite(lastIssueSentMs)) return true;
      return nowTsMs - lastIssueSentMs >= cooldownMs;
    });

  const openedForDispatch = cfg.alertOnlyOnNew ? newlyOpenedIssues : persistentIssuesEligible;
  const resolvedForDispatch = cfg.alertNotifyResolved ? resolvedIssueKeys : [];

  const hasAnyChannel = Boolean(
    cfg.webhookUrl
      || cfg.slackWebhookUrl
      || cfg.discordWebhookUrl
      || (cfg.telegramBotToken && cfg.telegramChatId),
  );

  const shouldDispatch = hasAnyChannel
    && !inGlobalCooldown
    && (openedForDispatch.length > 0 || resolvedForDispatch.length > 0);

  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';
  const severity = blockingViolations.length > 0
    ? 'critical'
    : (violations.length > 0 ? 'warning' : 'info');

  let deliveries = [];
  if (shouldDispatch) {
    const alertPayload = {
      timestamp: ts,
      status,
      severity,
      openedIssues: openedForDispatch,
      resolvedIssues: resolvedForDispatch,
      summary: {
        streamStatus: String(streamReport?.status || 'unknown').toLowerCase(),
        apiGovernanceStatus: String(apiGovernanceReport?.status || 'unknown').toLowerCase(),
        activeIssues: violations.length,
        blockingViolations: blockingViolations.length,
        apiSla: apiSlaSnapshot,
      },
    };

    deliveries = await sendFanout({
      channels: {
        webhookUrl: cfg.webhookUrl,
        webhookBearerToken: cfg.webhookBearerToken,
        slackWebhookUrl: cfg.slackWebhookUrl,
        discordWebhookUrl: cfg.discordWebhookUrl,
        telegramBotToken: cfg.telegramBotToken,
        telegramChatId: cfg.telegramChatId,
        telegramThreadId: cfg.telegramThreadId,
        telegramBaseUrl: cfg.telegramBaseUrl,
      },
      alertPayload,
      timeoutMs: cfg.alertTimeoutMs,
      dryRun: cfg.alertDryRun,
    });
  }

  const newLastIssueSentAt = { ...prevLastIssueSentAt };
  if (shouldDispatch) {
    for (const item of openedForDispatch) {
      newLastIssueSentAt[issueKey(item)] = ts;
    }
  }

  const nextAlertState = {
    version: 1,
    generatedAt: ts,
    status,
    lastDispatchAt: shouldDispatch ? ts : (prevState.lastDispatchAt || null),
    openIssueKeys: [...currentOpenIssueKeys].sort(),
    lastIssueSentAt: newLastIssueSentAt,
  };
  await writeJson(cfg.alertStateFile, nextAlertState);

  const historyInput = Array.isArray(apiSlaHistoryRaw?.history) ? apiSlaHistoryRaw.history : [];
  const apiSlaHistory = tail([...historyInput, apiSlaSnapshot], cfg.historyMaxPoints);
  await writeJson(cfg.apiSlaHistoryFile, {
    version: 1,
    generatedAt: ts,
    history: apiSlaHistory,
  });

  const previousSla = apiSlaHistory.length > 1 ? apiSlaHistory[apiSlaHistory.length - 2] : null;
  const slaTrend = {
    availabilityDeltaPct: previousSla && Number.isFinite(previousSla.availabilityPct) && Number.isFinite(apiSlaSnapshot.availabilityPct)
      ? round(apiSlaSnapshot.availabilityPct - previousSla.availabilityPct, 2)
      : null,
    worstLatencyDeltaMs: previousSla && Number.isFinite(previousSla.worstLatencyMs) && Number.isFinite(apiSlaSnapshot.worstLatencyMs)
      ? round(apiSlaSnapshot.worstLatencyMs - previousSla.worstLatencyMs, 2)
      : null,
    payloadAgeDeltaMin: previousSla && Number.isFinite(previousSla.observedPayloadAgeMinutes) && Number.isFinite(apiSlaSnapshot.observedPayloadAgeMinutes)
      ? round(apiSlaSnapshot.observedPayloadAgeMinutes - previousSla.observedPayloadAgeMinutes, 2)
      : null,
  };

  const report = {
    generatedAt: ts,
    status,
    severity,
    summary: {
      streamStatus: String(streamReport?.status || 'unknown').toLowerCase(),
      apiGovernanceStatus: String(apiGovernanceReport?.status || 'unknown').toLowerCase(),
      activeIssues: violations.length,
      blockingViolations: blockingViolations.length,
      newlyOpenedIssues: newlyOpenedIssues.length,
      resolvedIssues: resolvedIssueKeys.length,
      dispatchAttempted: shouldDispatch,
      channelsConfigured: {
        webhook: Boolean(cfg.webhookUrl),
        slack: Boolean(cfg.slackWebhookUrl),
        discord: Boolean(cfg.discordWebhookUrl),
        telegram: Boolean(cfg.telegramBotToken && cfg.telegramChatId),
      },
      deliveriesAttempted: deliveries.filter((item) => item.attempted).length,
      deliveriesSucceeded: deliveries.filter((item) => item.ok).length,
      apiSlaSnapshot,
      apiSlaTrend: slaTrend,
      apiSlaHistoryPoints: apiSlaHistory.length,
      cooldownActive: inGlobalCooldown,
    },
    config: {
      enforceTargets: cfg.enforceTargets,
      requireStreamPass: cfg.requireStreamPass,
      requireApiGovernancePass: cfg.requireApiGovernancePass,
      minAvailabilityPct: cfg.minAvailabilityPct,
      maxLatencyMs: cfg.maxLatencyMs,
      maxPayloadAgeMinutes: cfg.maxPayloadAgeMinutes,
      maxBlockingViolations: cfg.maxBlockingViolations,
      maxActiveIssues: cfg.maxActiveIssues,
      historyMaxPoints: cfg.historyMaxPoints,
      alertOnlyOnNew: cfg.alertOnlyOnNew,
      alertNotifyResolved: cfg.alertNotifyResolved,
      alertCooldownMinutes: cfg.alertCooldownMinutes,
      alertDryRun: cfg.alertDryRun,
    },
    violations,
    dispatch: {
      openedForDispatch,
      resolvedForDispatch,
      deliveries,
    },
  };
  await writeJson(cfg.alertReportFile, report);

  const slaDashboard = [];
  slaDashboard.push('# Fullcycle Connectors API SLA History');
  slaDashboard.push('');
  slaDashboard.push(`- Generated at: ${ts}`);
  slaDashboard.push(`- Latest status: ${apiSlaSnapshot.status}`);
  slaDashboard.push(`- Availability: ${apiSlaSnapshot.availabilityPct ?? 'n/a'}%`);
  slaDashboard.push(`- Worst latency: ${apiSlaSnapshot.worstLatencyMs ?? 'n/a'}ms`);
  slaDashboard.push(`- Payload age: ${apiSlaSnapshot.observedPayloadAgeMinutes ?? 'n/a'}min`);
  slaDashboard.push('');
  slaDashboard.push('| Timestamp | Status | Availability (%) | Worst latency (ms) | Payload age (min) | Blocking violations |');
  slaDashboard.push('|---|---|---:|---:|---:|---:|');
  for (const item of tail(apiSlaHistory, 20)) {
    slaDashboard.push(`| ${item.timestamp || 'n/a'} | ${item.status || 'unknown'} | ${item.availabilityPct ?? 'n/a'} | ${item.worstLatencyMs ?? 'n/a'} | ${item.observedPayloadAgeMinutes ?? 'n/a'} | ${item.blockingViolations ?? 'n/a'} |`);
  }
  slaDashboard.push('');
  await writeText(cfg.apiSlaDashboardFile, slaDashboard.join('\n'));

  const dashboard = [];
  dashboard.push('# Fullcycle Connectors Realtime Alerting');
  dashboard.push('');
  dashboard.push(`- Generated at: ${ts}`);
  dashboard.push(`- Status: ${status.toUpperCase()}`);
  dashboard.push(`- Active issues: ${violations.length}`);
  dashboard.push(`- Blocking issues: ${blockingViolations.length}`);
  dashboard.push(`- Dispatch attempted: ${shouldDispatch ? 'yes' : 'no'}`);
  dashboard.push(`- Cooldown active: ${inGlobalCooldown ? 'yes' : 'no'}`);
  dashboard.push('');
  dashboard.push('| Metric | Value |');
  dashboard.push('|---|---:|');
  dashboard.push(`| API availability (%) | ${apiSlaSnapshot.availabilityPct ?? 'n/a'} |`);
  dashboard.push(`| API worst latency (ms) | ${apiSlaSnapshot.worstLatencyMs ?? 'n/a'} |`);
  dashboard.push(`| API payload age (min) | ${apiSlaSnapshot.observedPayloadAgeMinutes ?? 'n/a'} |`);
  dashboard.push(`| API blocking violations | ${apiSlaSnapshot.blockingViolations ?? 'n/a'} |`);
  dashboard.push(`| SLA history points | ${apiSlaHistory.length} |`);
  dashboard.push('');
  dashboard.push('## Active Issues');
  dashboard.push('');
  if (violations.length === 0) {
    dashboard.push('- none');
  } else {
    for (const item of violations) {
      dashboard.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
    }
  }
  dashboard.push('');
  dashboard.push('## Delivery');
  dashboard.push('');
  if (deliveries.length === 0) {
    dashboard.push('- none');
  } else {
    for (const item of deliveries) {
      dashboard.push(`- ${item.channel}: attempted=${item.attempted ? 'yes' : 'no'} ok=${item.ok ? 'yes' : 'no'} status=${item.status ?? 'n/a'} message=${item.body || ''}`);
    }
  }
  dashboard.push('');
  await writeText(cfg.alertDashboardFile, dashboard.join('\n'));

  await appendLine(cfg.alertAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase28-observability-realtime-alerting',
    status,
    summary: report.summary,
    violations,
    alertReportFile: cfg.alertReportFile,
    apiSlaHistoryFile: cfg.apiSlaHistoryFile,
  }));

  console.log(`Observability alerting report: ${cfg.alertReportFile}`);
  console.log(`Observability alerting dashboard: ${cfg.alertDashboardFile}`);
  console.log(`Observability API SLA history: ${cfg.apiSlaHistoryFile}`);
  console.log(`Observability API SLA dashboard: ${cfg.apiSlaDashboardFile}`);
  console.log(`[OBS-ALERTING] status=${status} activeIssues=${violations.length} dispatch=${shouldDispatch ? 'yes' : 'no'} deliveries=${deliveries.filter((item) => item.attempted).length}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[OBS-ALERTING] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase28 alerting failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
