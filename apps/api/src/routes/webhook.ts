/** * Webhook Routes - Evolution API * POST /webhooks/evolution */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { upsertContact, upsertConversation, insertMessage, getDefaultSeller, updateConversationLastMessage, getSellerByInstance, query, insertRawEvent } from '@supervisor/db';
import { createLogger } from '@supervisor/audit';

const log = createLogger('webhook');
const mediaLog = createLogger('media');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://172.27.207.185:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

// Baixar mídia descriptada da Evolution API
async function downloadDecryptedMedia(instance: string, messageKey: { id: string; remoteJid: string }): Promise<string | null> {
  try {
    // Endpoint correto da Evolution API v2
    const response = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          key: {
            id: messageKey.id
          }
        },
        convertToMp4: false
      }),
    });
    
    if (!response.ok) {
      mediaLog.error({ instance, status: response.status }, 'Media download failed');
      return null;
    }

    const data = await response.json() as { base64?: string; message?: { base64?: string } };
    // A resposta pode vir em data.base64 ou data.message.base64
    const base64 = data.base64 || data.message?.base64 || null;

    if (base64) {
      mediaLog.info({ instance, base64Chars: base64.length }, 'Base64 media obtained');
    }

    return base64;
  } catch (e) {
    mediaLog.error({ err: e, instance }, 'Media download error');
    return null;
  }
}

function parseRedisUrl(url: string) {
  const match = url.match(/redis:\/\/([^:]+):(\d+)/);
  return match ? { host: match[1], port: parseInt(match[2]) } : { host: 'localhost', port: 6379 };
}
const connection = parseRedisUrl(REDIS_URL);
let classifyQueue: Queue | null = null;
let sttQueue: Queue | null = null;
let visionQueue: Queue | null = null;

function getQueues() {
  if (!classifyQueue) {
    classifyQueue = new Queue('classify', { connection });
    sttQueue = new Queue('stt', { connection });
    visionQueue = new Queue('vision', { connection });
  }
  return { classifyQueue, sttQueue, visionQueue: visionQueue! };
}

const WebhookPayloadSchema = z.object({ 
  event: z.string(), 
  instance: z.string(), 
  data: z.union([z.record(z.unknown()), z.array(z.unknown())]) 
});
const MessageKeySchema = z.object({ remoteJid: z.string(), fromMe: z.boolean(), id: z.string() });
const MessageDataSchema = z.object({ key: MessageKeySchema, message: z.record(z.unknown()).optional(), messageTimestamp: z.union([z.number(), z.string()]), pushName: z.string().optional() });

function extractMessageType(m: Record<string, unknown>) {
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image'; if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio'; if (m.documentMessage) return 'document';
  return 'unknown';
}
function extractMessageText(m: Record<string, unknown>) {
  if (m.conversation) return String(m.conversation);
  if (m.extendedTextMessage) { const e = m.extendedTextMessage as { text?: string }; return e.text || null; }
  return null;
}
function extractMedia(m: Record<string, unknown>) {
  const url = m.imageMessage ? (m.imageMessage as { url?: string }).url : m.videoMessage ? (m.videoMessage as { url?: string }).url : m.audioMessage ? (m.audioMessage as { url?: string }).url : m.documentMessage ? (m.documentMessage as { url?: string }).url : null;
  const mime = m.imageMessage ? (m.imageMessage as { mimetype?: string }).mimetype : m.videoMessage ? (m.videoMessage as { mimetype?: string }).mimetype : m.audioMessage ? (m.audioMessage as { mimetype?: string }).mimetype : m.documentMessage ? (m.documentMessage as { mimetype?: string }).mimetype : null;
  const base64 = m.imageMessage ? (m.imageMessage as { base64?: string }).base64 : m.videoMessage ? (m.videoMessage as { base64?: string }).base64 : m.audioMessage ? (m.audioMessage as { base64?: string }).base64 : m.documentMessage ? (m.documentMessage as { base64?: string }).base64 : null;
  const mediaKey = m.imageMessage ? (m.imageMessage as { mediaKey?: string }).mediaKey : m.videoMessage ? (m.videoMessage as { mediaKey?: string }).mediaKey : m.audioMessage ? (m.audioMessage as { mediaKey?: string }).mediaKey : m.documentMessage ? (m.documentMessage as { mediaKey?: string }).mediaKey : null;
  return { url, mime, base64, mediaKey };
}

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/evolution', { config: { timeout: 150 } }, async (request, reply) => {
    const start = Date.now();
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (secret && request.headers['authorization'] !== `Bearer ${secret}`) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const parsed = WebhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      // Ignorar silenciosamente eventos que não match no schema
      // (chats.upsert, presence.update, etc não são mensagens)
      return reply.status(200).send({ ok: true, ignored: true });
    }
    const { event, instance, data } = parsed.data;

    // Extract whatsapp message ID for deduplication
    const messageData = Array.isArray(parsed.data.data) ? parsed.data.data[0] : parsed.data.data;
    const whatsappId = (messageData as any)?.key?.id ?? null;

    // Persist raw event BEFORE processing (append-only, idempotent)
    const rawEventRecord = await insertRawEvent({
      event: parsed.data.event,
      instance: parsed.data.instance,
      data: parsed.data.data as Record<string, unknown>,
      whatsapp_id: whatsappId,
    });

    if (event === 'messages.upsert' || event === 'send.message') {
      const rawEventId = rawEventRecord?.id;
      setImmediate(() => processMessage(instance, data, fastify, rawEventId));
    }
    return { status: 'queued', time: Date.now() - start };
  });
};

