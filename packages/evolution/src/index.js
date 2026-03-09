/**
 * Evolution API Normalizer
 * Converte payloads da Evolution API para formato padronizado
 */
import { z } from 'zod';
// ============================================================
// SCHEMAS (Zod) - Tolerante a variações de payload
// ============================================================
// Message Key
const MessageKeySchema = z.object({
    remoteJid: z.string(),
    fromMe: z.boolean().default(false),
    id: z.string(),
    participant: z.string().optional(),
});
// Message Types - Múltiplos formatos
const TextMessageSchema = z.object({
    conversation: z.string().optional(),
    extendedTextMessage: z.object({
        text: z.string().optional(),
        contextInfo: z.object({
            quotedMessage: z.record(z.unknown()).optional(),
            stanzaId: z.string().optional(),
        }).optional(),
    }).optional(),
}).passthrough();
const MediaMessageSchema = z.object({
    imageMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileLength: z.union([z.string(), z.number()]).optional(),
        caption: z.string().optional(),
        jpegThumbnail: z.string().optional(),
    }).optional(),
    videoMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileLength: z.union([z.string(), z.number()]).optional(),
        caption: z.string().optional(),
        jpegThumbnail: z.string().optional(),
        gifPlayback: z.boolean().optional(),
    }).optional(),
    audioMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileLength: z.union([z.string(), z.number()]).optional(),
        ptt: z.boolean().optional(),
        seconds: z.number().optional(),
    }).optional(),
    documentMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileName: z.string().optional(),
        fileLength: z.union([z.string(), z.number()]).optional(),
        caption: z.string().optional(),
    }).optional(),
    stickerMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileLength: z.union([z.string(), z.number()]).optional(),
    }).optional(),
    locationMessage: z.object({
        degreesLatitude: z.number().optional(),
        degreesLongitude: z.number().optional(),
        name: z.string().optional(),
        address: z.string().optional(),
    }).optional(),
    contactMessage: z.object({
        displayName: z.string().optional(),
        vcard: z.string().optional(),
    }).optional(),
    reactionMessage: z.object({
        key: MessageKeySchema.optional(),
        text: z.string().optional(),
    }).optional(),
}).passthrough();
const MessageSchema = TextMessageSchema.merge(MediaMessageSchema);
// Full Message Data
const MessageDataSchema = z.object({
    key: MessageKeySchema,
    message: MessageSchema.optional(),
    messageTimestamp: z.union([z.number(), z.string()]),
    pushName: z.string().optional(),
    status: z.string().optional(),
});
// Webhook Event
export const WebhookEventSchema = z.object({
    event: z.string(),
    instance: z.string(),
    data: z.unknown(),
});
// Connection Update
const ConnectionUpdateSchema = z.object({
    state: z.enum(['connecting', 'connected', 'disconnected', 'error']).optional(),
    status: z.enum(['connecting', 'connected', 'disconnected', 'error']).optional(),
    ownerJid: z.string().optional(),
    profileName: z.string().optional(),
});
// ============================================================
// NORMALIZER FUNCTIONS
// ============================================================
/**
 * Determina o tipo de mensagem
 */
function getMessageType(message) {
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
    if (message.stickerMessage)
        return 'sticker';
    if (message.locationMessage)
        return 'location';
    if (message.contactMessage)
        return 'contact';
    if (message.reactionMessage)
        return 'reaction';
    return 'unknown';
}
/**
 * Extrai conteúdo da mensagem
 */
function extractContent(message, type) {
    switch (type) {
        case 'text':
            return {
                text: message.conversation || message.extendedTextMessage?.text || null,
                quoted_id: message.extendedTextMessage?.contextInfo?.stanzaId || null,
            };
        case 'image':
            return {
                media_url: message.imageMessage?.url || null,
                media_mime: message.imageMessage?.mimetype || null,
                media_size: parseFileLength(message.imageMessage?.fileLength),
                caption: message.imageMessage?.caption || null,
            };
        case 'video':
            return {
                media_url: message.videoMessage?.url || null,
                media_mime: message.videoMessage?.mimetype || null,
                media_size: parseFileLength(message.videoMessage?.fileLength),
                caption: message.videoMessage?.caption || null,
            };
        case 'audio':
            return {
                media_url: message.audioMessage?.url || null,
                media_mime: message.audioMessage?.mimetype || null,
                media_size: parseFileLength(message.audioMessage?.fileLength),
            };
        case 'document':
            return {
                media_url: message.documentMessage?.url || null,
                media_mime: message.documentMessage?.mimetype || null,
                media_size: parseFileLength(message.documentMessage?.fileLength),
                caption: message.documentMessage?.caption || null,
            };
        case 'sticker':
            return {
                media_url: message.stickerMessage?.url || null,
                media_mime: message.stickerMessage?.mimetype || null,
            };
        case 'location':
            return {
                text: message.locationMessage?.name || message.locationMessage?.address || null,
            };
        case 'contact':
            return {
                text: message.contactMessage?.displayName || null,
            };
        case 'reaction':
            return {
                text: message.reactionMessage?.text || null,
                quoted_id: message.reactionMessage?.key?.id || null,
            };
        default:
            return {};
    }
}
/**
 * Converte fileLength para número
 */
