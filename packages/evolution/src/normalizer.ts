/**
 * Evolution API Normalizer
 * Converte payloads da Evolution API para formato padronizado
 */

import { z } from 'zod';

// ============================================================
// SCHEMAS (Zod)
// ============================================================

// Message Key
const MessageKeySchema = z.object({
  remoteJid: z.string(),
  fromMe: z.boolean().default(false),
  id: z.string(),
});

// Message Types
const TextMessageSchema = z.object({
  conversation: z.string().optional(),
  extendedTextMessage: z.object({
    text: z.string(),
    contextInfo: z.object({
      quotedMessage: z.record(z.unknown()).optional(),
      stanzaId: z.string().optional(),
    }).optional(),
  }).optional(),
});

const MediaMessageSchema = z.object({
  imageMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    fileLength: z.union([z.string(), z.number()]).optional(),
    caption: z.string().optional(),
  }).optional(),
  videoMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    fileLength: z.union([z.string(), z.number()]).optional(),
    caption: z.string().optional(),
    gifPlayback: z.boolean().optional(),
  }).optional(),
  audioMessage: z.object({
    url: z.string().optional(),
    mimetype: z.string().optional(),
    fileLength: z.union([z.string(), z.number()]).optional(),
    ptt: z.boolean().optional(), // voice note
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
});

const MessageSchema = TextMessageSchema.merge(MediaMessageSchema);

// Full Message Data
const MessageDataSchema = z.object({
  key: MessageKeySchema,
  message: MessageSchema,
  messageTimestamp: z.union([z.number(), z.string()]),
  pushName: z.string().optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']).optional(),
});

// Webhook Event
export const WebhookEventSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.unknown(),
});

// ============================================================
// TYPES
// ============================================================

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type MessageData = z.infer<typeof MessageDataSchema>;
export type MessageKey = z.infer<typeof MessageKeySchema>;

export interface NormalizedMessage {
  // IDs
  message_id: string;
  from_jid: string;
  to_jid: string;
  instance_name: string;

  // Content
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction' | 'unknown';
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  media_size?: number;
  caption?: string;

  // Metadata
  origin: 'client' | 'seller';
  is_forwarded: boolean;
  quoted_message_id?: string;
  push_name?: string;

  // Timestamp
  timestamp: Date;

  // Raw
  raw: Record<string, unknown>;
}

export interface NormalizedStatus {
  message_id: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  instance_name: string;
}

export interface NormalizedConnection {
  instance_name: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  owner_jid?: string;
  profile_name?: string;
}

// ============================================================
// NORMALIZER FUNCTIONS
// ============================================================

/**
 * Extrai o tipo de mensagem
 */
function getMessageType(message: z.infer<typeof MessageSchema>): NormalizedMessage['message_type'] {
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.locationMessage) return 'location';
  if (message.contactMessage) return 'contact';
  if (message.reactionMessage) return 'reaction';
  return 'unknown';
}

/**
 * Extrai o conteúdo da mensagem
 */
function extractContent(
  message: z.infer<typeof MessageSchema>,
  type: NormalizedMessage['message_type']
): Partial<NormalizedMessage> {
  switch (type) {
    case 'text':
      return {
        content: message.conversation || message.extendedTextMessage?.text || '',
        quoted_message_id: message.extendedTextMessage?.contextInfo?.stanzaId,
      };

    case 'image':
      return {
        media_url: message.imageMessage?.url,
        media_mime_type: message.imageMessage?.mimetype,
        media_size: typeof message.imageMessage?.fileLength === 'string'
          ? parseInt(message.imageMessage.fileLength)
          : message.imageMessage?.fileLength,
        caption: message.imageMessage?.caption,
      };

    case 'video':
      return {
        media_url: message.videoMessage?.url,
        media_mime_type: message.videoMessage?.mimetype,
        media_size: typeof message.videoMessage?.fileLength === 'string'
          ? parseInt(message.videoMessage.fileLength)
          : message.videoMessage?.fileLength,
        caption: message.videoMessage?.caption,
      };

    case 'audio':
      return {
        media_url: message.audioMessage?.url,
        media_mime_type: message.audioMessage?.mimetype,
        media_size: typeof message.audioMessage?.fileLength === 'string'
          ? parseInt(message.audioMessage.fileLength)
          : message.audioMessage?.fileLength,
      };

    case 'document':
      return {
        media_url: message.documentMessage?.url,
        media_mime_type: message.documentMessage?.mimetype,
        media_size: typeof message.documentMessage?.fileLength === 'string'
          ? parseInt(message.documentMessage.fileLength)
          : message.documentMessage?.fileLength,
        caption: message.documentMessage?.caption,
      };

    case 'sticker':
      return {
        media_url: message.stickerMessage?.url,
        media_mime_type: message.stickerMessage?.mimetype,
      };

    case 'location':
      return {
        content: message.locationMessage?.name || message.locationMessage?.address,
      };

    case 'contact':
      return {
        content: message.contactMessage?.displayName,
      };

    case 'reaction':
      return {
        content: message.reactionMessage?.text,
        quoted_message_id: message.reactionMessage?.key?.id,
      };

    default:
      return {};
  }
}