async function processMessage(instance: string, data: unknown, fastify: any, rawEventId?: string) {
  try {
    const parsed = MessageDataSchema.safeParse(data);
    if (!parsed.success) return log.error({ err: parsed.error });
    const { key, message, messageTimestamp, pushName } = parsed.data;
    if (!message) return;

    // MULTI-TENANCY: Get seller by instance
    let seller = await getSellerByInstance(instance) || await getDefaultSeller();
    if (!seller) return log.error({ instance }, 'No seller');

    const phone = key.remoteJid.split('@')[0];
    const contact = await upsertContact({ phone_e164: phone, display_name: pushName });
    const conv = await upsertConversation({ contact_id: contact.id, seller_id: seller.id });

    const { url, mime, base64, mediaKey } = extractMedia(message);
    const ts = typeof messageTimestamp === 'string' ? new Date(parseInt(messageTimestamp) * 1000) : new Date(messageTimestamp * 1000);
    const dir = key.fromMe ? 'outbound' : 'inbound';
    const type = extractMessageType(message);
    const text = extractMessageText(message);
    
    if (type === 'audio') {
      log.info({ whatsappId: key.id, hasBase64: !!base64, hasMediaKey: !!mediaKey, hasUrl: !!url }, 'Audio message detected');
    }

    const msg = await insertMessage({
      conversation_id: conv.id, seller_id: key.fromMe ? seller.id : undefined,
      direction: dir, type: type as any, text, media_url: url, media_mime: mime,
      timestamp: ts, raw_event: data as Record<string, unknown>,
      raw_event_id: rawEventId,
    });
    await updateConversationLastMessage(conv.id);

    const q = getQueues();
    // Processar áudio - tentar Evolution API, se falhar usar descriptografia local
    if (type === 'audio' && url) {
      // Primeiro, tentar baixar da Evolution API
      log.info({ messageId: msg.id }, 'Audio detected, downloading from Evolution API');
      const decryptedBase64 = await downloadDecryptedMedia(instance, { id: key.id, remoteJid: key.remoteJid });

      if (decryptedBase64) {
        log.info({ messageId: msg.id, base64Chars: decryptedBase64.length }, 'Audio obtained via Evolution API');
        await q.sttQueue!.add('transcribe', { messageId: msg.id, mediaUrl: url, base64: decryptedBase64, mediaMime: mime });
      } else if (mediaKey) {
        // Fallback: descriptografia local com mediaKey
        log.warn({ messageId: msg.id }, 'Evolution API failed, falling back to local decryption with mediaKey');
        await q.sttQueue!.add('transcribe', { messageId: msg.id, mediaUrl: url, mediaKey, mediaMime: mime });
      } else {
        log.warn({ messageId: msg.id }, 'Could not process audio: no base64 or mediaKey available');
      }
    }
    if (text && dir === 'inbound') await q.classifyQueue!.add('classify', {
      messageId: msg.id, conversationId: conv.id, text,
      contactName: pushName || contact.display_name, sellerId: seller.id
    });

    // Processar imagem/PDF de forma ASSÍNCRONA — nunca bloquear webhook handler
    if ((type === 'image' || type === 'document') && dir === 'inbound') {
      await q.visionQueue.add('analyze-media', {
        messageId: msg.id,
        conversationId: conv.id,
        sellerId: seller.id,
        instance,
        messageKeyId: key.id,
        messageKeyRemoteJid: key.remoteJid,
        mime: mime || 'image/jpeg',
        type,
      }, {
        jobId: `vision-${msg.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      log.info({ messageId: msg.id, conversationId: conv.id, type }, 'Vision job queued');
    }

  } catch (e) { log.error({ err: e }, 'Process error'); }
}

export default webhookRoutes;
