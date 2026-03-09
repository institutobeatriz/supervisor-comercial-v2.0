import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.resolve(ROOT, 'scripts/phase26-observability-api-governance.mjs');
const DRILL_DIR = path.resolve(ROOT, 'logs/monitoring/phase26-drill');
const ADMIN_KEY = 'phase26-drill-admin-key';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function getRole(req) {
  return String(req.headers['x-observability-role'] || 'operator').toLowerCase();
}

function unauthorized(res) {
  res.writeHead(401, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

function forbidden(res, role, requiredRole) {
  res.writeHead(403, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Forbidden', providedRole: role, requiredRole }));
}

function okJson(res, payload) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function okHtml(res, html) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function createMockServer(mode) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    if (req.headers['x-admin-key'] !== ADMIN_KEY) {
      unauthorized(res);
      return;
    }

    const role = getRole(req);
    const operatorRoles = new Set(['operator', 'executive', 'admin']);
    const executiveRoles = new Set(['executive', 'admin']);

    const allowOperator = mode === 'fail';
    const allowInvalidRoleSummary = mode === 'fail';

    if (pathname === '/api/observability/connectors/summary') {
      if (!allowInvalidRoleSummary && !operatorRoles.has(role)) {
        forbidden(res, role, 'operator');
        return;
      }

      if (mode === 'fail') {
        okJson(res, {
          source: 'api_payload',
          summary: { broken: true },
        });
        return;
      }

      okJson(res, {
        source: 'api_payload',
        payload: {
          generatedAt: new Date().toISOString(),
          status: 'pass',
          summary: {
            environmentsTracked: 3,
            connectorsTracked: 2,
          },
        },
      });
      return;
    }

    if (pathname === '/api/observability/connectors/feed') {
      if (!operatorRoles.has(role)) {
        forbidden(res, role, 'operator');
        return;
      }
      okJson(res, {
        generatedAt: new Date().toISOString(),
        status: 'pass',
        feed: {
          summary: {
            environmentsTracked: 3,
            connectorsTracked: 2,
          },
        },
      });
      return;
    }

    if (pathname === '/api/observability/connectors/history') {
      if (!allowOperator && !executiveRoles.has(role)) {
        forbidden(res, role, 'executive');
        return;
      }
      okJson(res, {
        generatedAt: new Date().toISOString(),
        totalEntries: 2,
        entries: [
          { timestamp: new Date().toISOString(), status: 'pass', summary: {} },
          { timestamp: new Date().toISOString(), status: 'pass', summary: {} },
        ],
      });
      return;
    }

    if (pathname === '/api/observability/connectors/archive') {
      if (!executiveRoles.has(role)) {
        forbidden(res, role, 'executive');
        return;
      }
      okJson(res, {
        returned: 1,
        entries: [{ archivedAt: new Date().toISOString(), status: 'warn' }],
      });
      return;
    }

    if (pathname === '/api/observability/connectors/dashboard') {
      if (!executiveRoles.has(role)) {
        forbidden(res, role, 'executive');
        return;
      }

      if (mode === 'fail') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('dashboard-not-html');
        return;
      }

      okHtml(res, '<!doctype html><html><body><h1>Observability</h1></body></html>');
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function main() {
  await fs.mkdir(DRILL_DIR, { recursive: true });

  const reportFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-governance-report.json');
  const dashboardFile = path.resolve(DRILL_DIR, 'fullcycle-connectors-observability-api-governance.md');
  const auditFile = path.resolve(DRILL_DIR, 'fullcycle-connector-observability-api-governance-audit.jsonl');

  await fs.rm(reportFile, { force: true });
  await fs.rm(dashboardFile, { force: true });
  await fs.rm(auditFile, { force: true });

  const passServer = await createMockServer('pass');
  const passRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBS_API_BASE: passServer.baseUrl,
    FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY: ADMIN_KEY,
    FULLCYCLE_CONNECTOR_OBS_API_TIMEOUT_MS: '3000',
    FULLCYCLE_CONNECTOR_OBS_API_MAX_LATENCY_MS: '1200',
    FULLCYCLE_CONNECTOR_OBS_API_MAX_PAYLOAD_AGE_MIN: '120',
    FULLCYCLE_CONNECTOR_OBS_API_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ALL_ENDPOINTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_RBAC: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ADMIN_KEY: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_DASHBOARD_HTML: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_ALLOW_UNAVAILABLE: 'false',
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE: auditFile,
  });
  await passServer.close();

  assert((passRun.status ?? 1) === 0, 'phase26 pass run should exit 0');
  const passReport = await readJson(reportFile);
  assert(passReport?.status === 'pass', `expected pass status, got ${passReport?.status}`);
  assert((passReport?.summary?.endpointsPassed || 0) === 5, `expected 5 endpoints passed, got ${passReport?.summary?.endpointsPassed}`);
  assert((passReport?.summary?.rbacPassed || 0) >= 2, `expected RBAC checks to pass, got ${passReport?.summary?.rbacPassed}`);

  const failServer = await createMockServer('fail');
  const failRun = await runNode(SCRIPT, {
    FULLCYCLE_CONNECTOR_OBS_API_BASE: failServer.baseUrl,
    FULLCYCLE_CONNECTOR_OBS_API_ADMIN_KEY: ADMIN_KEY,
    FULLCYCLE_CONNECTOR_OBS_API_TIMEOUT_MS: '3000',
    FULLCYCLE_CONNECTOR_OBS_API_MAX_LATENCY_MS: '1200',
    FULLCYCLE_CONNECTOR_OBS_API_MAX_PAYLOAD_AGE_MIN: '120',
    FULLCYCLE_CONNECTOR_OBS_API_ENFORCE_TARGETS: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ALL_ENDPOINTS: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_RBAC: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_ADMIN_KEY: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_REQUIRE_DASHBOARD_HTML: 'true',
    FULLCYCLE_CONNECTOR_OBS_API_ALLOW_UNAVAILABLE: 'false',
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_REPORT_FILE: reportFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_DASHBOARD_FILE: dashboardFile,
    FULLCYCLE_CONNECTOR_OBS_API_GOVERNANCE_AUDIT_FILE: auditFile,
  });
  await failServer.close();

  assert((failRun.status ?? 0) !== 0, 'phase26 fail run should exit non-zero');
  const failReport = await readJson(reportFile);
  const codes = new Set((failReport?.violations || []).map((item) => item?.code));
  assert(failReport?.status === 'fail', `expected fail status, got ${failReport?.status}`);
  assert(codes.has('endpoint_contract_invalid_summary'), 'expected endpoint_contract_invalid_summary violation');
  assert(codes.has('endpoint_contract_invalid_dashboard'), 'expected endpoint_contract_invalid_dashboard violation');
  assert(codes.has('rbac_history_operator_not_forbidden'), 'expected rbac_history_operator_not_forbidden violation');
  assert(codes.has('rbac_invalid_role_not_forbidden'), 'expected rbac_invalid_role_not_forbidden violation');

  console.log('[OK] phase26 drill observability API governance pass/fail behavior validated');
  console.log(`[OK] phase26 drill report=${reportFile}`);
}

main().catch((error) => {
  console.error(`Unexpected phase26 drill failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
