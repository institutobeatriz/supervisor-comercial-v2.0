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

function endpointHeaders(adminKey, role) {
  return {
    'x-admin-key': adminKey,
    'x-observability-role': role,
  };
}

async function fetchWithTimeout(url, { headers = {}, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const bodyText = await response.text();
    return {
      ok: true,
      response,
      bodyText,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateSummaryContract(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.payload || typeof payload.payload !== 'object') return false;
  const status = String(payload.payload.status || '').toLowerCase();
  return ['pass', 'warn', 'fail', 'unknown'].includes(status);
}

function validateFeedContract(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return payload.feed && typeof payload.feed === 'object';
}

function validateHistoryContract(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!Array.isArray(payload.entries)) return false;
  return Number.isFinite(Number(payload.totalEntries));
}

function validateArchiveContract(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!Array.isArray(payload.entries)) return false;
  return Number.isFinite(Number(payload.returned));
}

async function runEndpointCheck({
  name,
  url,
  role,
  adminKey,
  timeoutMs,
  maxLatencyMs,
  allowUnavailable,
  requireDashboardHtml,
}) {
  const expectedStatuses = allowUnavailable ? [200, 503] : [200];
  const call = await fetchWithTimeout(url, {
    headers: endpointHeaders(adminKey, role),
    timeoutMs,
  });

  if (!call.ok) {
    return {
      name,
      role,
      status: null,
      latencyMs: call.durationMs,
      ok: false,
      contentType: null,
      contractValid: false,
      details: call.error,
      expectedStatuses,
    };
  }

  const status = call.response.status;
  const contentType = String(call.response.headers.get('content-type') || '').toLowerCase();
  let contractValid = true;
  let details = '';

  if (status === 200) {
    if (name === 'dashboard') {
      if (requireDashboardHtml) {
        const hasHtmlType = contentType.includes('text/html');
        const looksLikeHtml = /<!doctype html|<html/i.test(call.bodyText);
        contractValid = hasHtmlType && looksLikeHtml;
        if (!contractValid) details = 'dashboard response is not valid HTML';
      }
    } else {
      try {
        const parsed = JSON.parse(call.bodyText);
        if (name === 'summary') contractValid = validateSummaryContract(parsed);
        if (name === 'feed') contractValid = validateFeedContract(parsed);
        if (name === 'history') contractValid = validateHistoryContract(parsed);
        if (name === 'archive') contractValid = validateArchiveContract(parsed);
        if (!contractValid) details = 'response does not match expected contract';
      } catch {
        contractValid = false;
        details = 'response is not valid JSON';
      }
    }
  }

  const statusValid = expectedStatuses.includes(status);
  const latencyValid = call.durationMs <= maxLatencyMs;

  return {
    name,
    role,
    status,
    latencyMs: call.durationMs,
    ok: statusValid && latencyValid && (status !== 200 || contractValid),
    contentType,
    contractValid,
    details,
    expectedStatuses,
  };
}

function payloadAgeMinutes(summaryResult, nowMs) {
  if (!summaryResult || summaryResult.status !== 200) return null;
  try {
    const parsed = JSON.parse(summaryResult._rawBody || '{}');
    const generatedAt = parsed?.payload?.generatedAt;
    const payloadMs = parseMs(generatedAt);
    if (!Number.isFinite(payloadMs)) return null;
    return round((nowMs - payloadMs) / 60_000, 2);
  } catch {
    return null;
  }
}

