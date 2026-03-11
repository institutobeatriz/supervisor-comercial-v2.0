#!/usr/bin/env node
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { Queue } from 'bullmq';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://app:app@localhost:5432/sales_supervisor';
const REDIS_URL = process.env.TEST_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || '';
const SKIP_CLEANUP = process.env.TEST_SKIP_CLEANUP === 'true';

const { Pool } = pg;
const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
});

let queueRefs = null;

const state = {
  passed: 0,
  failed: 0,
  warnings: [],
  failedTests: [],
  fixtures: null,
};

function log(msg) {
  console.log(`[phase4] ${msg}`);
}

function warn(msg) {
  state.warnings.push(msg);
  console.warn(`[phase4] WARN ${msg}`);
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

function webhookHeaders() {
  return EVOLUTION_WEBHOOK_SECRET
    ? { authorization: `Bearer ${EVOLUTION_WEBHOOK_SECRET}` }
    : {};
}

async function http(method, path, options = {}) {
  const {
    headers = {},
    body,
    expectedStatus,
    timeoutMs = 12000,
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

async function waitFor(check, timeoutMs = 12000, intervalMs = 300) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // keep polling
    }
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

function parseRedisConnection(redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    const connection = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
    };
    if (parsed.username) connection.username = decodeURIComponent(parsed.username);
    if (parsed.password) connection.password = decodeURIComponent(parsed.password);
    return connection;
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

function getQueues() {
  if (queueRefs) return queueRefs;
  const connection = parseRedisConnection(REDIS_URL);
  queueRefs = {
    classify: new Queue('classify', { connection }),
    stt: new Queue('stt', { connection }),
    vision: new Queue('vision', { connection }),
  };
  return queueRefs;
}

async function closeQueues() {
  if (!queueRefs) return;
  await Promise.all([
    queueRefs.classify.close(),
    queueRefs.stt.close(),
    queueRefs.vision.close(),
  ]);
  queueRefs = null;
}

function looksLikeWrongDbError(message) {
  return message.includes('relação "sellers" não existe')
    || message.includes('relation "sellers" does not exist');
}

async function ensureDatabaseReadyOrDelegate() {
  try {
    await dbQuery('SELECT id FROM sellers LIMIT 1');
    return false;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const alreadyInDocker = process.env.PHASE4_IN_DOCKER === '1';

    if (!looksLikeWrongDbError(err.message) || alreadyInDocker) {
      throw error;
    }

    log('Banco local sem schema do projeto detectado; delegando suíte para o container supervisor-api.');
    const localScript = 'scripts/phase4-webhooks-queues-e2e.mjs';
    const containerScript = '/app/scripts/phase4-webhooks-queues-e2e.mjs';

    await runProcess('docker', ['exec', 'supervisor-api', 'mkdir', '-p', '/app/scripts']);
    await runProcess('docker', ['cp', localScript, `supervisor-api:${containerScript}`]);

    const child = spawn(
      'docker',
      [
        'exec',
        '-e', 'PHASE4_IN_DOCKER=1',
        '-e', 'TEST_DATABASE_URL=postgresql://app:app@postgres:5432/sales_supervisor',
        '-e', 'TEST_REDIS_URL=redis://redis:6379',
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

function nextPhone(seed) {
  const base = (Date.now() + seed).toString().slice(-8);
  return `55119${base.padStart(8, '0')}`;
}

function nextMessageId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function buildSilentWavBase64(durationMs = 1000) {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.max(1, Math.floor(sampleRate * (durationMs / 1000)));
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = samples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // PCM silence already zero-filled

  return buffer.toString('base64');
}

function buildMessagePayload({ event = 'messages.upsert', instance, phone, whatsappId, fromMe = false, message, pushName }) {
  return {
    event,
    instance,
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe,
        id: whatsappId,
      },
      message,
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName,
    },
  };
}

async function setupFixtures() {
  const testId = `phase4-${Date.now()}-${randomUUID().slice(0, 8)}`;

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

  const instances = {
    text: `${testId}-text`,
    outbound: `${testId}-outbound`,
    audioBase64: `${testId}-audio-b64`,
    audioMediaKey: `${testId}-audio-mk`,
    image: `${testId}-image`,
    document: `${testId}-document`,
    duplicate: `${testId}-duplicate`,
    unsupported: `${testId}-unsupported`,
    invalid: `${testId}-invalid`,
  };

  const instanceValues = Object.values(instances);
  for (const instance of instanceValues) {
    await dbQuery(
      `INSERT INTO instance_seller_map (instance, seller_id, active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (instance)
       DO UPDATE SET seller_id = EXCLUDED.seller_id, active = TRUE`,
      [instance, sellerId]
    );
  }

  const phones = {
    text: nextPhone(1),
    outbound: nextPhone(2),
    audioBase64: nextPhone(3),
    audioMediaKey: nextPhone(4),
    image: nextPhone(5),
    document: nextPhone(6),
    duplicate: nextPhone(7),
    unsupported: nextPhone(8),
  };

  return {
    testId,
    sellerId,
    instances,
    phones,
    whatsappIds: [],
  };
}

async function cleanupFixtures(fixtures) {
  if (!fixtures || SKIP_CLEANUP) return;

  const phones = Object.values(fixtures.phones);
  const instances = Object.values(fixtures.instances);
  const whatsappIds = fixtures.whatsappIds;

  const msgs = await dbQuery(
    `SELECT m.id, m.conversation_id
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.phone_e164 = ANY($1::text[])`,
    [phones]
  );

  const messageIds = Array.from(new Set(msgs.rows.map((r) => r.id)));
  const conversationIds = Array.from(new Set(msgs.rows.map((r) => r.conversation_id)));

  if (messageIds.length > 0) {
    await dbQuery(`DELETE FROM message_labels WHERE message_id = ANY($1::uuid[])`, [messageIds]);
    await dbQuery(`DELETE FROM audio_transcripts WHERE message_id = ANY($1::uuid[])`, [messageIds]);
    await dbQuery(`DELETE FROM messages WHERE id = ANY($1::uuid[])`, [messageIds]);
  }

  if (conversationIds.length > 0) {
    await dbQuery(`DELETE FROM sales_outcomes WHERE conversation_id = ANY($1::uuid[])`, [conversationIds]);
    await dbQuery(`DELETE FROM conversation_insights WHERE conversation_id = ANY($1::uuid[])`, [conversationIds]);
    await dbQuery(`DELETE FROM rag_chunks WHERE conversation_id = ANY($1::uuid[])`, [conversationIds]);
    await dbQuery(`DELETE FROM conversations WHERE id = ANY($1::uuid[])`, [conversationIds]);
  }

  await dbQuery(`DELETE FROM contacts WHERE phone_e164 = ANY($1::text[])`, [phones]);

  if (whatsappIds.length > 0) {
    await dbQuery(`DELETE FROM raw_events WHERE whatsapp_id = ANY($1::text[])`, [whatsappIds]);
  }
  await dbQuery(`DELETE FROM raw_events WHERE instance = ANY($1::text[])`, [instances]);

  await dbQuery(`DELETE FROM instance_seller_map WHERE instance = ANY($1::text[])`, [instances]);
}

async function waitForMessageByWhatsapp(phone, whatsappId, timeoutMs = 12000) {
  return waitFor(async () => {
    const result = await dbQuery(
      `SELECT m.id, m.conversation_id, m.direction, m.type, m.text, m.raw_event_id, m.whatsapp_message_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE ct.phone_e164 = $1 AND m.whatsapp_message_id = $2
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [phone, whatsappId]
    );
    return result.rows[0] || null;
  }, timeoutMs, 250);
}

async function getRawEventByWhatsapp(whatsappId) {
  const result = await dbQuery(
    `SELECT id, event, instance, whatsapp_id
     FROM raw_events
     WHERE whatsapp_id = $1
     ORDER BY received_at DESC
     LIMIT 1`,
    [whatsappId]
  );
  return result.rows[0] || null;
}

async function countMessagesByWhatsapp(phone, whatsappId) {
  const result = await dbQuery(
    `SELECT COUNT(*)::int AS cnt
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.phone_e164 = $1 AND m.whatsapp_message_id = $2`,
    [phone, whatsappId]
  );
  return Number(result.rows[0]?.cnt || 0);
}

async function countRawEventsByWhatsapp(whatsappId) {
  const result = await dbQuery(
    `SELECT COUNT(*)::int AS cnt
     FROM raw_events
     WHERE whatsapp_id = $1`,
    [whatsappId]
  );
  return Number(result.rows[0]?.cnt || 0);
}

async function countRawEventsByInstance(instance) {
  const result = await dbQuery(
    `SELECT COUNT(*)::int AS cnt
     FROM raw_events
     WHERE instance = $1`,
    [instance]
  );
  return Number(result.rows[0]?.cnt || 0);
}

async function waitForQueueJobByMessage(queue, messageId, timeoutMs = 30000) {
  const states = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'];
  return waitFor(async () => {
    const jobs = await queue.getJobs(states, 0, 300, true);
    return jobs.find((j) => String(j?.data?.messageId || '') === String(messageId)) || null;
  }, timeoutMs, 350);
}

async function waitForQueueJobById(queue, jobId, timeoutMs = 20000) {
  return waitFor(async () => {
    const job = await queue.getJob(jobId);
    return job || null;
  }, timeoutMs, 300);
}

async function waitForFinalJobState(job, timeoutMs = 60000) {
  return waitFor(async () => {
    const stateName = await job.getState();
    if (stateName === 'completed' || stateName === 'failed') {
      return stateName;
    }
    return null;
  }, timeoutMs, 500);
}

async function getFailedReason(job) {
  const refreshed = await job.queue.getJob(job.id);
  return refreshed?.failedReason || job.failedReason || '';
}

function isExternalDependencyFailure(reason = '') {
  const lower = String(reason || '').toLowerCase();
  return [
    'groq_stt_api_key',
    'llm api error',
    'max retries exceeded',
    'fetch failed',
    'econn',
    'enotfound',
    'api key',
    'groq stt error',
    'invalid file format',
    'unable to get local issuer certificate',
    'failed to download',
    'decryption failed',
    'socket',
  ].some((fragment) => lower.includes(fragment));
}

async function getMessageLabel(messageId) {
  const result = await dbQuery(`SELECT * FROM message_labels WHERE message_id = $1`, [messageId]);
  return result.rows[0] || null;
}

async function runPhase4(fixtures) {
  await runTest('Pré-check API ativa', async () => {
    await http('GET', '/health', { expectedStatus: 200 });
  });

  await runTest('Webhook inválido (schema) é ignorado sem persistir raw_event', async () => {
    const before = await countRawEventsByInstance(fixtures.instances.invalid);

    const { data } = await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: {
        event: 'messages.upsert',
        instance: fixtures.instances.invalid,
        data: 'invalid-schema',
      },
      expectedStatus: 200,
    });

    assert.equal(data.ok, true);
    assert.equal(data.ignored, true);

    await sleep(300);
    const after = await countRawEventsByInstance(fixtures.instances.invalid);
    assert.equal(after, before, 'raw_event não deveria ser persistido para schema inválido');
  });

  await runTest('Evento não suportado persiste raw_event sem criar message', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-unsupported`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'presence.update',
      instance: fixtures.instances.unsupported,
      phone: fixtures.phones.unsupported,
      whatsappId,
      message: { conversation: `Evento não suportado ${fixtures.testId}` },
      pushName: `Contato ${fixtures.testId}`,
    });

    const { data } = await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    assert.equal(data.status, 'queued');

    const raw = await waitFor(() => getRawEventByWhatsapp(whatsappId), 8000, 250);
    ensure(raw, 'raw_event não encontrado para evento não suportado');
    assert.equal(raw.event, 'presence.update');

    await sleep(600);
    const msgCount = await countMessagesByWhatsapp(fixtures.phones.unsupported, whatsappId);
    assert.equal(msgCount, 0, 'não deveria criar message para evento não suportado');
  });

  await runTest('messages.upsert texto inbound -> raw_events + messages + classify/analyze pipeline', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-text`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.text,
      phone: fixtures.phones.text,
      whatsappId,
      fromMe: false,
      message: { conversation: `Olá, quero detalhes do plano premium ${fixtures.testId}` },
      pushName: `Contato ${fixtures.testId}`,
    });

    const { data } = await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });
    assert.equal(data.status, 'queued');

    const raw = await waitFor(() => getRawEventByWhatsapp(whatsappId), 8000, 250);
    ensure(raw, 'raw_event não encontrado para texto inbound');

    const message = await waitForMessageByWhatsapp(fixtures.phones.text, whatsappId, 12000);
    ensure(message, 'message não encontrada para texto inbound');
    assert.equal(message.type, 'text');
    assert.equal(message.direction, 'inbound');
    assert.equal(message.raw_event_id, raw.id);

    const queues = getQueues();
    const classifyJob = await waitForQueueJobByMessage(queues.classify, message.id, 40000);
    ensure(classifyJob, 'job classify não encontrado para texto inbound');

    const classifyState = await waitForFinalJobState(classifyJob, 70000);
    ensure(classifyState, 'job classify não finalizou em tempo hábil');

    if (classifyState === 'failed') {
      const reason = await getFailedReason(classifyJob);
      ensure(isExternalDependencyFailure(reason), `classify falhou por motivo inesperado: ${reason}`);
      warn(`Classify falhou por dependência externa para message ${message.id}: ${reason}`);
      return;
    }

    const label = await waitFor(() => getMessageLabel(message.id), 12000, 350);
    ensure(label, 'message_labels não encontrado após classify completed');

    const insight = await waitFor(async () => {
      const result = await dbQuery(
        `SELECT id FROM conversation_insights WHERE conversation_id = $1`,
        [message.conversation_id]
      );
      return result.rows[0] || null;
    }, 20000, 500);

    ensure(insight, 'conversation_insights não encontrado após pipeline analyze');
  });

  await runTest('send.message outbound não deve enfileirar classify', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-outbound`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'send.message',
      instance: fixtures.instances.outbound,
      phone: fixtures.phones.outbound,
      whatsappId,
      fromMe: true,
      message: { conversation: `Resposta enviada ${fixtures.testId}` },
      pushName: `Atendente ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.outbound, whatsappId, 12000);
    ensure(message, 'message outbound não encontrada');
    assert.equal(message.direction, 'outbound');
    assert.equal(message.type, 'text');

    const label = await waitFor(() => getMessageLabel(message.id), 3500, 300);
    assert.equal(label, null, 'outbound não deveria gerar message_labels');

    const queues = getQueues();
    const classifyJob = await waitForQueueJobByMessage(queues.classify, message.id, 3500);
    assert.equal(classifyJob, null, 'outbound não deveria enfileirar classify');
  });

  await runTest('Audio inbound com base64 no payload enfileira STT', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-audio-b64`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.audioBase64,
      phone: fixtures.phones.audioBase64,
      whatsappId,
      fromMe: false,
      message: {
        audioMessage: {
          mimetype: 'audio/wav',
          base64: buildSilentWavBase64(1500),
        },
      },
      pushName: `Contato ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.audioBase64, whatsappId, 12000);
    ensure(message, 'message audio/base64 não encontrada');
    assert.equal(message.type, 'audio');

    const queues = getQueues();
    const sttJob = await waitForQueueJobByMessage(queues.stt, message.id, 30000);
    ensure(sttJob, 'job stt não encontrado para áudio base64');
    ensure(!!sttJob.data?.base64, 'job stt deveria conter base64 no payload');

    const finalState = await waitForFinalJobState(sttJob, 70000);
    ensure(finalState, 'job stt(base64) não finalizou em tempo hábil');

    if (finalState === 'failed') {
      const reason = await getFailedReason(sttJob);
      ensure(isExternalDependencyFailure(reason), `stt(base64) falhou por motivo inesperado: ${reason}`);
      warn(`STT base64 falhou por dependência externa para message ${message.id}: ${reason}`);
      return;
    }

    const updated = await waitFor(async () => {
      const result = await dbQuery(`SELECT text FROM messages WHERE id = $1`, [message.id]);
      return result.rows[0]?.text ? result.rows[0] : null;
    }, 12000, 400);

    ensure(updated, 'mensagem de áudio não recebeu texto após STT completed');
  });

  await runTest('Audio inbound com mediaKey usa fallback quando Evolution falha', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-audio-mk`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.audioMediaKey,
      phone: fixtures.phones.audioMediaKey,
      whatsappId,
      fromMe: false,
      message: {
        audioMessage: {
          mimetype: 'audio/ogg',
          url: 'https://example.com/audio.enc',
          mediaKey: Buffer.alloc(32, 7).toString('base64'),
        },
      },
      pushName: `Contato ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.audioMediaKey, whatsappId, 12000);
    ensure(message, 'message audio/mediaKey não encontrada');
    assert.equal(message.type, 'audio');

    const queues = getQueues();
    const sttJob = await waitForQueueJobByMessage(queues.stt, message.id, 35000);
    ensure(sttJob, 'job stt não encontrado para áudio mediaKey');

    if (sttJob.data?.base64) {
      warn(`Áudio mediaKey recebeu base64 da Evolution (fallback não exercitado) para message ${message.id}`);
    } else {
      ensure(!!sttJob.data?.mediaKey, 'job stt deveria conter mediaKey no fallback');
    }

    const finalState = await waitForFinalJobState(sttJob, 70000);
    ensure(finalState, 'job stt(mediaKey) não finalizou em tempo hábil');

    if (finalState === 'failed') {
      const reason = await getFailedReason(sttJob);
      ensure(isExternalDependencyFailure(reason), `stt(mediaKey) falhou por motivo inesperado: ${reason}`);
      warn(`STT mediaKey falhou por dependência externa para message ${message.id}: ${reason}`);
    }
  });

  await runTest('Imagem inbound enfileira Vision com politica de retries', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-image`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.image,
      phone: fixtures.phones.image,
      whatsappId,
      fromMe: false,
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          url: 'https://example.com/fake-image.jpg',
        },
      },
      pushName: `Contato ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.image, whatsappId, 12000);
    ensure(message, 'message image não encontrada');
    assert.equal(message.type, 'image');

    const queues = getQueues();
    const jobId = `vision-${message.id}`;
    const visionJob = await waitForQueueJobById(queues.vision, jobId, 25000);
    ensure(visionJob, 'job vision não encontrado para imagem');
    assert.equal(visionJob.opts.attempts, 3);

    const finalState = await waitForFinalJobState(visionJob, 70000);
    ensure(finalState, 'job vision(image) não finalizou em tempo hábil');
    ensure(finalState === 'completed' || finalState === 'failed', `estado inválido para vision(image): ${finalState}`);
  });

  await runTest('Documento PDF inbound com base64 percorre branch local de PDF', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-document`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.document,
      phone: fixtures.phones.document,
      whatsappId,
      fromMe: false,
      message: {
        documentMessage: {
          mimetype: 'application/pdf',
          base64: Buffer.from('%PDF-1.4\nnot-a-real-pdf\n%%EOF').toString('base64'),
          fileName: `phase4-${fixtures.testId}.pdf`,
        },
      },
      pushName: `Contato ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.document, whatsappId, 12000);
    ensure(message, 'message document não encontrada');
    assert.equal(message.type, 'document');

    const queues = getQueues();
    const jobId = `vision-${message.id}`;
    const visionJob = await waitForQueueJobById(queues.vision, jobId, 25000);
    ensure(visionJob, 'job vision não encontrado para documento');
    ensure(!!visionJob.data?.base64, 'job vision deveria receber base64 para PDF');

    const finalState = await waitForFinalJobState(visionJob, 70000);
    ensure(finalState, 'job vision(document) não finalizou em tempo hábil');
    assert.equal(finalState, 'completed');

    const returnValue = visionJob.returnvalue || {};
    assert.equal(returnValue.source, 'pdf', 'branch de PDF não foi executada no vision worker');
  });

  await runTest('Deduplicação: webhook duplicado mantém 1 raw_event e 1 message', async () => {
    const whatsappId = nextMessageId(`${fixtures.testId}-duplicate`);
    fixtures.whatsappIds.push(whatsappId);

    const payload = buildMessagePayload({
      event: 'messages.upsert',
      instance: fixtures.instances.duplicate,
      phone: fixtures.phones.duplicate,
      whatsappId,
      fromMe: false,
      message: { conversation: `Mensagem deduplicada ${fixtures.testId}` },
      pushName: `Contato ${fixtures.testId}`,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    await http('POST', '/webhooks/evolution', {
      headers: webhookHeaders(),
      body: payload,
      expectedStatus: 200,
    });

    const message = await waitForMessageByWhatsapp(fixtures.phones.duplicate, whatsappId, 12000);
    ensure(message, 'message deduplicada não encontrada');

    const msgCount = await waitFor(() => countMessagesByWhatsapp(fixtures.phones.duplicate, whatsappId), 12000, 350);
    const rawCount = await waitFor(() => countRawEventsByWhatsapp(whatsappId), 12000, 350);

    assert.equal(msgCount, 1, 'dedup de message falhou');
    assert.equal(rawCount, 1, 'dedup de raw_event falhou');

    const raw = await getRawEventByWhatsapp(whatsappId);
    ensure(raw, 'raw_event deduplicado não encontrado');
    assert.equal(message.raw_event_id, raw.id);
  });
}

async function main() {
  log(`Base URL: ${BASE_URL}`);
  log(`DB URL: ${DB_URL}`);
  log(`Redis URL: ${REDIS_URL}`);

  const delegated = await ensureDatabaseReadyOrDelegate();
  if (delegated) {
    return;
  }

  state.fixtures = await setupFixtures();
  log(`Fixtures prontas: ${state.fixtures.testId}`);

  try {
    await runPhase4(state.fixtures);
  } finally {
    await cleanupFixtures(state.fixtures);
  }

  log(`Resumo: ${state.passed} passed, ${state.failed} failed, ${state.warnings.length} warnings`);
  if (state.warnings.length > 0) {
    console.warn('[phase4] Warnings:');
    for (const w of state.warnings) {
      console.warn(` - ${w}`);
    }
  }

  if (state.failed > 0) {
    console.error('[phase4] Falhas:');
    for (const f of state.failedTests) {
      console.error(` - ${f.name}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[phase4] Erro fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    await pool.end();
  });
