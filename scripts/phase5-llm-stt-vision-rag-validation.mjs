#!/usr/bin/env node
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createCipheriv, createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { Queue } from 'bullmq';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://app:app@localhost:5432/sales_supervisor';
const REDIS_URL = process.env.TEST_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const SKIP_CLEANUP = process.env.TEST_SKIP_CLEANUP === 'true';

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL, max: 3 });
let queueRefs = null;
let sharedDbModule = null;

const state = {
  passed: 0,
  failed: 0,
  warnings: [],
  failedTests: [],
  fixtures: null,
};

function log(msg) {
  console.log(`[phase5] ${msg}`);
}

function warn(msg) {
  state.warnings.push(msg);
  console.warn(`[phase5] WARN ${msg}`);
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
    rag: new Queue('rag-index', { connection }),
  };
  return queueRefs;
}

async function closeQueues() {
  if (!queueRefs) return;
  await Promise.all([queueRefs.rag.close()]);
  queueRefs = null;
}

async function waitFor(check, timeoutMs = 20000, intervalMs = 300) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // continue polling
    }
    await sleep(intervalMs);
  }
  return null;
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
    const alreadyInDocker = process.env.PHASE5_IN_DOCKER === '1';

    if (!looksLikeWrongDbError(err.message) || alreadyInDocker) {
      throw error;
    }

    log('Banco local sem schema do projeto detectado; delegando suíte para o container supervisor-api.');
    const localScript = 'scripts/phase5-llm-stt-vision-rag-validation.mjs';
    const containerScript = '/app/scripts/phase5-llm-stt-vision-rag-validation.mjs';

    await runProcess('docker', ['exec', 'supervisor-api', 'mkdir', '-p', '/app/scripts']);
    await runProcess('docker', ['cp', localScript, `supervisor-api:${containerScript}`]);

    const child = spawn(
      'docker',
      [
        'exec',
        '-e', 'PHASE5_IN_DOCKER=1',
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

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

function normalizeFetchInputUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === 'string') return input.url;
  return String(input);
}

async function withMockFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(input, init);
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildSilentWavBuffer(durationMs = 1000) {
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
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function hkdfExpand(mediaKeyBuffer, length, info) {
  const prk = createHmac('sha256', Buffer.alloc(32)).update(mediaKeyBuffer).digest();
  const blocks = [];
  let prev = Buffer.alloc(0);

  while (Buffer.concat(blocks).length < length) {
    const hmac = createHmac('sha256', prk);
    hmac.update(Buffer.concat([prev, info, Buffer.from([blocks.length + 1])]));
    prev = hmac.digest();
    blocks.push(prev);
  }

  return Buffer.concat(blocks).slice(0, length);
}

function encryptWhatsAppMedia(plainBuffer, mediaKeyBase64, mimeType = 'audio/ogg') {
  const mediaKeyBuffer = Buffer.from(mediaKeyBase64, 'base64');
  const isAudio = mimeType.includes('audio') || mimeType.includes('ogg');
  const info = Buffer.from(isAudio ? 'WhatsApp Audio Keys' : 'WhatsApp Media Keys', 'utf-8');
  const expanded = hkdfExpand(mediaKeyBuffer, 80, info);

  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);
  const macKey = expanded.subarray(48, 80);

  const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const mac = createHmac('sha256', macKey).update(ciphertext).digest().subarray(0, 10);

  return Buffer.concat([ciphertext, mac]);
}

