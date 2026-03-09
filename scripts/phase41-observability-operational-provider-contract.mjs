import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { envBool, envString, readJson } from './observability-operational-provider.mjs';

function runNode(scriptPath, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: process.cwd(),
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

async function writeText(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, payload, 'utf-8');
}

async function appendLine(filePath, line) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, 'utf-8');
}

function renderProviderDashboard({ ts, contract, report }) {
  const provider = report?.operationalProvider || {};
  const sources = contract?.sources || {};
  const lines = [
    '# Fullcycle Connectors Operational Provider',
    '',
    `- Generated at: ${ts}`,
    `- Backend status: ${String(report?.status || 'unknown').toUpperCase()}`,
    `- Provider mode: ${provider.mode || 'unknown'}`,
    `- Contract loaded: ${provider.contractLoaded ? 'yes' : 'no'}`,
    `- Contract version: ${provider.contractVersion || 'n/a'}`,
    `- Contract schema: ${provider.contractSchema || 'n/a'}`,
    `- Contract file: ${provider.contractFile || 'n/a'}`,
    `- Materialization mode: ${provider.materializationMode || 'n/a'}`,
    `- Materialized by: ${provider.materializedBy || 'n/a'}`,
    '',
    '## Source Summary',
    '',
    '| Source | Loaded | Timestamp | Count / Status |',
    '|---|---|---|---|',
    `| Incident automation | ${sources.incidentAutomation?.loaded ? 'yes' : 'no'} | ${sources.incidentAutomation?.timestamp || 'n/a'} | incidents=${sources.incidentAutomation?.incidentCount ?? 0} |`,
    `| ITSM snapshot | ${sources.itsmSnapshot?.loaded ? 'yes' : 'no'} | ${sources.itsmSnapshot?.timestamp || 'n/a'} | paging=${sources.itsmSnapshot?.pagingCount ?? 0}, tickets=${sources.itsmSnapshot?.ticketCount ?? 0} |`,
    `| Fullcycle report | ${sources.fullcycleReport?.loaded ? 'yes' : 'no'} | ${sources.fullcycleReport?.timestamp || 'n/a'} | status=${sources.fullcycleReport?.status || 'unknown'} |`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const ts = new Date().toISOString();
  const cfg = {
    phase40Script: path.resolve(process.cwd(), 'scripts/phase40-observability-operational-source-health.mjs'),
    backendReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json')),
    backendStoreFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_STORE_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-store.json')),
    backendAuditFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-audit.jsonl')),
    contractFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    providerDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-operational-provider.md')),
    providerMode: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
    materializeContract: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    requireProvider: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER', true),
  };

  const phase40Run = await runNode(cfg.phase40Script, {
    ...process.env,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: cfg.providerMode,
    FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: String(cfg.materializeContract),
  });
  if ((phase40Run.status ?? 1) !== 0) {
    if (phase40Run.stdout.trim()) process.stdout.write(phase40Run.stdout);
    if (phase40Run.stderr.trim()) process.stderr.write(phase40Run.stderr);
    throw new Error(`phase40 backend wrapper failed with status=${phase40Run.status}`);
  }

  const [report, store, contract] = await Promise.all([
    readJson(cfg.backendReportFile, null),
    readJson(cfg.backendStoreFile, null),
    readJson(cfg.contractFile, null),
  ]);
  if (!report || !store) {
    throw new Error('phase41 backend prerequisites missing after phase40 run');
  }
  const provider = report?.operationalProvider || store?.operationalProvider || store?.oncall?.operationalProvider || null;
  if (cfg.requireProvider && (!provider || cfg.providerMode === 'materialized_contract' && !contract)) {
    throw new Error(`operational provider contract unavailable at ${cfg.contractFile}`);
  }

  await writeText(cfg.providerDashboardFile, renderProviderDashboard({ ts, contract, report }));
  await appendLine(cfg.backendAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase41-observability-operational-provider-contract',
    status: report.status,
    operationalProvider: provider,
    contractFile: cfg.contractFile,
    providerDashboardFile: cfg.providerDashboardFile,
  }));

  console.log(`Operational provider contract: ${cfg.contractFile}`);
  console.log(`Operational provider dashboard: ${cfg.providerDashboardFile}`);
  console.log(`[OBS-BACKEND-OPS-PROVIDER] status=${report.status} provider=${provider?.mode || 'unknown'} contract=${provider?.contractLoaded ? 'ready' : 'missing'} loadedSources=${provider?.summary?.loadedSources ?? 'n/a'}`);
}

main().catch((error) => {
  console.error(`Unexpected phase41 operational provider failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
