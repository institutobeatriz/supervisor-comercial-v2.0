/**
 * Webhook Routes - Evolution API
 * POST /webhooks/evolution
 *
 * Deve responder em <= 150ms
 * Enfileira jobs para processamento assíncrono
 */
import { z } from 'zod';
import { upsertContact, upsertConversation, insertMessage, getDefaultSeller, updateConversationLastMessage, } from '@supervisor/db';
// ============================================================
// SCHEMAS
// ============================================================
const WebhookPayloadSchema = z.object({
    event: z.string(),
    instance: z.string(),
    data: z.record(z.unknown()),
});
// Message data from Evolution
const MessageKeySchema = z.object({
    remoteJid: z.string(),
    fromMe: z.boolean(),
    id: z.string(),
});
const MessageDataSchema = z.object({
    key: MessageKeySchema,
    message: z.record(z.unknown()).optional(),
    messageTimestamp: z.union([z.number(), z.string()]),
    pushName: z.string().optional(),
});
let jobQueue = null;
export function setJobQueue(queue) {
    jobQueue = queue;
}
// ============================================================
// NORMALIZER
// ============================================================
function extractMessageType(message) {
    if (message.conversation || message.extendedTextMessage)
        return 'text';
    if (message.imageMessage)
        return 'image';
    if (message.videoMessage)
        return 'video';
    if (message.audioMessage)
        return 'audio';
    if (message.documentMessage)
        return 'document';
    return 'unknown';
}
function extractMessageText(message) {
    if (message.conversation)
        return String(message.conversation);
    if (message.extendedTextMessage) {
        const ext = message.extendedTextMessage;
        return ext.text || null;
    }
    return null;
}
function extractMediaUrl(message) {
    if (message.imageMessage) {
        const img = message.imageMessage;
        return img.url || null;
    }
    if (message.videoMessage) {
        const vid = message.videoMessage;
        return vid.url || null;
    }
    if (message.audioMessage) {
        const aud = message.audioMessage;
        return aud.url || null;
    }
    if (message.documentMessage) {
        const doc = message.documentMessage;
        return doc.url || null;
    }
    return null;
}
function extractMediaMime(message) {
    if (message.imageMessage) {
        const img = message.imageMessage;
        return img.mimetype || null;
    }
    if (message.videoMessage) {
        const vid = message.videoMessage;
        return vid.mimetype || null;
    }
    if (message.audioMessage) {
        const aud = message.audioMessage;
        return aud.mimetype || null;
    }
    if (message.documentMessage) {
        const doc = message.documentMessage;
        return doc.mimetype || null;
    }
    return null;
}
// ============================================================
// ROUTES
// ============================================================
const webhookRoutes = async (fastify) => {
    /**
     * POST /webhooks/evolution
     * Webhook da Evolution API
     */
    fastify.post('/evolution', {
        config: {
            timeout: 150, // 150ms max
        },
    }, async (request, reply) => {
        const startTime = Date.now();
        // Validate webhook secret if configured
        const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (webhookSecret) {
            const authHeader = request.headers['authorization'];
            if (authHeader !== `Bearer ${webhookSecret}`) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }
        }
        // Parse and validate payload
        const parseResult = WebhookPayloadSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({ error: 'Invalid payload' });
        }
        const { event, instance, data } = parseResult.data;
        // Log event
        fastify.log.debug({
            event,
            instance,
            processingTime: Date.now() - startTime,
        });
        // Process based on event type
        if (event === 'messages.upsert' || event === 'send.message') {
            // Queue for async processing
            setImmediate(() => processMessageEvent(instance, data, fastify));
        }
        // Return fast response
        const processingTime = Date.now() - startTime;
        if (processingTime > 150) {
            fastify.log.warn({
                msg: 'Webhook exceeded 150ms',
                processingTime,
                event,
            });
        }
        return { status: 'queued', processingTime };
    });
};
// ============================================================
// MESSAGE PROCESSOR (Async)
// ============================================================
async function processMessageEvent(instance, data, fastify) {
    try {
        // Parse message data
        const parseResult = MessageDataSchema.safeParse(data);
        if (!parseResult.success) {
            fastify.log.error({ msg: 'Invalid message data', error: parseResult.error });
            return;
        }
        const { key, message, messageTimestamp, pushName } = parseResult.data;
        if (!message) {
            return; // No message content
        }
        // Get default seller
        const seller = await getDefaultSeller();
        if (!seller) {
            fastify.log.error({ msg: 'No seller found' });
            return;
        }
        // Extract phone from JID
        const phoneE164 = key.remoteJid.split('@')[0];
        // Upsert contact
        const contact = await upsertContact({
            phone_e164: phoneE164,
            display_name: pushName,
        });
        // Upsert conversation
        const conversation = await upsertConversation({
            contact_id: contact.id,
            seller_id: seller.id,
        });
        // Determine message direction
        const direction = key.fromMe ? 'outbound' : 'inbound';
        const type = extractMessageType(message);
        const text = extractMessageText(message);
        const mediaUrl = extractMediaUrl(message);
        const mediaMime = extractMediaMime(message);
        // Parse timestamp
        const timestamp = typeof messageTimestamp === 'string'
            ? new Date(parseInt(messageTimestamp) * 1000)
            : new Date(messageTimestamp * 1000);
        // Insert message
        const msg = await insertMessage({
            conversation_id: conversation.id,
            seller_id: key.fromMe ? seller.id : undefined,
            direction,
            type: type,
            text,
            media_url: mediaUrl,
            media_mime: mediaMime,
            timestamp,
            raw_event: data,
        });
        // Update conversation last_message_at
        await updateConversationLastMessage(conversation.id);
        // Queue jobs
        if (jobQueue) {
            // STT job for audio
            if (type === 'audio' && mediaUrl) {
                await jobQueue.add('stt', { message_id: msg.id });
            }
            // Classification job
            await jobQueue.add('classify', { message_id: msg.id });
        }
    }
    catch (error) {
        fastify.log.error({ msg: 'Error processing message', error });
    }
}
export default webhookRoutes;
//# sourceMappingURL=webhook.js.map