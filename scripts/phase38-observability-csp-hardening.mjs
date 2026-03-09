import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const ROUTES_FILE = path.resolve(ROOT, 'apps/api/src/routes/observability.ts');
const PANEL_TEMPLATE_FILE = path.resolve(ROOT, 'scripts/phase31-observability-panel-backend-template.html');
const PHASE24_DRILL = path.resolve(ROOT, 'scripts/phase24-observability-drill.mjs');
const PHASE31_DRILL = path.resolve(ROOT, 'scripts/phase31-observability-panel-backend-integration-drill.mjs');

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

function runNode(scriptPath, env = {}) {
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
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function runDetails(result) {
  const details = [];
  if (result.stdout?.trim()) details.push(`stdout=${result.stdout.trim()}`);
  if (result.stderr?.trim()) details.push(`stderr=${result.stderr.trim()}`);
  return details.length > 0 ? ` | ${details.join(' | ')}` : '';
}

async function main() {
  const [phase24Run, phase31Run, routeSource, panelTemplate] = await Promise.all([
    runNode(PHASE24_DRILL),
    runNode(PHASE31_DRILL),
    fs.readFile(ROUTES_FILE, 'utf-8'),
    fs.readFile(PANEL_TEMPLATE_FILE, 'utf-8'),
  ]);

  assert((phase24Run.status ?? 1) === 0, `phase24 drill must pass${runDetails(phase24Run)}`);
  assert((phase31Run.status ?? 1) === 0, `phase31 drill must pass${runDetails(phase31Run)}`);

  assert(routeSource.includes("style-src 'self'"), "observability route CSP must restrict style-src to 'self'");
  assert(routeSource.includes("script-src 'self'"), "observability route CSP must restrict script-src to 'self'");
  assert(!routeSource.includes("style-src 'self' 'unsafe-inline'"), 'observability route CSP must remove inline style allowance');
  assert(!routeSource.includes("script-src 'self' 'unsafe-inline'"), 'observability route CSP must remove inline script allowance');
  assert(routeSource.includes("/observability/connectors/assets/:asset"), 'observability dashboard asset route must exist');
  assert(routeSource.includes("/observability/connectors/realtime/assets/:asset"), 'observability realtime asset route must exist');

  assert(panelTemplate.includes('./assets/fullcycle-connectors-observability-ops-panel.css'), 'panel template must reference external css asset');
  assert(panelTemplate.includes('./assets/fullcycle-connectors-observability-ops-panel.js'), 'panel template must reference external js asset');
  assert(panelTemplate.includes('id="phase31-panel-data"'), 'panel template must expose bootstrap template');
  assert(!/<style[\s>]/i.test(panelTemplate), 'panel template must not contain inline style tags');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(panelTemplate), 'panel template must not contain inline script tags');

  console.log('[OK] phase38 csp/assets hardening validated');
  console.log(`[OK] phase24=${PHASE24_DRILL}`);
  console.log(`[OK] phase31=${PHASE31_DRILL}`);
  console.log(`[OK] routes=${ROUTES_FILE}`);
}

main().catch((error) => {
  console.error(`Unexpected phase38 failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