async function main() {
  const ts = nowIso();
  const nowMs = parseMs(ts);
  const cfg = {
    apiBase: (process.env.FULLCYCLE_CONNECTOR_OBS_API_BASE || process.env.CI_API_URL || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    adminKey: process.env.FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY || process.env.ADMIN_API_KEY || '',
    timeoutMs: Math.max(1000, envInt('FULLCYCLE_CONNECTOR_OBS_API_TIMEOUT_MS', 8000)),
    maxLatencyMs: Math.max(100, envInt('FULLCYCLE_CONNECTOR_OBS_API_MAX_LATENCY_MS', 2500)),
    maxPayloadAgeMinutes: Math.max(1, envInt('FULLCYCLE_CONNECTOR_OBS_API_MAX_PAYLOAD_AGE_MIN', 180)),
    enforceTargets: envBool('FULLCYCLE_CONNECTOR_OBS_API_ENFORCE_TARGETS', false),
    requireAllEndpoints: envBool('FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ALL_ENDPOINTS', true),
    requireRbac: envBool('FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_RBAC', true),
    requireAdminKey: envBool('FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ADMIN_KEY', true),
    requireDashboardHtml: envBool('FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_DASHBOARD_HTML', true),
    allowUnavailable: envBool('FULLCYCLE_CONNECTOR_OBS_API_ALLOW_UNAVAILABLE', false),
    reportFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-governance-report.json'),
    dashboardFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE || path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-api-governance.md'),
    auditFile: process.env.FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE || path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-api-governance-audit.jsonl'),
  };

  const endpoints = [
    { name: 'summary', path: '/api/observability/connectors/summary', role: 'operator' },
    { name: 'feed', path: '/api/observability/connectors/feed', role: 'operator' },
    { name: 'history', path: '/api/observability/connectors/history', role: 'executive' },
    { name: 'archive', path: '/api/observability/connectors/archive', role: 'executive' },
    { name: 'dashboard', path: '/api/observability/connectors/dashboard', role: 'executive' },
  ];

  const violations = [];
  if (cfg.requireAdminKey && !cfg.adminKey) {
    violations.push({
      code: 'admin_key_missing',
      blocking: true,
      message: 'FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY or ADMIN_API_KEY not configured',
    });
  }

  const endpointResults = [];
  for (const endpoint of endpoints) {
    const url = `${cfg.apiBase}${endpoint.path}`;
    const result = await runEndpointCheck({
      ...endpoint,
      url,
      adminKey: cfg.adminKey || 'missing-admin-key',
      timeoutMs: cfg.timeoutMs,
      maxLatencyMs: cfg.maxLatencyMs,
      allowUnavailable: cfg.allowUnavailable,
      requireDashboardHtml: cfg.requireDashboardHtml,
    });

    endpointResults.push(result);

    if (result.status === null) {
      violations.push({
        code: `endpoint_unreachable_${endpoint.name}`,
        blocking: true,
        message: `${endpoint.path} is unreachable (${result.details})`,
      });
      continue;
    }

    if (!result.expectedStatuses.includes(result.status)) {
      violations.push({
        code: `endpoint_status_unexpected_${endpoint.name}`,
        blocking: cfg.requireAllEndpoints,
        message: `${endpoint.path} returned ${result.status}, expected ${result.expectedStatuses.join('/')}`,
      });
    }

    if (result.latencyMs > cfg.maxLatencyMs) {
      violations.push({
        code: `endpoint_latency_exceeded_${endpoint.name}`,
        blocking: true,
        message: `${endpoint.path} latency ${result.latencyMs}ms exceeded max ${cfg.maxLatencyMs}ms`,
      });
    }

    if (result.status === 200 && !result.contractValid) {
      violations.push({
        code: `endpoint_contract_invalid_${endpoint.name}`,
        blocking: true,
        message: `${endpoint.path} contract invalid: ${result.details || 'unknown reason'}`,
      });
    }
  }

  const summaryResult = endpointResults.find((item) => item.name === 'summary') || null;
  if (summaryResult && summaryResult.status === 200 && summaryResult.contractValid) {
    const summaryCall = await fetchWithTimeout(`${cfg.apiBase}/api/observability/connectors/summary`, {
      headers: endpointHeaders(cfg.adminKey || 'missing-admin-key', 'operator'),
      timeoutMs: cfg.timeoutMs,
    });
    if (summaryCall.ok && summaryCall.response.status === 200) {
      summaryResult._rawBody = summaryCall.bodyText;
    }
  }

  const ageMinutes = payloadAgeMinutes(summaryResult, nowMs);
  if (Number.isFinite(ageMinutes) && ageMinutes > cfg.maxPayloadAgeMinutes) {
    violations.push({
      code: 'summary_payload_stale',
      blocking: true,
      message: `summary payload age ${ageMinutes}min exceeded max ${cfg.maxPayloadAgeMinutes}min`,
    });
  }

  const rbacChecks = [];
  if (cfg.requireRbac) {
    const historyOperator = await fetchWithTimeout(`${cfg.apiBase}/api/observability/connectors/history`, {
      headers: endpointHeaders(cfg.adminKey || 'missing-admin-key', 'operator'),
      timeoutMs: cfg.timeoutMs,
    });
    if (!historyOperator.ok) {
      violations.push({
        code: 'rbac_history_operator_check_unreachable',
        blocking: true,
        message: `could not validate RBAC for history endpoint (${historyOperator.error})`,
      });
      rbacChecks.push({ name: 'history_operator_forbidden', ok: false, status: null });
    } else {
      const ok = historyOperator.response.status === 403;
      if (!ok) {
        violations.push({
          code: 'rbac_history_operator_not_forbidden',
          blocking: true,
          message: `history endpoint accepted operator role with status ${historyOperator.response.status}`,
        });
      }
      rbacChecks.push({ name: 'history_operator_forbidden', ok, status: historyOperator.response.status });
    }

    const invalidRole = await fetchWithTimeout(`${cfg.apiBase}/api/observability/connectors/summary`, {
      headers: endpointHeaders(cfg.adminKey || 'missing-admin-key', 'guest'),
      timeoutMs: cfg.timeoutMs,
    });
    if (!invalidRole.ok) {
      violations.push({
        code: 'rbac_invalid_role_check_unreachable',
        blocking: true,
        message: `could not validate invalid-role RBAC check (${invalidRole.error})`,
      });
      rbacChecks.push({ name: 'summary_invalid_role_forbidden', ok: false, status: null });
    } else {
      const ok = invalidRole.response.status === 403;
      if (!ok) {
        violations.push({
          code: 'rbac_invalid_role_not_forbidden',
          blocking: true,
          message: `summary endpoint accepted invalid role with status ${invalidRole.response.status}`,
        });
      }
      rbacChecks.push({ name: 'summary_invalid_role_forbidden', ok, status: invalidRole.response.status });
    }
  }

  if (cfg.requireAdminKey) {
    const invalidKey = await fetchWithTimeout(`${cfg.apiBase}/api/observability/connectors/summary`, {
      headers: endpointHeaders('invalid-admin-key', 'operator'),
      timeoutMs: cfg.timeoutMs,
    });
    if (!invalidKey.ok) {
      violations.push({
        code: 'auth_invalid_key_check_unreachable',
        blocking: true,
        message: `could not validate invalid admin key behavior (${invalidKey.error})`,
      });
    } else if (invalidKey.response.status !== 401) {
      violations.push({
        code: 'auth_invalid_key_not_rejected',
        blocking: true,
        message: `summary endpoint returned ${invalidKey.response.status} for invalid key, expected 401`,
      });
    }
  }

  const endpointPassCount = endpointResults.filter((item) => item.ok).length;
  const endpointFailCount = endpointResults.length - endpointPassCount;
  const rbacPassCount = rbacChecks.filter((item) => item.ok).length;
  const rbacFailCount = rbacChecks.length - rbacPassCount;
  const blockingViolations = violations.filter((item) => item.blocking);

  const status = blockingViolations.length > 0
    ? (cfg.enforceTargets ? 'fail' : 'warn')
    : 'pass';

  const summary = {
    apiBase: cfg.apiBase,
    endpointsChecked: endpointResults.length,
    endpointsPassed: endpointPassCount,
    endpointsFailed: endpointFailCount,
    rbacChecks: rbacChecks.length,
    rbacPassed: rbacPassCount,
    rbacFailed: rbacFailCount,
    maxLatencyMs: cfg.maxLatencyMs,
    worstLatencyMs: endpointResults.length > 0
      ? Math.max(...endpointResults.map((item) => item.latencyMs || 0))
      : 0,
    avgLatencyMs: endpointResults.length > 0
      ? round(endpointResults.reduce((acc, item) => acc + (item.latencyMs || 0), 0) / endpointResults.length, 2)
      : 0,
    maxPayloadAgeMinutes: cfg.maxPayloadAgeMinutes,
    observedPayloadAgeMinutes: Number.isFinite(ageMinutes) ? ageMinutes : null,
    violations: violations.length,
    blockingViolations: blockingViolations.length,
  };

  const report = {
    generatedAt: ts,
    status,
    summary,
    config: cfg,
    endpoints: endpointResults,
    rbacChecks,
    violations,
  };

  await writeJson(cfg.reportFile, report);

  const dashboard = [];
  dashboard.push('# Fullcycle Connectors Observability API Governance');
  dashboard.push('');
  dashboard.push(`- Generated at: ${ts}`);
  dashboard.push(`- Status: ${status.toUpperCase()}`);
  dashboard.push(`- API base: ${cfg.apiBase}`);
  dashboard.push(`- Endpoints passed: ${summary.endpointsPassed}/${summary.endpointsChecked}`);
  dashboard.push(`- RBAC checks passed: ${summary.rbacPassed}/${summary.rbacChecks}`);
  dashboard.push(`- Worst latency: ${summary.worstLatencyMs}ms`);
  dashboard.push('');
  dashboard.push('| Endpoint | Role | Status | Latency (ms) | Contract |');
  dashboard.push('|---|---|---:|---:|---|');
  for (const endpoint of endpointResults) {
    dashboard.push(`| ${endpoint.name} | ${endpoint.role} | ${endpoint.status ?? 'ERR'} | ${endpoint.latencyMs ?? 0} | ${endpoint.contractValid ? 'ok' : 'invalid'} |`);
  }
  dashboard.push('');
  dashboard.push('## Violations');
  dashboard.push('');
  if (violations.length === 0) {
    dashboard.push('- none');
  } else {
    for (const item of violations) {
      dashboard.push(`- [${item.blocking ? 'BLOCKING' : 'INFO'}] ${item.code}: ${item.message}`);
    }
  }
  dashboard.push('');
  await writeText(cfg.dashboardFile, dashboard.join('\n'));

  await appendLine(cfg.auditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase26-observability-api-governance',
    status,
    summary,
    violations,
    reportFile: cfg.reportFile,
  }));

  console.log(`Observability API governance report: ${cfg.reportFile}`);
  console.log(`Observability API governance dashboard: ${cfg.dashboardFile}`);
  console.log(`Observability API governance audit: ${cfg.auditFile}`);
  console.log(`[OBS-API-GOVERNANCE] status=${status} endpoints=${summary.endpointsPassed}/${summary.endpointsChecked} rbac=${summary.rbacPassed}/${summary.rbacChecks} violations=${summary.violations}`);

  if (status === 'fail') {
    for (const item of blockingViolations) {
      console.error(`[OBS-API-GOVERNANCE] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase26 observability API governance failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