async function setupFixtures() {
  const testId = `phase5-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const phone = `55119${(Date.now().toString().slice(-8)).padStart(8, '0')}`;

  const sellerResult = await dbQuery(
    `SELECT id FROM sellers WHERE active = true ORDER BY created_at ASC LIMIT 1`
  );
  let sellerId = sellerResult.rows[0]?.id;
  if (!sellerId) {
    const created = await dbQuery(
      `INSERT INTO sellers (name, active) VALUES ($1, true) RETURNING id`,
      [`Seller ${testId}`]
    );
    sellerId = created.rows[0].id;
  }

  const contact = await dbQuery(
    `INSERT INTO contacts (phone_e164, display_name, tags)
     VALUES ($1, $2, '[]'::jsonb)
     RETURNING id`,
    [phone, `Contato ${testId}`]
  );

  const conversation = await dbQuery(
    `INSERT INTO conversations (contact_id, seller_id, status, funnel_stage, last_message_at)
     VALUES ($1, $2, 'open', 'lead', NOW())
     RETURNING id`,
    [contact.rows[0].id, sellerId]
  );

  await dbQuery(
    `INSERT INTO messages
       (conversation_id, seller_id, direction, type, text, timestamp, raw_event, whatsapp_message_id)
     VALUES
       ($1, $2, 'inbound', 'text', $3, NOW(), '{}'::jsonb, $4),
       ($1, $2, 'outbound', 'text', $5, NOW(), '{}'::jsonb, $6)`,
    [
      conversation.rows[0].id,
      sellerId,
      `Mensagem de teste com fase5-chave-rag e contexto comercial ${testId}`,
      `phase5-msg-1-${testId}`,
      `Resposta comercial para fase5-chave-rag com argumentacao detalhada ${testId}`,
      `phase5-msg-2-${testId}`,
    ]
  );

  return {
    testId,
    sellerId,
    phone,
    contactId: contact.rows[0].id,
    conversationId: conversation.rows[0].id,
  };
}

async function cleanupFixtures(fixtures) {
  if (!fixtures || SKIP_CLEANUP) return;

  await dbQuery(`DELETE FROM rag_chunks WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM conversation_insights WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM sales_outcomes WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM audio_transcripts WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM message_labels WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM messages WHERE conversation_id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM conversations WHERE id = $1`, [fixtures.conversationId]);
  await dbQuery(`DELETE FROM contacts WHERE id = $1`, [fixtures.contactId]);
}

async function waitForQueueJobById(queue, jobId, timeoutMs = 30000) {
  return waitFor(async () => {
    const job = await queue.getJob(jobId);
    return job || null;
  }, timeoutMs, 300);
}

async function waitForFinalJobState(job, timeoutMs = 80000) {
  return waitFor(async () => {
    const stateName = await job.getState();
    if (stateName === 'completed' || stateName === 'failed') return stateName;
    return null;
  }, timeoutMs, 500);
}

async function runPhase5(fixtures) {
  process.env.DATABASE_URL = DB_URL;

  sharedDbModule = await import('@supervisor/db');
  const llmModule = await import('@supervisor/llm');
  const sttModule = await import('@supervisor/stt');
  const visionModule = await import('@supervisor/vision');
  const ragModule = await import('@supervisor/rag');

  await runTest('LLM sem chave retorna classificacao default segura', async () => {
    await withEnv({
      LLM_PROVIDER: 'glm5',
      GLM5_API_KEY: '',
      KIMI_API_KEY: '',
      NVIDIA_API_KEY: '',
      DEEPSEEK_API_KEY: '',
    }, async () => {
      let fetchCalls = 0;
      await withMockFetch(async () => {
        fetchCalls += 1;
        return jsonResponse({ choices: [{ message: { content: '{}' } }] });
      }, async () => {
        const result = await llmModule.classifyMessage('Quero comprar agora', 'Cliente Fase5');
        assert.equal(result.intent, 'outro');
        assert.equal(result.funnel_stage, 'lead');
        assert.equal(result.confidence, 0);
        assert.equal(fetchCalls, 0, 'não deveria chamar fetch sem chave configurada');
      });
    });
  });

  await runTest('LLM normaliza schema de saida (intent/stage/sentiment/confidence)', async () => {
    await withEnv({
      LLM_PROVIDER: 'glm5',
      GLM5_API_KEY: 'phase5-key',
      KIMI_API_KEY: '',
      NVIDIA_API_KEY: '',
      DEEPSEEK_API_KEY: '',
    }, async () => {
      await withMockFetch(async (input) => {
        const url = normalizeFetchInputUrl(input);
        ensure(url.includes('modal.direct'), `URL inesperada para provider glm5: ${url}`);
        return jsonResponse({
          choices: [{
            message: {
              content: '{"intent":"COMPRA","funnel_stage":"CLOSED_WON","sentiment":9,"needs_attention":"sim","confidence":1.8,"value_cents":"19900"}',
            },
          }],
        });
      }, async () => {
        const result = await llmModule.classifyMessage('Paguei agora o valor combinado', 'Cliente Fase5');
        assert.equal(result.intent, 'compra');
        assert.equal(result.funnel_stage, 'closed_won');
        assert.equal(result.sentiment, 5);
        assert.equal(result.needs_attention, true);
        assert.equal(result.confidence, 1);
        assert.equal(result.value_cents, 19900);
      });
    });
  });

  await runTest('LLM fallback entre provedores quando primario falha', async () => {
    await withEnv({
      LLM_PROVIDER: 'glm5',
      GLM5_API_KEY: 'primary-key',
      KIMI_API_KEY: 'fallback-key',
      NVIDIA_API_KEY: '',
      DEEPSEEK_API_KEY: '',
    }, async () => {
      const calledUrls = [];
      await withMockFetch(async (input) => {
        const url = normalizeFetchInputUrl(input);
        calledUrls.push(url);

        if (url.includes('modal.direct')) {
          return new Response('upstream down', { status: 503 });
        }

        if (url.includes('integrate.api.nvidia.com')) {
          return jsonResponse({
            choices: [{
              message: {
                content: '{"intent":"duvida","funnel_stage":"lead","sentiment":3,"needs_attention":false,"confidence":0.72}',
              },
            }],
          });
        }

        return new Response('not mocked', { status: 500 });
      }, async () => {
        const result = await llmModule.classifyMessage('Tenho duvida sobre o pacote', 'Cliente Fase5');
        assert.equal(result.intent, 'duvida');
        assert.equal(result.funnel_stage, 'lead');
      });

      ensure(calledUrls.some((u) => u.includes('modal.direct')), 'provider primário glm5 não foi chamado');
      ensure(calledUrls.some((u) => u.includes('integrate.api.nvidia.com')), 'fallback kimi não foi chamado');
    });
  });

  await runTest('STT base64 processa audio valido (mock provider)', async () => {
    const wavBuffer = buildSilentWavBuffer(1200);

    await withEnv({
      GROQ_STT_API_KEY: 'phase5-stt',
      GROQ_STT_BASE_URL: 'https://mock.groq.local',
      GROQ_STT_MODEL: 'whisper-large-v3-turbo',
    }, async () => {
      await withMockFetch(async (input) => {
        const url = normalizeFetchInputUrl(input);
        if (url.includes('/audio/transcriptions')) {
          return jsonResponse({ text: 'transcricao base64', language: 'pt', duration: 1.2 });
        }
        return new Response('not found', { status: 404 });
      }, async () => {
        const base64 = wavBuffer.toString('base64');
        const result = await sttModule.transcribeFromBase64(base64, 'audio/wav', { language: 'pt' });
        assert.equal(result.text, 'transcricao base64');
      });
    });
  });

  await runTest('STT URL processa download + transcricao (mock provider)', async () => {
    const wavBuffer = buildSilentWavBuffer(1000);

    await withEnv({
      GROQ_STT_API_KEY: 'phase5-stt',
      GROQ_STT_BASE_URL: 'https://mock.groq.local',
    }, async () => {
      await withMockFetch(async (input) => {
        const url = normalizeFetchInputUrl(input);
        if (url === 'https://files.local/audio.wav') {
          return new Response(wavBuffer, { status: 200, headers: { 'content-type': 'audio/wav' } });
        }
        if (url.includes('/audio/transcriptions')) {
          return jsonResponse({ text: 'transcricao url', language: 'pt', duration: 1.0 });
        }
        return new Response('not found', { status: 404 });
      }, async () => {
        const result = await sttModule.transcribeFromUrl('https://files.local/audio.wav', { language: 'pt' });
        assert.equal(result.text, 'transcricao url');
      });
    });
  });

  await runTest('STT URL criptografada usa decrypt local + transcricao (mock provider)', async () => {
    const wavBuffer = buildSilentWavBuffer(1000);
    const mediaKey = Buffer.alloc(32, 11).toString('base64');
    const encrypted = encryptWhatsAppMedia(wavBuffer, mediaKey, 'audio/ogg');

    await withEnv({
      GROQ_STT_API_KEY: 'phase5-stt',
      GROQ_STT_BASE_URL: 'https://mock.groq.local',
    }, async () => {
      await withMockFetch(async (input) => {
        const url = normalizeFetchInputUrl(input);
        if (url === 'https://files.local/audio.enc') {
          return new Response(encrypted, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
        }
        if (url.includes('/audio/transcriptions')) {
          return jsonResponse({ text: 'transcricao encrypted', language: 'pt', duration: 1.0 });
        }
        return new Response('not found', { status: 404 });
      }, async () => {
        const result = await sttModule.transcribeFromEncryptedUrl('https://files.local/audio.enc', mediaKey, 'audio/ogg', { language: 'pt' });
        assert.equal(result.text, 'transcricao encrypted');
      });
    });
  });

  await runTest('Vision detecta comprovante positivo por texto', async () => {
    const sample = 'Comprovante de pagamento PIX realizado com sucesso. Valor total R$ 1.234,56 pagamento aprovado.';
    const result = visionModule.detectComprovanteInText(sample);
    assert.equal(result.isComprovante, true);
    assert.equal(result.tipoTransacao, 'pix');
    assert.equal(result.valorReais, 1234.56);
  });

  await runTest('Vision rejeita falso positivo por texto', async () => {
    const sample = 'Cliente perguntou sobre valor e prazo, ainda sem confirmar compra ou pagamento.';
    const result = visionModule.detectComprovanteInText(sample);
    assert.equal(result.isComprovante, false);
  });

  await runTest('Vision analyzePdf falha segura com PDF invalido', async () => {
    const fakePdfBase64 = Buffer.from('not-a-pdf-file').toString('base64');
    const result = await visionModule.analyzePdf(fakePdfBase64);
    assert.equal(result.isComprovante, false);
    assert.equal(result.method, 'none');
  });

  await runTest('RAG possui indice unico para suportar ON CONFLICT', async () => {
    const result = await dbQuery(
      `SELECT COUNT(*)::int AS cnt
       FROM pg_indexes
       WHERE tablename = 'rag_chunks'
         AND indexname IN ('idx_rag_chunks_conv_text_unique', 'uq_rag_chunks_conv_text')`
    );
    const count = Number(result.rows[0]?.cnt || 0);
    ensure(count >= 1, 'indice/constraint unico de rag_chunks não encontrado');
  });

  await runTest('RAG indexacao assíncrona conclui sem erro estrutural', async () => {
    const queues = getQueues();
    const jobId = `phase5-rag-${fixtures.testId}`;

    await queues.rag.add('rag-index', { conversationId: fixtures.conversationId }, { jobId });
    const job = await waitForQueueJobById(queues.rag, jobId, 20000);
    ensure(job, 'job rag-index não encontrado');

    const finalState = await waitForFinalJobState(job, 90000);
    ensure(finalState, 'job rag-index não finalizou');
    if (finalState === 'failed') {
      const refreshed = await queues.rag.getJob(job.id);
      throw new Error(`rag-index failed: ${refreshed?.failedReason || 'unknown reason'}`);
    }

    const chunks = await waitFor(async () => {
      const result = await dbQuery(
        `SELECT COUNT(*)::int AS cnt FROM rag_chunks WHERE conversation_id = $1`,
        [fixtures.conversationId]
      );
      const count = Number(result.rows[0]?.cnt || 0);
      return count > 0 ? count : null;
    }, 25000, 400);

    ensure(chunks && chunks > 0, 'rag_chunks não foram gerados para a conversa de teste');
  });

  await runTest('RAG fallback textual funciona quando embedding indisponivel', async () => {
    await withEnv({
      RAG_VECTOR: 'true',
      EMBEDDING_API_KEY: '',
    }, async () => {
      const results = await ragModule.search('fase5-chave-rag', { topK: 5 });
      ensure(Array.isArray(results), 'resultado de busca RAG não é array');
      ensure(results.length > 0, 'fallback textual de RAG não retornou resultados');
      ensure(results.some((r) => String(r.chunk_text || '').includes('fase5-chave-rag')), 'resultado de RAG não contém chunk esperado');
    });
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
    await runPhase5(state.fixtures);
  } finally {
    await cleanupFixtures(state.fixtures);
  }

  log(`Resumo: ${state.passed} passed, ${state.failed} failed, ${state.warnings.length} warnings`);
  if (state.warnings.length > 0) {
    console.warn('[phase5] Warnings:');
    for (const w of state.warnings) {
      console.warn(` - ${w}`);
    }
  }

  if (state.failed > 0) {
    console.error('[phase5] Falhas:');
    for (const f of state.failedTests) {
      console.error(` - ${f.name}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[phase5] Erro fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    if (sharedDbModule?.close) {
      await sharedDbModule.close();
    }
    await pool.end();
  });
