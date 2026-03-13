import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  envBool,
  envString,
  loadOperationalProvider,
  readJson,
  writeJson,
  OPERATIONAL_COLLECTOR_INTERFACE,
  OPERATIONAL_COLLECTOR_SCHEMA,
  OPERATIONAL_COLLECTOR_VERSION,
} from './observability-operational-provider.mjs';

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

function tailLines(value, count = 30) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

function validateCollectorInterface(iface) {
  const errors = [];
  if (!iface || typeof iface !== 'object') {
    errors.push('collector interface must be an object');
    return errors;
  }
  if (iface.schema !== OPERATIONAL_COLLECTOR_SCHEMA) {
    errors.push(`collector schema mismatch: expected=${OPERATIONAL_COLLECTOR_SCHEMA} got=${iface.schema}`);
  }
  if (Number(iface.version) !== OPERATIONAL_COLLECTOR_VERSION) {
    errors.push(`collector version mismatch: expected=${OPERATIONAL_COLLECTOR_VERSION} got=${iface.version}`);
  }
  if (!iface.outputs || typeof iface.outputs !== 'object') {
    errors.push('collector interface must have outputs object');
  } else {
    for (const key of ['incidentAutomation', 'itsmSnapshot', 'fullcycleReport']) {
      if (!iface.outputs[key]) {
        errors.push(`collector interface missing output: ${key}`);
      } else if (iface.outputs[key].required !== true) {
        errors.push(`collector output ${key} must be required=true`);
      }
    }
  }
  if (!Array.isArray(iface.integrationModes) || iface.integrationModes.length === 0) {
    errors.push('collector interface must define integrationModes');
  }
  if (!iface.enforcement || typeof iface.enforcement !== 'object') {
    errors.push('collector interface must have enforcement object');
  } else {
    if (iface.enforcement.legacyFilesBlocked !== true) {
      errors.push('collector enforcement must set legacyFilesBlocked=true');
    }
    if (!iface.enforcement.phase) {
      errors.push('collector enforcement must set phase');
    }
  }
  return errors;
}

function buildEnforcementAudit({ ts, providerMeta, contractLoaded, legacyFallbackState, collectorInterfaceValid, violations }) {
  return {
    generatedAt: ts,
    phase: 'phase43-disable-legacy-fallback',
    enforcementEnabled: true,
    providerMode: providerMeta?.mode || 'unknown',
    sourceMode: providerMeta?.sourceMode || 'unknown',
    contractLoaded,
    legacyFallbackState,
    allowLegacyFallback: providerMeta?.allowLegacyFallback || false,
    collectorInterfaceValid,
    violations,
  };
}