function parseFileLength(value) {
    if (!value)
        return null;
    if (typeof value === 'number')
        return value;
    const parsed = parseInt(value);
    return isNaN(parsed) ? null : parsed;
}
/**
 * Normaliza uma mensagem do webhook
 */
export function normalizeMessage(instance, data) {
    try {
        const parsed = MessageDataSchema.parse(data);
        const { key, message, messageTimestamp, pushName } = parsed;
        if (!message) {
            return null; // Sem conteúdo de mensagem
        }
        const messageType = getMessageType(message);
        const content = extractContent(message, messageType);
        const direction = key.fromMe ? 'outbound' : 'inbound';
        // Timestamp
        const timestamp = typeof messageTimestamp === 'string'
            ? new Date(parseInt(messageTimestamp) * 1000)
            : new Date(messageTimestamp * 1000);
        // Extrair phone do JID
        const phoneFromJid = key.remoteJid.split('@')[0];
        return {
            message_id: key.id,
            from_jid: key.fromMe ? 'bot' : key.remoteJid,
            to_jid: key.fromMe ? key.remoteJid : 'bot',
            remote_jid: key.remoteJid,
            direction,
            type: messageType,
            push_name: pushName || null,
            timestamp,
            instance,
            raw: data,
            ...content,
        };
    }
    catch (error) {
        console.error('[Normalizer] Failed to parse message:', error);
        return null;
    }
}
/**
 * Normaliza atualização de status
 */
export function normalizeStatus(instance, data) {
    try {
        const parsed = z.object({
            key: MessageKeySchema,
            status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']),
            messageTimestamp: z.union([z.number(), z.string()]),
        }).parse(data);
        const timestamp = typeof parsed.messageTimestamp === 'string'
            ? new Date(parseInt(parsed.messageTimestamp) * 1000)
            : new Date(parsed.messageTimestamp * 1000);
        return {
            message_id: parsed.key.id,
            status: parsed.status,
            timestamp,
            instance,
        };
    }
    catch (error) {
        console.error('[Normalizer] Failed to parse status:', error);
        return null;
    }
}
/**
 * Normaliza atualização de conexão
 */
export function normalizeConnection(instance, data) {
    try {
        const parsed = ConnectionUpdateSchema.parse(data);
        return {
            instance,
            status: parsed.state || parsed.status || 'disconnected',
            owner_jid: parsed.ownerJid || null,
            profile_name: parsed.profileName || null,
        };
    }
    catch (error) {
        console.error('[Normalizer] Failed to parse connection:', error);
        return {
            instance,
            status: 'disconnected',
            owner_jid: null,
            profile_name: null,
        };
    }
}
/**
 * Processa evento webhook baseado no tipo
 */
export function processWebhookEvent(event) {
    const { event: eventType, instance, data } = event;
    switch (eventType) {
        case 'messages.upsert':
        case 'send.message':
        case 'messages.upsert.api':
            return {
                type: 'message',
                data: normalizeMessage(instance, data),
            };
        case 'messages.update':
            return {
                type: 'status',
                data: normalizeStatus(instance, data),
            };
        case 'connection.update':
        case 'status.instance':
            return {
                type: 'connection',
                data: normalizeConnection(instance, data),
            };
        default:
            return {
                type: 'unknown',
                data: null,
            };
    }
}
// ============================================================
// EXPORT
// ============================================================
export const normalizer = {
    normalizeMessage,
    normalizeStatus,
    normalizeConnection,
    processWebhookEvent,
};
export default normalizer;
//# sourceMappingURL=index.js.map