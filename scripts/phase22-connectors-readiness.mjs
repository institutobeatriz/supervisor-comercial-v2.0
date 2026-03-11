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

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function hasAlertChannels(cfg) {
  return Boolean(
    cfg.alertExecWebhookUrl
      || cfg.alertExecSlackWebhookUrl
      || cfg.alertExecDiscordWebhookUrl
      || (cfg.alertExecTelegramBotToken && cfg.alertExecTelegramChatId),
  );
}

function normalizeRuntimeConnectors(report) {
  const connectors = Array.isArray(report?.connectors) ? report.connectors : [];
  return connectors.map((item) => ({
    key: String(item?.key || '').trim(),
    provider: String(item?.provider || '').trim(),
    channel: String(item?.channel || '').trim(),
    runsSeen: num(item?.runsSeen),
    successRatePct: num(item?.successRatePct),
    timeoutRatePct: num(item?.timeoutRatePct),
    httpErrorRatePct: num(item?.httpErrorRatePct),
    latencyWorstP95Ms: Number.isFinite(Number(item?.latencyWorstP95Ms)) ? Number(item.latencyWorstP95Ms) : null,
    latencyAvgP95Ms: Number.isFinite(Number(item?.latencyAvgP95Ms)) ? Number(item.latencyAvgP95Ms) : null,
    contractErrors: num(item?.contractErrors),
  })).filter((item) => item.key);
}

function environmentReady(envCfg) {
  if (!envCfg || typeof envCfg !== 'object') return false;
  return Boolean(
    envCfg.enabled === true
      && String(envCfg.endpoint || '').trim()
      && String(envCfg.credentialRef || '').trim(),
  );
}

function buildTuningSuggestions(connectors, cfg) {
  const suggestions = {};
  for (const item of connectors) {
    if (item.runsSeen < cfg.minSamplesForTuning) continue;
    const success = clamp(Number((item.successRatePct - 1.5).toFixed(2)), 85, 99.9);
    const timeout = clamp(Number((item.timeoutRatePct * 1.5 + 0.5).toFixed(2)), 0.5, 50);
    const http = clamp(Number((item.httpErrorRatePct * 1.5 + 0.5).toFixed(2)), 0.5, 50);
    const p95Baseline = Number.isFinite(item.latencyWorstP95Ms)
      ? item.latencyWorstP95Ms
      : (Number.isFinite(item.latencyAvgP95Ms) ? item.latencyAvgP95Ms : 1000);
    const p95 = Math.max(500, Math.round(p95Baseline * 1.25));

    suggestions[item.key] = {
      connector: item.key,
      provider: item.provider,
      channel: item.channel,
      basedOnRuns: item.runsSeen,
      suggestedTargets: {
        successRatePct: success,
        timeoutRatePctMax: timeout,
        httpErrorRatePctMax: http,
        p95LatencyMs: p95,
        contractErrorsMax: Math.max(0, item.contractErrors),
      },
    };
  }
  return suggestions;
}