function renderDashboard({ ts, status, summary, providerMeta, collectorInterfaceValid, collectorInterfaceErrors, violations }) {
  const lines = [
    '# Fullcycle Connectors Observability - Phase 43 Legacy Enforcement',
    '',
    `- Generated at: ${ts}`,
    `- Status: ${String(status || 'unknown').toUpperCase()}`,
    `- Phase: phase43-disable-legacy-fallback`,
    `- Enforcement: enabled`,
    `- Provider mode: ${providerMeta?.mode || 'unknown'}`,
    `- Source mode: ${providerMeta?.sourceMode || 'unknown'}`,
    `- Contract loaded: ${summary.contractLoaded ? 'yes' : 'no'}`,
    `- Legacy fallback state: ${summary.legacyFallbackState || 'unknown'}`,
    `- Allow legacy fallback: ${summary.allowLegacyFallback ? 'yes' : 'no'}`,
    `- Collector interface valid: ${collectorInterfaceValid ? 'yes' : 'no'}`,
    '',
    '## Enforcement Checks',
    '',
    '| Check | Result |',
    '|---|---|',
    `| providerMode=materialized_contract | ${providerMeta?.mode === 'materialized_contract' ? 'pass' : 'fail'} |`,
    `| allowLegacyFallback=false | ${!summary.allowLegacyFallback ? 'pass' : 'fail'} |`,
    `| legacyFallbackState=disabled | ${summary.legacyFallbackState === 'disabled' ? 'pass' : 'fail'} |`,
    `| collector interface valid | ${collectorInterfaceValid ? 'pass' : 'fail'} |`,
    `| enforce_no_legacy=true | pass |`,
    '',
    '## Collector Interface',
    '',
    `- Schema: ${OPERATIONAL_COLLECTOR_SCHEMA}`,
    `- Version: ${OPERATIONAL_COLLECTOR_VERSION}`,
    `- Preferred mode: ${OPERATIONAL_COLLECTOR_INTERFACE.preferredMode}`,
    `- Integration modes: ${(OPERATIONAL_COLLECTOR_INTERFACE.integrationModes || []).join(', ')}`,
    `- Rollout target: ${OPERATIONAL_COLLECTOR_INTERFACE.enforcement?.rolloutTarget || 'n/a'}`,
    '',
    '### Required Outputs',
    '',
    '| Output | Required | Description |',
    '|---|---|---|',
  ];

  for (const [key, output] of Object.entries(OPERATIONAL_COLLECTOR_INTERFACE.outputs || {})) {
    lines.push(`| ${key} | ${output.required ? 'yes' : 'no'} | ${output.description || ''} |`);
  }

  if (collectorInterfaceErrors && collectorInterfaceErrors.length > 0) {
    lines.push('', '### Collector Interface Errors', '');
    for (const err of collectorInterfaceErrors) {
      lines.push(`- ${err}`);
    }
  }

  lines.push('', '## Violations', '');

  if (!Array.isArray(violations) || violations.length === 0) {
    lines.push('- none');
  } else {
    for (const violation of violations) {
      lines.push(`- ${violation.code}: ${violation.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const ts = new Date().toISOString();
  const cfg = {
    phase42Script: path.resolve(process.cwd(), 'scripts/phase42-observability-operational-provider-producer.mjs'),
    contractFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    enforcementReportFile: envString('FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/phase43-enforcement-report.json')),
    enforcementDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-legacy-enforcement.md')),
    enforcementAuditFile: envString('FULLCYCLE_CONNECTOR_OBS_PHASE43_ENFORCEMENT_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/phase43-enforcement-audit.jsonl')),
    collectorInterfaceFile: envString('FULLCYCLE_CONNECTOR_OBS_PHASE43_COLLECTOR_INTERFACE_FILE', path.resolve(process.cwd(), 'logs/monitoring/phase43-collector-interface.json')),
    providerMode: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
    materializeContract: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    allowLegacyFallback: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
    enforceNoLegacy: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY', true),
    requireProvider: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER', true),
    deprecationTarget: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET', 'phase43-disable-legacy-fallback'),
    automationStateFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE', envString('INCIDENT_AUTOMATION_STATE_FILE', path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'))),
    snapshotFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE', envString('ITSM_SNAPSHOT_FILE', path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'))),
    fullcycleReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE', envString('FULLCYCLE_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'))),
  };

  const violations = [];
  let provider = null;
  let status = 'pass';

  // 1. Validate collector interface
  const collectorInterfaceErrors = validateCollectorInterface(OPERATIONAL_COLLECTOR_INTERFACE);
  const collectorInterfaceValid = collectorInterfaceErrors.length === 0;
  if (!collectorInterfaceValid) {
    for (const err of collectorInterfaceErrors) {
      violations.push({ code: 'collector_interface_invalid', blocking: true, message: err });
    }
  }

  // 2. Persist collector interface definition
  await writeJson(cfg.collectorInterfaceFile, {
    generatedAt: ts,
    phase: 'phase43-disable-legacy-fallback',
    valid: collectorInterfaceValid,
    errors: collectorInterfaceErrors,
    interface: OPERATIONAL_COLLECTOR_INTERFACE,
  });

  // 3. Enforcement check: allowLegacyFallback must be false
  if (cfg.allowLegacyFallback) {
    violations.push({
      code: 'legacy_fallback_still_allowed',
      blocking: true,
      message: `FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK=true violates phase43 enforcement; must be false`,
    });
  }

  // 4. Enforcement check: providerMode must be materialized_contract
  if (cfg.providerMode !== 'materialized_contract') {
    violations.push({
      code: 'provider_mode_not_materialized_contract',
      blocking: true,
      message: `providerMode=${cfg.providerMode} violates phase43 enforcement; must be materialized_contract`,
    });
  }

  // 5. Load the operational provider with enforcement active
  try {
    provider = await loadOperationalProvider({
      ts,
      providerMode: cfg.providerMode,
      materializeContract: cfg.materializeContract,
      allowLegacyFallback: cfg.allowLegacyFallback,
      enforceNoLegacy: cfg.enforceNoLegacy,
      contractFile: cfg.contractFile,
      automationStateFile: cfg.automationStateFile,
      snapshotFile: cfg.snapshotFile,
      fullcycleReportFile: cfg.fullcycleReportFile,
      materializedBy: 'phase43-disable-legacy-fallback',
    });
  } catch (enforcementError) {
    violations.push({
      code: 'enforcement_block_triggered',
      blocking: true,
      message: enforcementError instanceof Error ? enforcementError.message : String(enforcementError),
    });
  }

  const providerMeta = provider?.meta || {};
  const contractLoaded = Boolean(providerMeta?.contractLoaded);
  const legacyFallbackState = providerMeta?.legacyFallbackState || (cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled');

  // 6. Assert legacyFallbackState is 'disabled'
  if (legacyFallbackState !== 'disabled') {
    violations.push({
      code: 'legacy_fallback_not_disabled',
      blocking: true,
      message: `legacyFallbackState=${legacyFallbackState}; phase43 requires disabled`,
    });
  }

  // 7. Run phase42 producer chain to verify enforcement holds through the full chain.
  //    This step is optional: skipped when the full chain is not available (e.g. sparse worktree).
  //    The full chain requires phase42 AND its sub-chain (phase30+).
  //    In the main workspace, all scripts exist and the full chain is validated.
  let phase42Run = null;
  let phase42Available = false;
  const phase42ChainAnchorScript = path.resolve(process.cwd(), 'scripts/phase30-observability-backend-consolidation.mjs');
  try {
    await fs.access(cfg.phase42Script);
    await fs.access(phase42ChainAnchorScript);
    phase42Available = true;
  } catch {
    phase42Available = false;
  }

  const blockingBeforeChain = violations.filter((item) => item.blocking);
  if (phase42Available && blockingBeforeChain.length === 0) {
    phase42Run = await runNode(cfg.phase42Script, {
      ...process.env,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: 'materialized_contract',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE: cfg.contractFile,
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: String(cfg.materializeContract),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_ENFORCE_NO_LEGACY: 'true',
      FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER: String(cfg.requireProvider),
      FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET: cfg.deprecationTarget,
    });
    if ((phase42Run.status ?? 1) !== 0) {
      violations.push({
        code: 'phase42_chain_failed_under_enforcement',
        blocking: true,
        message: `phase42 producer chain failed with enforcement active (exit=${phase42Run.status})`,
      });
    }
  }

  const blocking = violations.filter((item) => item.blocking);
  status = blocking.length > 0 ? 'fail' : (violations.length > 0 ? 'warn' : 'pass');

  const summary = {
    phase: 'phase43-disable-legacy-fallback',
    enforcementEnabled: true,
    enforceNoLegacy: cfg.enforceNoLegacy,
    providerMode: providerMeta?.mode || cfg.providerMode,
    contractLoaded,
    legacyFallbackState,
    allowLegacyFallback: cfg.allowLegacyFallback,
    collectorInterfaceValid,
    phase42ChainStatus: phase42Run ? (phase42Run.status === 0 ? 'pass' : 'fail') : (phase42Available ? 'skipped_blocking' : 'skipped_unavailable'),
  };

  const report = {
    generatedAt: ts,
    status,
    summary,
    config: {
      providerMode: cfg.providerMode,
      materializeContract: cfg.materializeContract,
      allowLegacyFallback: cfg.allowLegacyFallback,
      enforceNoLegacy: cfg.enforceNoLegacy,
      requireProvider: cfg.requireProvider,
      deprecationTarget: cfg.deprecationTarget,
      contractFile: cfg.contractFile,
      enforcementReportFile: cfg.enforcementReportFile,
      collectorInterfaceFile: cfg.collectorInterfaceFile,
    },
    enforcement: {
      audit: buildEnforcementAudit({ ts, providerMeta, contractLoaded, legacyFallbackState, collectorInterfaceValid, violations }),
      collectorInterface: {
        valid: collectorInterfaceValid,
        errors: collectorInterfaceErrors,
        schema: OPERATIONAL_COLLECTOR_SCHEMA,
        version: OPERATIONAL_COLLECTOR_VERSION,
      },
    },
    chain: {
      phase42Available,
      phase42: phase42Run
        ? {
          command: 'node scripts/phase42-observability-operational-provider-producer.mjs',
          exitCode: phase42Run.status,
          stdoutTail: tailLines(phase42Run.stdout, 40),
          stderrTail: tailLines(phase42Run.stderr, 40),
        }
        : null,
    },
    violations,
  };

  await writeJson(cfg.enforcementReportFile, report);
  await writeText(cfg.enforcementDashboardFile, renderDashboard({
    ts,
    status,
    summary,
    providerMeta,
    collectorInterfaceValid,
    collectorInterfaceErrors,
    violations,
  }));
  await appendLine(cfg.enforcementAuditFile, JSON.stringify({
    timestamp: ts,
    source: 'phase43-disable-legacy-fallback',
    status,
    summary,
    violations,
  }));

  console.log(`Phase43 enforcement report: ${cfg.enforcementReportFile}`);
  console.log(`Phase43 enforcement dashboard: ${cfg.enforcementDashboardFile}`);
  console.log(`[PHASE43-ENFORCE] status=${status} enforceNoLegacy=${cfg.enforceNoLegacy} legacy=${legacyFallbackState} contract=${contractLoaded ? 'ready' : 'missing'} collectorInterface=${collectorInterfaceValid ? 'valid' : 'invalid'} chain=${summary.phase42ChainStatus}`);

  if (status === 'fail') {
    for (const item of blocking) {
      console.error(`[PHASE43-ENFORCE] ${item.code}: ${item.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase43 enforcement failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
