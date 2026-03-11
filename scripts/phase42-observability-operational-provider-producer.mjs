import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { envBool, envString, loadOperationalProvider, readJson, writeJson } from './observability-operational-provider.mjs';

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

function renderDashboard({ ts, status, summary, providerMeta, contract, backendReport, violations }) {
  const sources = contract?.sources || providerMeta?.sources || {};
  const lines = [
    '# Fullcycle Connectors Operational Producer',
    '',
    `- Generated at: ${ts}`,
    `- Status: ${String(status || 'unknown').toUpperCase()}`,
    `- Producer mode: ${summary.producerMode || 'unknown'}`,
    `- Contract loaded: ${summary.contractLoaded ? 'yes' : 'no'}`,
    `- Contract version: ${summary.contractVersion || 'n/a'}`,
    `- Contract schema: ${summary.contractSchema || 'n/a'}`,
    `- Backend status: ${summary.backendStatus || 'unknown'}`,
    `- Legacy fallback state: ${summary.legacyFallbackState || 'unknown'}`,
    `- Deprecation target: ${summary.deprecationTarget || 'n/a'}`,
    `- Collector enabled: ${summary.collectorEnabled ? 'yes' : 'no'}`,
    `- Collector mode: ${summary.collectorMode || 'n/a'}`,
    '',
    '## Source Summary',
    '',
    '| Source | Loaded | Timestamp | Count / Status |',
    '|---|---|---|---|',
    `| Incident automation | ${sources.incidentAutomation?.loaded ? 'yes' : 'no'} | ${sources.incidentAutomation?.timestamp || 'n/a'} | incidents=${sources.incidentAutomation?.incidentCount ?? 0} |`,
    `| ITSM snapshot | ${sources.itsmSnapshot?.loaded ? 'yes' : 'no'} | ${sources.itsmSnapshot?.timestamp || 'n/a'} | paging=${sources.itsmSnapshot?.pagingCount ?? 0}, tickets=${sources.itsmSnapshot?.ticketCount ?? 0} |`,
    `| Fullcycle report | ${sources.fullcycleReport?.loaded ? 'yes' : 'no'} | ${sources.fullcycleReport?.timestamp || 'n/a'} | status=${sources.fullcycleReport?.status || 'unknown'} |`,
    '',
    '## Backend Consumer',
    '',
    `- Backend report status: ${backendReport?.status || 'unknown'}`,
    `- Backend source mode: ${backendReport?.config?.sourceMode || backendReport?.summary?.sourceMode || 'unknown'}`,
    `- Backend provider mode: ${backendReport?.operationalProvider?.mode || 'unknown'}`,
    '',
    '## Violations',
  ];

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
    phase41Script: path.resolve(process.cwd(), 'scripts/phase41-observability-operational-provider-contract.mjs'),
    contractFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-provider.json')),
    providerDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-operational-provider.md')),
    producerReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-producer-report.json')),
    producerDashboardFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_DASHBOARD_FILE', path.resolve(process.cwd(), 'docs/fullcycle-connectors-observability-operational-producer.md')),
    producerAuditFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_AUDIT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-operational-producer-audit.jsonl')),
    backendReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-connector-observability-backend-report.json')),
    providerMode: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE', 'materialized_contract'),
    producerMode: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PRODUCER_MODE', 'dedicated_script'),
    materializeContract: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE', true),
    allowLegacyFallback: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK', false),
    requireProvider: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER', true),
    requireProducer: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PRODUCER', true),
    deprecationTarget: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_DEPRECATION_TARGET', 'phase43-disable-legacy-fallback'),
    automationStateFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_STATE_FILE', envString('INCIDENT_AUTOMATION_STATE_FILE', path.resolve(process.cwd(), 'logs/monitoring/incident-automation-state.json'))),
    snapshotFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_SNAPSHOT_FILE', envString('ITSM_SNAPSHOT_FILE', path.resolve(process.cwd(), 'logs/monitoring/itsm-snapshot.json'))),
    fullcycleReportFile: envString('FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_REPORT_FILE', envString('FULLCYCLE_REPORT_FILE', path.resolve(process.cwd(), 'logs/monitoring/fullcycle-governance-report.json'))),
    useCollector: envBool('FULLCYCLE_CONNECTOR_OBS_BACKEND_USE_COLLECTOR', true),  // phase46: collector is now the default path
    collectorMode: envString('FULLCYCLE_CONNECTOR_OBS_COLLECTOR_MODE', 'file'),
  };

  const producerDescriptor = {
    mode: cfg.producerMode,
    generatedAt: ts,
    ready: true,
    reportFile: cfg.producerReportFile,
    dashboardFile: cfg.producerDashboardFile,
    auditFile: cfg.producerAuditFile,
    legacyFallbackAllowed: cfg.allowLegacyFallback,
    legacyFallbackState: cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled',
    deprecationTarget: cfg.deprecationTarget,
  };

  const violations = [];
  let phase41Run = null;
  let backendReport = null;
  let provider = null;
  let status = 'pass';

  try {
    // phase44: optionally use the dedicated collector to supply sources
    let collectorSources = null;
    if (cfg.useCollector) {
      try {
        const collectorScript = path.resolve(process.cwd(), 'scripts/phase44-operational-collector.mjs');
        const { collectOperationalSources } = await import(collectorScript);
        const collectorResult = await collectOperationalSources({
          ts,
          mode: cfg.collectorMode,
          automationStateFile: cfg.automationStateFile,
          snapshotFile: cfg.snapshotFile,
          fullcycleReportFile: cfg.fullcycleReportFile,
        });
        if (collectorResult.valid) {
          collectorSources = collectorResult.sources;
        } else {
          violations.push({
            code: 'collector_validation_failed',
            blocking: false,
            message: `collector returned invalid sources: ${collectorResult.validationErrors.join('; ')}`,
          });
        }
      } catch (collectorErr) {
        violations.push({
          code: 'collector_unavailable',
          blocking: false,
          message: `phase44 collector could not be loaded: ${collectorErr instanceof Error ? collectorErr.message : String(collectorErr)}`,
        });
      }
    }

    provider = await loadOperationalProvider({
      ts,
      providerMode: cfg.providerMode,
      materializeContract: cfg.materializeContract,
      allowLegacyFallback: cfg.allowLegacyFallback,
      contractFile: cfg.contractFile,
      automationStateFile: cfg.automationStateFile,
      snapshotFile: cfg.snapshotFile,
      fullcycleReportFile: cfg.fullcycleReportFile,
      materializedBy: 'phase42-observability-operational-provider-producer',
      producer: producerDescriptor,
      collectorSources,
    });

    const providerMeta = provider.meta || {};
    if (cfg.allowLegacyFallback) {
      violations.push({
        code: 'legacy_fallback_deprecated_still_enabled',
        blocking: false,
        message: 'legacy fallback remains enabled; official path should move to disabled state',
      });
    }
    if (cfg.requireProducer && !providerMeta.contractLoaded) {
      violations.push({
        code: 'operational_producer_contract_unavailable',
        blocking: true,
        message: `producer could not prepare contract at ${cfg.contractFile}`,
      });
    }

    const blockingBeforeConsumer = violations.filter((item) => item.blocking);
    if (blockingBeforeConsumer.length === 0) {
      phase41Run = await runNode(cfg.phase41Script, {
        ...process.env,
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_PROVIDER_MODE: 'materialized_contract',
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_CONTRACT_FILE: cfg.contractFile,
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_MATERIALIZE: 'false',
        FULLCYCLE_CONNECTOR_OBS_BACKEND_OPERATIONAL_ALLOW_LEGACY_FALLBACK: 'false',
        FULLCYCLE_CONNECTOR_OBS_BACKEND_REQUIRE_OPERATIONAL_PROVIDER: String(cfg.requireProvider),
      });
      if ((phase41Run.status ?? 1) !== 0) {
        violations.push({
          code: 'phase41_backend_consumer_failed',
          blocking: true,
          message: `phase41 consumer exited with status=${phase41Run.status}`,
        });
      }
    }

    backendReport = phase41Run && (phase41Run.status ?? 1) === 0
      ? await readJson(cfg.backendReportFile, null)
      : null;
    const blocking = violations.filter((item) => item.blocking);
    status = blocking.length > 0 ? 'fail' : (violations.length > 0 ? 'warn' : 'pass');

    const summary = {
      producerMode: providerMeta?.producerMode || cfg.producerMode,
      contractLoaded: Boolean(providerMeta?.contractLoaded),
      contractVersion: providerMeta?.contractVersion || provider?.contract?.version || null,
      contractSchema: providerMeta?.contractSchema || provider?.contract?.schema || null,
      loadedSources: Number(providerMeta?.summary?.loadedSources || 0),
      missingSources: Number(providerMeta?.summary?.missingSources || 0),
      backendStatus: backendReport?.status || (phase41Run ? 'unknown' : 'skipped'),
      backendProviderMode: backendReport?.operationalProvider?.mode || null,
      legacyFallbackState: providerMeta?.legacyFallbackState || producerDescriptor.legacyFallbackState,
      legacyFallbackAllowed: providerMeta?.legacyFallbackAllowed === true || cfg.allowLegacyFallback,
      deprecationTarget: providerMeta?.deprecationTarget || cfg.deprecationTarget,
      // phase46: expose collector state in summary for smoke checks and governance
      collectorEnabled: cfg.useCollector,
      collectorMode: cfg.useCollector ? cfg.collectorMode : 'disabled',
    };

    const report = {
      generatedAt: ts,
      status,
      summary,
      config: {
        providerMode: cfg.providerMode,
        producerMode: cfg.producerMode,
        materializeContract: cfg.materializeContract,
        requireProvider: cfg.requireProvider,
        requireProducer: cfg.requireProducer,
        allowLegacyFallback: cfg.allowLegacyFallback,
        deprecationTarget: cfg.deprecationTarget,
        contractFile: cfg.contractFile,
        producerReportFile: cfg.producerReportFile,
        producerDashboardFile: cfg.producerDashboardFile,
        producerAuditFile: cfg.producerAuditFile,
        phase41Script: cfg.phase41Script,
        useCollector: cfg.useCollector,      // phase46
        collectorMode: cfg.collectorMode,    // phase46
      },
      producer: {
        operationalProvider: providerMeta,
        contract: provider?.contract || null,
      },
      backend: {
        execution: phase41Run
          ? {
            command: 'node scripts/phase41-observability-operational-provider-contract.mjs',
            exitCode: phase41Run.status,
            stdoutTail: tailLines(phase41Run.stdout, 40),
            stderrTail: tailLines(phase41Run.stderr, 40),
          }
          : null,
        report: backendReport,
      },
      violations,
    };

    await writeJson(cfg.producerReportFile, report);
    await writeText(cfg.producerDashboardFile, renderDashboard({
      ts,
      status,
      summary,
      providerMeta,
      contract: provider?.contract || null,
      backendReport,
      violations,
    }));
    await appendLine(cfg.producerAuditFile, JSON.stringify({
      timestamp: ts,
      source: 'phase42-observability-operational-provider-producer',
      status,
      summary,
      violations,
    }));

    console.log(`Operational producer report: ${cfg.producerReportFile}`);
    console.log(`Operational producer dashboard: ${cfg.producerDashboardFile}`);
    console.log(`[OBS-BACKEND-OPS-PRODUCER] status=${status} producer=${summary.producerMode || 'unknown'} contract=${summary.contractLoaded ? 'ready' : 'missing'} legacy=${summary.legacyFallbackState || 'unknown'} backend=${summary.backendStatus || 'unknown'}`);

    if (status === 'fail') {
      for (const item of blocking) {
        console.error(`[OBS-BACKEND-OPS-PRODUCER] ${item.code}: ${item.message}`);
      }
      process.exit(1);
    }
  } catch (error) {
    const failure = {
      generatedAt: ts,
      status: 'fail',
      summary: {
        message: error instanceof Error ? error.message : String(error),
        contractFile: cfg.contractFile,
        producerMode: cfg.producerMode,
      },
      violations: [
        {
          code: 'phase42_operational_producer_failed',
          blocking: true,
          message: error instanceof Error ? error.stack || error.message : String(error),
        },
      ],
    };
    await writeJson(cfg.producerReportFile, failure);
    await writeText(cfg.producerDashboardFile, renderDashboard({
      ts,
      status: 'fail',
      summary: {
        producerMode: cfg.producerMode,
        contractLoaded: false,
        contractVersion: null,
        contractSchema: null,
        loadedSources: 0,
        missingSources: 0,
        backendStatus: 'failed',
        legacyFallbackState: cfg.allowLegacyFallback ? 'deprecated_allowed' : 'disabled',
        deprecationTarget: cfg.deprecationTarget,
      },
      providerMeta: null,
      contract: null,
      backendReport: null,
      violations: failure.violations,
    })).catch(() => {});
    await appendLine(cfg.producerAuditFile, JSON.stringify({
      timestamp: ts,
      source: 'phase42-observability-operational-provider-producer',
      status: 'fail',
      summary: failure.summary,
      violations: failure.violations,
    })).catch(() => {});
    console.error(`Unexpected phase42 operational producer failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Unexpected phase42 fatal failure: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