async function main() {
  const ts = nowIso();
  const cfg = {
    runtimeReportFile: process.env.FULLCYCLE_CONNECTOR_RUNTIME_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-runtime-report.json'),
    incidentsFile: process.env.FULLCYCLE_CONNECTOR_INCIDENTS_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-incidents.json'),
    environmentsFile: process.env.FULLCYCLE_CONNECTOR_ENVIRONMENTS_FILE || path.resolve(process.cwd(), 'config/connector-environments.json'),
    readinessReportFile: process.env.FULLCYCLE_CONNECTOR_READINESS_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-readiness-report.json'),
    readinessDashboardFile: process.env.FULLCYCLE_CONNECTOR_READINESS_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-readiness.md'),
    tuningOutputFile: process.env.FULLCYCLE_CONNECTOR_TUNING_OUTPUT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-thresholds-suggested.json'),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_READINESS_ENFORCE_TARGETS', false),
    requireSandbox: envBool('FULLCYCLE_CONNECTOR_READINESS_REQUIRE_SANDBOX', true),
    requireProduction: envBool('FULLCYCLE_CONNECTOR_READINESS_REQUIRE_PROD', true),
    requireNoActiveIncident: envBool('FULLCYCLE_CONNECTOR_READINESS_REQUIRE_NO_ACTIVE_INCIDENT', true),
    requireAlerts: envBool('FULLCYCLE_CONNECTOR_READINESS_REQUIRE_ALERTS', true),
    minSamplesForTuning: Math.max(1, envInt('FULLCYCLE_CONNECTOR_READINESS_MIN_SAMPLES_FOR_TUNING', 5)),
    alertExecWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_WEBHOOK_URL || process.env.FULLCYCLE_CONNECTOR_ALERT_WEBHOOK_URL || process.env.MONITOR_ALERT_WEBHOOK_URL || '',
    alertExecSlackWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_SLACK_WEBHOOK_URL || process.env.FULLCYCLE_CONNECTOR_ALERT_SLACK_WEBHOOK_URL || process.env.MONITOR_ALERT_SLACK_WEBHOOK_URL || '',
    alertExecDiscordWebhookUrl: process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_DISCORD_WEBHOOK_URL || process.env.FULLCYCLE_CONNECTOR_ALERT_DISCORD_WEBHOOK_URL || process.env.MONITOR_ALERT_DISCORD_WEBHOOK_URL || '',
    alertExecTelegramBotToken: process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_BOT_TOKEN || process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_BOT_TOKEN || process.env.MONITOR_ALERT_TELEGRAM_BOT_TOKEN || '',
    alertExecTelegramChatId: process.env.FULLCYCLE_CONNECTOR_ALERT_EXEC_TELEGRAM_CHAT_ID || process.env.FULLCYCLE_CONNECTOR_ALERT_TELEGRAM_CHAT_ID || process.env.MONITOR_ALERT_TELEGRAM_CHAT_ID || '',
  };

  const runtimeReport = await readJson(cfg.runtimeReportFile, null);
  const incidents = await readJson(cfg.incidentsFile, { activeIncidentId: null, incidents: [] });
  const envProfiles = await readJson(cfg.environmentsFile, { connectors: {} });

  const connectors = normalizeRuntimeConnectors(runtimeReport);
  const profiles = envProfiles && typeof envProfiles === 'object' && !Array.isArray(envProfiles)
    ? (envProfiles.connectors && typeof envProfiles.connectors === 'object' ? envProfiles.connectors : {})
    : {};
  const activeIncidentId = String(incidents?.activeIncidentId || '').trim() || null;

  const violations = [];
  const profileStatus = [];

  for (const connector of connectors) {
    const profile = profiles[connector.key] || null;
    if (!profile) {
      violations.push({
        code: 'profile_missing',
        connector: connector.key,
        blocking: true,
        message: `environment profile not found for ${connector.key}`,
      });
      profileStatus.push({
        connector: connector.key,
        hasProfile: false,
        sandboxReady: false,
        productionReady: false,
      });
      continue;
    }

    const sandboxReady = environmentReady(profile.sandbox);
    const productionReady = environmentReady(profile.production);
    profileStatus.push({
      connector: connector.key,
      hasProfile: true,
      sandboxReady,
      productionReady,
      owner: String(profile.owner || '').trim() || null,
      runbook: String(profile.runbook || '').trim() || null,
    });

    if (cfg.requireSandbox && !sandboxReady) {
      violations.push({
        code: 'sandbox_incomplete',
        connector: connector.key,
        blocking: true,
        message: `sandbox config incomplete for ${connector.key}`,
      });
    }
    if (cfg.requireProduction && !productionReady) {
      violations.push({
        code: 'production_incomplete',
        connector: connector.key,
        blocking: true,
        message: `production config incomplete for ${connector.key}`,
      });
    }
    if (!String(profile.owner || '').trim()) {
      violations.push({
        code: 'owner_missing',
        connector: connector.key,
        blocking: false,
        message: `owner not defined for ${connector.key}`,
      });
    }
    if (!String(profile.runbook || '').trim()) {
      violations.push({
        code: 'runbook_missing',
        connector: connector.key,
        blocking: false,
        message: `runbook not defined for ${connector.key}`,
      });
    }
  }

  if (cfg.requireNoActiveIncident && activeIncidentId) {
    violations.push({
      code: 'active_connector_incident',
      connector: null,
      blocking: true,
      message: `active connector incident: ${activeIncidentId}`,
    });
  }

  const alertsReady = hasAlertChannels(cfg);
  if (cfg.requireAlerts && !alertsReady) {
    violations.push({
      code: 'no_executive_alert_channels',
      connector: null,
      blocking: true,
      message: 'no executive alert channel configured for connector runtime',
    });
  }

  const tuningSuggestions = buildTuningSuggestions(connectors, cfg);
  const blockingViolations = violations.filter((item) => item.blocking);
  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const readiness = {
    generatedAt: ts,
    status,
    config: {
      runtimeReportFile: cfg.runtimeReportFile,
      incidentsFile: cfg.incidentsFile,
      environmentsFile: cfg.environmentsFile,
      enforceTargets: cfg.enforceTargets,
      requireSandbox: cfg.requireSandbox,
      requireProduction: cfg.requireProduction,
      requireNoActiveIncident: cfg.requireNoActiveIncident,
      requireAlerts: cfg.requireAlerts,
      minSamplesForTuning: cfg.minSamplesForTuning,
    },
    summary: {
      connectors: connectors.length,
      profilesFound: profileStatus.filter((item) => item.hasProfile).length,
      alertsReady,
      activeIncidentId,
      violations: violations.length,
      blockingViolations: blockingViolations.length,
      tuningSuggestions: Object.keys(tuningSuggestions).length,
    },
    connectors,
    profileStatus,
    violations,
    tuningSuggestions,
  };

  await writeJson(cfg.readinessReportFile, readiness);
  await writeJson(cfg.tuningOutputFile, {
    generatedAt: ts,
    sourceReport: cfg.runtimeReportFile,
    minSamplesForTuning: cfg.minSamplesForTuning,
    suggestions: tuningSuggestions,
  });

  const md = [];
  md.push('# Fullcycle Connector Readiness');
  md.push('');
  md.push(`- Generated at: ${ts}`);
  md.push(`- Status: ${status.toUpperCase()}`);
  md.push(`- Connectors: ${readiness.summary.connectors}`);
  md.push(`- Profiles found: ${readiness.summary.profilesFound}`);
  md.push(`- Alerts ready: ${alertsReady ? 'yes' : 'no'}`);
  md.push(`- Active incident: ${activeIncidentId || 'none'}`);
  md.push(`- Blocking violations: ${readiness.summary.blockingViolations}`);
  md.push('');
  md.push('| Connector | Profile | Sandbox | Production | Owner | Runbook |');
  md.push('|---|---|---|---|---|---|');
  if (profileStatus.length === 0) {
    md.push('| - | no | no | no | n/a | n/a |');
  } else {
    for (const item of profileStatus) {
      md.push(`| ${item.connector} | ${item.hasProfile ? 'yes' : 'no'} | ${item.sandboxReady ? 'yes' : 'no'} | ${item.productionReady ? 'yes' : 'no'} | ${item.owner || 'n/a'} | ${item.runbook || 'n/a'} |`);
    }
  }
  md.push('');
  md.push('## Violations');
  md.push('');
  if (violations.length === 0) {
    md.push('- none');
  } else {
    for (const item of violations) {
      md.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.connector || 'global'} ${item.code}: ${item.message}`);
    }
  }
  md.push('');
  md.push('## Suggested Tuning');
  md.push('');
  if (Object.keys(tuningSuggestions).length === 0) {
    md.push('- none');
  } else {
    md.push('| Connector | Success >= | Timeout <= | HTTP error <= | p95 <= (ms) | Contract errors <= |');
    md.push('|---|---|---|---|---|---|');
    for (const [key, item] of Object.entries(tuningSuggestions)) {
      md.push(`| ${key} | ${item.suggestedTargets.successRatePct}% | ${item.suggestedTargets.timeoutRatePctMax}% | ${item.suggestedTargets.httpErrorRatePctMax}% | ${item.suggestedTargets.p95LatencyMs} | ${item.suggestedTargets.contractErrorsMax} |`);
    }
  }
  md.push('');
  await writeText(cfg.readinessDashboardFile, md.join('\n'));

  console.log(`Connector readiness report: ${cfg.readinessReportFile}`);
  console.log(`Connector readiness dashboard: ${cfg.readinessDashboardFile}`);
  console.log(`Connector tuning suggestions: ${cfg.tuningOutputFile}`);
  console.log(`[CONNECTOR-READINESS] status=${status} connectors=${readiness.summary.connectors} blocking=${readiness.summary.blockingViolations}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[CONNECTOR-READINESS] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase22 connector readiness failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