/**
 * Normaliza uma mensagem do webhook
 */
export function normalizeMessage(
  instanceName: string,
  data: unknown
): NormalizedMessage | null {
  try {
    const parsed = MessageDataSchema.parse(data);
    const { key, message, messageTimestamp, pushName } = parsed;

    const messageType = getMessageType(message);
    const content = extractContent(message, messageType);

    // Determinar origem
    const origin: NormalizedMessage['origin'] = key.fromMe ? 'seller' : 'client';

    // Determinar to_jid baseado na origem
    const to_jid = key.fromMe ? key.remoteJid : extractBotJid(key.remoteJid);

    // Timestamp
    const timestamp = typeof messageTimestamp === 'string'
      ? new Date(parseInt(messageTimestamp) * 1000)
      : new Date(messageTimestamp * 1000);

    return {
      message_id: key.id,
      from_jid: key.fromMe ? extractBotJid(key.remoteJid) : key.remoteJid,
      to_jid,
      instance_name: instanceName,
      message_type: messageType,
      origin,
      is_forwarded: false, // TODO: detect forwarded
      push_name: pushName,
      timestamp,
      raw: data as Record<string, unknown>,
      ...content,
    };
  } catch (error) {
    console.error('[Normalizer] Failed to parse message:', error);
    return null;
  }
}

/**
 * Normaliza uma atualização de status
 */
export function normalizeStatus(
  instanceName: string,
  data: unknown
): NormalizedStatus | null {
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
      instance_name: instanceName,
    };
  } catch (error) {
    console.error('[Normalizer] Failed to parse status:', error);
    return null;
  }
}

/**
 * Normaliza uma atualização de conexão
 */
export function normalizeConnection(
  instanceName: string,
  data: unknown
): NormalizedConnection {
  const parsed = z.object({
    state: z.enum(['connecting', 'connected', 'disconnected', 'error']).optional(),
    status: z.enum(['connecting', 'connected', 'disconnected', 'error']).optional(),
    ownerJid: z.string().optional(),
    profileName: z.string().optional(),
  }).parse(data);

  return {
    instance_name: instanceName,
    status: parsed.state || parsed.status || 'disconnected',
    owner_jid: parsed.ownerJid,
    profile_name: parsed.profileName,
  };
}

/**
 * Extrai o JID do bot da instância
 * (Simplificado - em produção viria da instância)
 */
function extractBotJid(remoteJid: string): string {
  // Por enquanto, retorna um placeholder
  // TODO: Buscar da tabela instances
  return 'bot@s.whatsapp.net';
}

/**
 * Normaliza evento webhook baseado no tipo
 */
export function normalizeWebhookEvent(event: WebhookEvent): {
  type: 'message' | 'status' | 'connection' | 'unknown';
  data: NormalizedMessage | NormalizedStatus | NormalizedConnection | null;
} {
  const { event: eventType, instance, data } = event;

  switch (eventType) {
    case 'messages.upsert':
    case 'send.message':
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

export default {
  normalizeMessage,
  normalizeStatus,
  normalizeConnection,
  normalizeWebhookEvent,
  WebhookEventSchema,
};
