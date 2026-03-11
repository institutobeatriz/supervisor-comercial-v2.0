#!/usr/bin/env node
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://app:app@localhost:5432/sales_supervisor';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || '';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const RAG_VECTOR_ENABLED = process.env.RAG_VECTOR === 'true';
const SKIP_CLEANUP = process.env.TEST_SKIP_CLEANUP === 'true';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DB_URL,
  max: 2,
});

const state = {
  passed: 0,
  failed: 0,
  failedTests: [],
  fixtures: null,
};

function log(msg) {
  console.log(`[phase3] ${msg}`);
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTest(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    state.passed += 1;
    log(`PASS ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    state.failed += 1;
    const err = error instanceof Error ? error : new Error(String(error));
    state.failedTests.push({ name, error: err.message });
    log(`FAIL ${name} (${Date.now() - startedAt}ms) -> ${err.message}`);
  }
}

function buildHeaders(headers = {}, body) {
  const merged = { ...headers };
  if (body && !merged['content-type']) {
    merged['content-type'] = 'application/json';
  }
  return merged;
}

async function http(method, path, options = {}) {
  const {
    headers = {},
    body,
    expectedStatus,
    timeoutMs = 10000,
    parseJson = true,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(headers, body),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (parseJson && contentType.includes('application/json')) {
    data = await response.json();
  } else if (parseJson) {
    data = await response.text();
  }

  if (typeof expectedStatus === 'number') {
    assert.equal(response.status, expectedStatus, `Expected ${expectedStatus}, got ${response.status} on ${method} ${path}`);
  } else if (Array.isArray(expectedStatus)) {
    assert.ok(expectedStatus.includes(response.status), `Expected one of [${expectedStatus.join(', ')}], got ${response.status} on ${method} ${path}`);
  }

  return { response, status: response.status, data, contentType };
}

async function assertSse(path, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers,
      signal: controller.signal,
    });
    assert.equal(response.status, 200, `SSE status must be 200 for ${path}`);
    const ct = response.headers.get('content-type') || '';
    assert.ok(ct.includes('text/event-stream'), `SSE content-type inválido em ${path}: ${ct}`);

    const reader = response.body?.getReader();
    ensure(reader, `Stream ausente em ${path}`);

    const chunk = await Promise.race([
      reader.read(),
      sleep(2500).then(() => ({ timeout: true })),
    ]);

    ensure(!chunk.timeout, `SSE sem evento inicial em ${path}`);
    ensure(!chunk.done, `SSE encerrado inesperadamente em ${path}`);

    const text = new TextDecoder().decode(chunk.value || new Uint8Array());
    assert.ok(text.length > 0, `SSE chunk vazio em ${path}`);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function waitFor(check, timeoutMs = 10000, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) return result;
    await sleep(intervalMs);
  }
  return null;
}

async function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || 'pipe',
      env: options.env || process.env,
      cwd: options.cwd || process.cwd(),
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString(); });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function ensureDatabaseReadyOrDelegate() {
  try {
    await dbQuery('SELECT id FROM sellers LIMIT 1');
    return false;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const looksLikeWrongDb = err.message.includes('relação "sellers" não existe')
      || err.message.includes('relation "sellers" does not exist');
    const alreadyInDocker = process.env.PHASE3_IN_DOCKER === '1';

    if (!looksLikeWrongDb || alreadyInDocker) {
      throw error;
    }

    log('Banco local sem schema do projeto detectado; delegando suíte para o container supervisor-api.');
    const localScript = 'scripts/phase3-api-contracts.mjs';
    const containerScript = '/app/scripts/phase3-api-contracts.mjs';

    await runProcess('docker', ['exec', 'supervisor-api', 'mkdir', '-p', '/app/scripts']);
    await runProcess('docker', ['cp', localScript, `supervisor-api:${containerScript}`]);

    const child = spawn(
      'docker',
      [
        'exec',
        '-e', 'PHASE3_IN_DOCKER=1',
        '-e', 'TEST_DATABASE_URL=postgresql://app:app@postgres:5432/sales_supervisor',
        '-e', `TEST_API_BASE_URL=${BASE_URL}`,
        'supervisor-api',
        'node',
        containerScript,
      ],
      { stdio: 'inherit' }
    );

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    process.exitCode = Number(exitCode || 0);
    return true;
  }
}

async function setupFixtures() {
  const testId = `phase3-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const phone = `55119${Date.now().toString().slice(-8)}`;

  const sellerResult = await dbQuery(
    `SELECT id FROM sellers WHERE active = true ORDER BY created_at ASC LIMIT 1`
  );
  let sellerId = sellerResult.rows[0]?.id;
  if (!sellerId) {
    const createdSeller = await dbQuery(
      `INSERT INTO sellers (name, active) VALUES ($1, true) RETURNING id`,
      [`Seller ${testId}`]
    );
    sellerId = createdSeller.rows[0].id;
  }

  const contact = await dbQuery(
    `INSERT INTO contacts (phone_e164, display_name, tags) VALUES ($1, $2, '[]'::jsonb) RETURNING id`,
    [phone, `Contato ${testId}`]
  );
  const contactId = contact.rows[0].id;

  const conversation = await dbQuery(
    `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage, last_message_at)
     VALUES ($1, $2, 'open', 'lead', NOW())
     RETURNING id`,
    [contactId, sellerId]
  );
  const conversationId = conversation.rows[0].id;

  const message = await dbQuery(
    `INSERT INTO messages
       (conversation_id, seller_id, direction, type, text, timestamp, raw_event, whatsapp_message_id)
     VALUES ($1, NULL, 'inbound', 'text', $2, NOW(), '{}'::jsonb, $3)
     RETURNING id`,
    [conversationId, `Mensagem inicial ${testId}`, `seed-${testId}`]
  );
  const messageId = message.rows[0].id;

  await dbQuery(
    `INSERT INTO message_labels
       (message_id, intent, objection, urgency, sentiment, funnel_stage, language, needs_attention, attention_reason)
     VALUES ($1, 'duvida', '', 2, 3, 'lead', 'pt-BR', false, 'none')
     ON CONFLICT (message_id) DO NOTHING`,
    [messageId]
  );

  await dbQuery(
    `INSERT INTO reports_daily (report_date, seller_id, kpis, heatmap, highlights)
     VALUES ('2099-01-01', $1, '{"seed":true}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (report_date, seller_id)
     DO UPDATE SET kpis = EXCLUDED.kpis`,
    [sellerId]
  );
  await dbQuery(
    `INSERT INTO reports_weekly (week_start, seller_id, kpis, heatmap, highlights)
     VALUES ('2099-01-04', $1, '{"seed":true}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (week_start, seller_id)
     DO UPDATE SET kpis = EXCLUDED.kpis`,
    [sellerId]
  );

  const reviewApprove = await dbQuery(
    `INSERT INTO human_reviews
       (conversation_id, message_id, contact_name, suggested_outcome, suggested_value_cents, confidence, reason, status)
     VALUES ($1, $2, $3, 'won', 12345, 0.80, 'phase3 approve', 'pending')
     RETURNING id`,
    [conversationId, messageId, `Contato ${testId}`]
  );
  const reviewReject = await dbQuery(
    `INSERT INTO human_reviews
       (conversation_id, message_id, contact_name, suggested_outcome, suggested_value_cents, confidence, reason, status)
     VALUES ($1, $2, $3, 'lost', 0, 0.70, 'phase3 reject', 'pending')
     RETURNING id`,
    [conversationId, messageId, `Contato ${testId}`]
  );

  return {
    testId,
    phone,
    sellerId,
    contactId,
    conversationId,
    messageId,
    reviewApproveId: reviewApprove.rows[0].id,
    reviewRejectId: reviewReject.rows[0].id,
  };
}

async function cleanupFixtures(fixtures) {
  if (!fixtures || SKIP_CLEANUP) return;

  await dbQuery(`DELETE FROM human_reviews WHERE id = ANY($1::uuid[])`, [[fixtures.reviewApproveId, fixtures.reviewRejectId]]);
  await dbQuery(`DELETE FROM message_labels WHERE message_id = $1`, [fixtures.messageId]);
  await dbQuery(`DELETE FROM messages WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM sales_outcomes WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM conversation_insights WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM conversations WHERE id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM contacts WHERE id = $1`, [fixtures.contactId]);
  await dbQuery(`DELETE FROM reports_daily WHERE report_date = '2099-01-01'::date AND seller_id = $1`, [fixtures.sellerId]);
  await dbQuery(`DELETE FROM reports_weekly WHERE week_start = '2099-01-04'::date AND seller_id = $1`, [fixtures.sellerId]);
}

async function runContracts(fixtures) {
  await runTest('GET /health', async () => {
    const { data } = await http('GET', '/health', { expectedStatus: 200 });
    assert.equal(data.status, 'healthy');
  });

  await runTest('GET /api/metrics/usage', async () => {
    const { data } = await http('GET', '/api/metrics/usage?days=3', { expectedStatus: 200 });
    assert.ok(data.total);
    assert.ok(Array.isArray(data.byDate));
  });

  await runTest('SSE /events', async () => {
    await assertSse('/events');
  });

  await runTest('GET /events/stats', async () => {
    await http('GET', '/events/stats', { expectedStatus: 200 });
  });

  await runTest('POST /internal/emit invalid body', async () => {
    const headers = INTERNAL_API_KEY ? { 'x-internal-key': INTERNAL_API_KEY } : {};
    await http('POST', '/internal/emit', {
      headers,
      body: { data: { ping: true } },
      expectedStatus: 400,
    });
  });

  await runTest('POST /internal/emit valid body', async () => {
    const headers = INTERNAL_API_KEY ? { 'x-internal-key': INTERNAL_API_KEY } : {};
    const { data } = await http('POST', '/internal/emit', {
      headers,
      body: { event: 'phase3_contract_test', data: { ok: true }, sellerId: fixtures.sellerId },
      expectedStatus: 200,
    });
    assert.equal(data.ok, true);
  });

  if (INTERNAL_API_KEY) {
    await runTest('POST /internal/emit unauthorized', async () => {
      await http('POST', '/internal/emit', {
        body: { event: 'phase3_contract_test', data: {} },
        expectedStatus: 401,
      });
    });
  }

  await runTest('SSE /api/alerts/stream', async () => {
    await assertSse('/api/alerts/stream');
  });

  await runTest('GET /api/alerts', async () => {
    const { data } = await http('GET', '/api/alerts', { expectedStatus: 200 });
    assert.ok(Array.isArray(data.alertas));
  });

  await runTest('GET /api/alerts/history', async () => {
    const { data } = await http('GET', '/api/alerts/history?limit=5', { expectedStatus: 200 });
    assert.ok(Array.isArray(data));
  });

  await runTest('GET /api/conversations', async () => {
    const { data } = await http('GET', '/api/conversations?limit=20', { expectedStatus: 200 });
    assert.ok(Array.isArray(data.value));
    assert.ok(typeof data.total === 'number');
  });

  await runTest('GET /api/conversations/:id', async () => {
    const { data } = await http('GET', `/api/conversations/${fixtures.conversationId}`, { expectedStatus: 200 });
    assert.equal(data.conversation.id, fixtures.conversationId);
    assert.ok(Array.isArray(data.messages));
    if (data.messages.length > 0) {
      assert.ok(['assistant', 'user'].includes(data.messages[0].role));
    }
  });

  const dashboardGetRoutes = [
    '/api/dashboard/kpis',
    '/api/dashboard/funnel',
    '/api/dashboard/sellers',
    '/api/dashboard/sellers/detailed',
    '/api/dashboard/conversations/recent',
    '/api/dashboard/objections',
    '/api/dashboard/win-loss-reasons',
    '/api/dashboard/followups',
    '/api/dashboard/alerts',
    '/api/dashboard/daily-evolution',
    '/api/dashboard/executive',
    '/api/dashboard/funnel-detailed',
    '/api/dashboard/performance',
    '/api/dashboard/conversations',
    '/api/dashboard/followup',
    '/api/dashboard/followup/full',
    '/api/dashboard/summary',
    '/api/dashboard/loss-stats',
    '/api/dashboard/sellers/analysis',
    '/api/dashboard/kpis-comparison',
    '/api/dashboard/pipeline-weighted',
    '/api/dashboard/sellers/full',
    '/api/dashboard/products/comparison',
    '/api/dashboard/ranking',
    '/api/dashboard/loss-reasons',
  ];

  for (const route of dashboardGetRoutes) {
    await runTest(`GET ${route}`, async () => {
      await http('GET', route, { expectedStatus: 200 });
    });
  }

  await runTest('POST /api/dashboard/sales/manual validation', async () => {
    await http('POST', '/api/dashboard/sales/manual', {
      body: {},
      expectedStatus: 400,
    });
  });

  await runTest('POST /api/dashboard/sales/manual success', async () => {
    const { data } = await http('POST', '/api/dashboard/sales/manual', {
      body: {
        conversationId: fixtures.conversationId,
        valueCents: 45678,
        sellerId: fixtures.sellerId,
      },
      expectedStatus: 200,
    });
    assert.equal(data.success, true);
  });

  await runTest('GET /api/reviews unauthorized', async () => {
    await http('GET', '/api/reviews', { expectedStatus: 401 });
  });

  ensure(ADMIN_API_KEY, 'ADMIN_API_KEY ausente para cobrir contratos admin/reviews.');
  const adminHeaders = { 'x-admin-key': ADMIN_API_KEY };

  await runTest('GET /api/reviews', async () => {
    const { data } = await http('GET', '/api/reviews?limit=20', {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.ok(Array.isArray(data.value));
  });

  await runTest('GET /api/reviews/stats', async () => {
    await http('GET', '/api/reviews/stats', {
      headers: adminHeaders,
      expectedStatus: 200,
    });
  });

  await runTest('GET /api/reviews/:id', async () => {
    const { data } = await http('GET', `/api/reviews/${fixtures.reviewApproveId}`, {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.equal(data.id, fixtures.reviewApproveId);
  });

  await runTest('POST /api/reviews/:id/approve', async () => {
    const { data } = await http('POST', `/api/reviews/${fixtures.reviewApproveId}/approve`, {
      headers: {
        ...adminHeaders,
        'x-reviewer-name': 'Phase3 QA',
      },
      body: {
        finalOutcome: 'won',
        finalValueCents: 12345,
        notes: 'phase3 approve',
      },
      expectedStatus: 200,
    });
    assert.equal(data.success, true);
  });

  await runTest('POST /api/reviews/:id/reject', async () => {
    const { data } = await http('POST', `/api/reviews/${fixtures.reviewRejectId}/reject`, {
      headers: {
        ...adminHeaders,
        'x-reviewer-name': 'Phase3 QA',
      },
      body: { notes: 'phase3 reject' },
      expectedStatus: 200,
    });
    assert.equal(data.success, true);
  });

  await runTest('GET /admin/conversations unauthorized', async () => {
    await http('GET', '/admin/conversations', { expectedStatus: 401 });
  });

  await runTest('GET /admin/conversations', async () => {
    const { data } = await http('GET', '/admin/conversations?limit=20', {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.ok(Array.isArray(data.conversations));
  });

  await runTest('GET /admin/conversations/:id', async () => {
    await http('GET', `/admin/conversations/${fixtures.conversationId}`, {
      headers: adminHeaders,
      expectedStatus: 200,
    });
  });

  await runTest('POST /admin/outcomes', async () => {
    const { data } = await http('POST', '/admin/outcomes', {
      headers: adminHeaders,
      body: {
        conversation_id: fixtures.conversationId,
        outcome: 'won',
        value_cents: 50000,
      },
      expectedStatus: 200,
    });
    assert.ok(data.outcome);
  });

  await runTest('GET /admin/reports/daily', async () => {
    const { data } = await http('GET', `/admin/reports/daily?date=2099-01-01&seller_id=${fixtures.sellerId}`, {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.equal(data.date, '2099-01-01');
  });

  await runTest('GET /admin/reports/weekly', async () => {
    const { data } = await http('GET', `/admin/reports/weekly?weekStart=2099-01-04&seller_id=${fixtures.sellerId}`, {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.equal(data.weekStart, '2099-01-04');
  });

  await runTest('GET /admin/rag/search', async () => {
    const { data } = await http('GET', '/admin/rag/search?limit=3', {
      headers: adminHeaders,
      expectedStatus: 200,
    });
    assert.ok(typeof data.enabled === 'boolean');
  });

  await runTest('POST /admin/rag/search', async () => {
    const embedding = RAG_VECTOR_ENABLED ? new Array(1536).fill(0.001) : [0.001, 0.002];
    const { data } = await http('POST', '/admin/rag/search', {
      headers: adminHeaders,
      body: { embedding, limit: 3 },
      expectedStatus: 200,
      timeoutMs: 20000,
    });
    assert.ok(typeof data.enabled === 'boolean');
    assert.ok(Array.isArray(data.chunks));
  });

  await runTest('GET /admin/ui', async () => {
    const { response, contentType } = await http('GET', '/admin/ui', {
      headers: adminHeaders,
      expectedStatus: 200,
      parseJson: false,
    });
    assert.ok(contentType.includes('text/html'));
    const html = await response.text();
    assert.ok(html.includes('Supervisor Comercial'));
  });

  await runTest('POST /webhooks/evolution invalid schema', async () => {
    const headers = EVOLUTION_WEBHOOK_SECRET
      ? { authorization: `Bearer ${EVOLUTION_WEBHOOK_SECRET}` }
      : {};
    const { data } = await http('POST', '/webhooks/evolution', {
      headers,
      body: { event: 'noop', instance: 'phase3', data: 'invalid' },
      expectedStatus: 200,
    });
    assert.equal(data.ok, true);
    assert.equal(data.ignored, true);
  });

  if (EVOLUTION_WEBHOOK_SECRET) {
    await runTest('POST /webhooks/evolution unauthorized', async () => {
      await http('POST', '/webhooks/evolution', {
        body: { event: 'messages.upsert', instance: 'phase3', data: {} },
        expectedStatus: 401,
      });
    });
  }

  await runTest('Regression dedup webhook (P0-API-02)', async () => {
    const whatsappId = `phase3-dedup-${Date.now()}`;
    const payload = {
      event: 'messages.upsert',
      instance: 'phase3-instance',
      data: {
        key: {
          remoteJid: `${fixtures.phone}@s.whatsapp.net`,
          fromMe: false,
          id: whatsappId,
        },
        message: {
          conversation: 'Mensagem deduplicada fase3',
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: `Contato ${fixtures.testId}`,
      },
    };

    const headers = EVOLUTION_WEBHOOK_SECRET
      ? { authorization: `Bearer ${EVOLUTION_WEBHOOK_SECRET}` }
      : {};

    await http('POST', '/webhooks/evolution', {
      headers,
      body: payload,
      expectedStatus: 200,
    });
    await http('POST', '/webhooks/evolution', {
      headers,
      body: payload,
      expectedStatus: 200,
    });

    const inserted = await waitFor(async () => {
      const result = await dbQuery(
        `SELECT COUNT(*)::int as cnt
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts ct ON ct.id = c.contact_id
         WHERE ct.phone_e164 = $1 AND m.whatsapp_message_id = $2`,
        [fixtures.phone, whatsappId]
      );
      return Number(result.rows[0]?.cnt || 0);
    }, 8000, 300);

    assert.equal(inserted, 1, 'Mensagem duplicada detectada para mesmo whatsapp_message_id');
  });

  await runTest('Regression review SQL drift (P0-DB-01)', async () => {
    const result = await dbQuery(
      `SELECT status, reviewed_by, review_notes
       FROM human_reviews
       WHERE id = $1`,
      [fixtures.reviewApproveId]
    );
    assert.equal(result.rows[0]?.status, 'approved');
    assert.equal(result.rows[0]?.reviewed_by, 'Phase3 QA');
  });

  await runTest('Regression conversations detail 200 (P0-API-01)', async () => {
    const { data } = await http('GET', `/api/conversations/${fixtures.conversationId}`, {
      expectedStatus: 200,
    });
    assert.equal(data.conversation.id, fixtures.conversationId);
  });

  await runTest('Regression conversion formula consistency (P1-DATA-01)', async () => {
    const { data } = await http('GET', '/api/dashboard/kpis', { expectedStatus: 200 });
    const won = Number(data.vendasQtd || 0);
    const lost = Number(data.leadsPerdidos || 0);
    const endpointRate = Number(data.taxaConversao || 0);
    const expectedRate = won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : 0;
    assert.equal(endpointRate, expectedRate);
  });

  await runTest('Regression alert_history contract (P1-DATA-04)', async () => {
    const { data } = await http('GET', '/api/alerts/history?limit=20', { expectedStatus: 200 });
    assert.ok(Array.isArray(data));
  });
}

async function main() {
  log(`Base URL: ${BASE_URL}`);
  log(`DB URL: ${DB_URL}`);

  await runTest('Pré-check API ativa', async () => {
    await http('GET', '/health', { expectedStatus: 200 });
  });

  const delegated = await ensureDatabaseReadyOrDelegate();
  if (delegated) {
    return;
  }

  state.fixtures = await setupFixtures();
  log(`Fixtures prontas: ${state.fixtures.testId}`);

  try {
    await runContracts(state.fixtures);
  } finally {
    await cleanupFixtures(state.fixtures);
  }

  log(`Resumo: ${state.passed} passed, ${state.failed} failed`);
  if (state.failed > 0) {
    console.error('[phase3] Falhas:');
    for (const f of state.failedTests) {
      console.error(` - ${f.name}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch(async (error) => {
    console.error('[phase3] Erro fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
