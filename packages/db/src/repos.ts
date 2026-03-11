/**
 * Repositories
 * Supervisor Comercial
 */

import { db } from './pool.js';
import type {
  Seller,
  Contact,
  Conversation,
  Instance,
  RawEvent,
  Message,
  CreateSellerInput,
  CreateContactInput,
  CreateConversationInput,
} from './types.js';

// ============================================================
// SELLERS
// ============================================================

export const SellersRepo = {
  async create(input: CreateSellerInput): Promise<Seller> {
    return db.insert<Seller>('sellers', {
      name: input.name,
      active: input.active ?? true,
    } as Seller);
  },

  async findById(id: string): Promise<Seller | null> {
    return db.findOne<Seller>('sellers', 'id = $1', [id]);
  },

  async findActive(): Promise<Seller[]> {
    return db.findMany<Seller>('sellers', 'active = true', []);
  },

  async update(id: string, data: Partial<Seller>): Promise<Seller | null> {
    return db.update<Seller>('sellers', data, 'id = $1', [id]);
  },
};

// ============================================================
// CONTACTS
// ============================================================

export const ContactsRepo = {
  async create(input: CreateContactInput): Promise<Contact> {
    return db.insert<Contact>('contacts', {
      phone_e164: input.phone_e164,
      display_name: input.display_name || null,
      tags: input.tags || [],
    } as Contact);
  },

  async findByPhone(phone: string): Promise<Contact | null> {
    return db.findOne<Contact>('contacts', 'phone_e164 = $1', [phone]);
  },

  async findById(id: string): Promise<Contact | null> {
    return db.findOne<Contact>('contacts', 'id = $1', [id]);
  },

  async upsertByPhone(phone: string, data: Partial<Contact>): Promise<Contact> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      const updated = await db.update<Contact>('contacts', data, 'id = $1', [existing.id]);
      return updated!;
    }
    return this.create({ phone_e164: phone, ...data });
  },

  async addTag(id: string, tag: string): Promise<void> {
    await db.query(
      'UPDATE contacts SET tags = array_append(tags, $1) WHERE id = $2 AND NOT ($1 = ANY(tags))',
      [tag, id]
    );
  },
};

// ============================================================
// CONVERSATIONS
// ============================================================

export const ConversationsRepo = {
  async create(input: CreateConversationInput): Promise<Conversation> {
    return db.insert<Conversation>('conversations', {
      contact_id: input.contact_id,
      seller_id: input.seller_id,
      status: input.status || 'open',
      funnel_stage: input.funnel_stage || 'lead',
    } as Conversation);
  },

  async findById(id: string): Promise<Conversation | null> {
    return db.findOne<Conversation>('conversations', 'id = $1', [id]);
  },

  async findByContact(contactId: string): Promise<Conversation[]> {
    return db.findMany<Conversation>('conversations', 'contact_id = $1', [contactId], {
      orderBy: 'created_at DESC',
    });
  },

  async findOpenByContact(contactId: string): Promise<Conversation | null> {
    return db.findOne<Conversation>(
      'conversations',
      'contact_id = $1 AND status = $2',
      [contactId, 'open']
    );
  },

  async incrementMessages(id: string, origin: 'client' | 'seller'): Promise<void> {
    const column = origin === 'client' ? 'client_messages' : 'seller_messages';
    await db.query(
      `UPDATE conversations SET
        total_messages = COALESCE(total_messages, 0) + 1,
        ${column} = COALESCE(${column}, 0) + 1,
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = $1`,
      [id]
    );
  },

  async updateStatus(id: string, status: Conversation['status']): Promise<void> {
    await db.query(
      'UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  },

  async updateFunnel(id: string, stage: Conversation['funnel_stage']): Promise<void> {
    await db.query(
      'UPDATE conversations SET funnel_stage = $1, updated_at = NOW() WHERE id = $2',
      [stage, id]
    );
  },
};

// ============================================================
// INSTANCES
// ============================================================

export const InstancesRepo = {
  async create(data: Partial<Instance>): Promise<Instance> {
    return db.insert<Instance>('instances', {
      name: data.name!,
      status: data.status || 'disconnected',
    } as Instance);
  },

  async findById(id: string): Promise<Instance | null> {
    return db.findOne<Instance>('instances', 'id = $1', [id]);
  },

  async findByName(name: string): Promise<Instance | null> {
    return db.findOne<Instance>('instances', 'name = $1', [name]);
  },

  async upsertByName(name: string, data: Partial<Instance>): Promise<Instance> {
    const existing = await this.findByName(name);
    if (existing) {
      const updated = await db.update<Instance>('instances', data, 'id = $1', [existing.id]);
      return updated!;
    }
    return this.create(data);
  },

  async updateStatus(id: string, status: Instance['status']): Promise<void> {
    await db.query(
      'UPDATE instances SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  },
};

// ============================================================
// RAW EVENTS
// ============================================================

export const RawEventsRepo = {
  async create(data: {
    instance_id?: string;
    event_type: string;
    payload: Record<string, unknown>;
    message_id?: string;
  }): Promise<RawEvent> {
    return db.insert<RawEvent>('raw_events', {
      event: data.event_type,
      instance: data.instance_id || '',
      data: data.payload,
    } as RawEvent);
  },

  async findPending(limit = 100): Promise<RawEvent[]> {
    return db.findMany<RawEvent>(
      'raw_events',
      'processing_status = $1',
      ['pending'],
      { orderBy: 'received_at ASC', limit }
    );
  },

  async markProcessing(id: string): Promise<void> {
    await db.query(
      'UPDATE raw_events SET processing_status = $1 WHERE id = $2',
      ['processing', id]
    );
  },

  async markCompleted(id: string): Promise<void> {
    await db.query(
      'UPDATE raw_events SET processing_status = $1, processed_at = NOW() WHERE id = $2',
      ['completed', id]
    );
  },

  async markFailed(id: string, error: string): Promise<void> {
    await db.query(
      'UPDATE raw_events SET processing_status = $1, processing_error = $2, processed_at = NOW() WHERE id = $3',
      ['failed', error, id]
    );
  },
};

// ============================================================
// MESSAGES
// ============================================================

export const MessagesRepo = {
  async create(data: Partial<Message>): Promise<Message> {
    return db.insert<Message>('messages', {
      conversation_id: data.conversation_id!,
      seller_id: data.seller_id || null,
      direction: data.direction || 'inbound',
      type: data.type || 'text',
      text: data.text || data.content || null,
      media_url: data.media_url || null,
      media_mime: data.media_mime || data.media_mime_type || null,
      media_sha256: null,
      timestamp: data.timestamp || new Date(),
      raw_event: {},
    } as Message);
  },

  async findById(id: string): Promise<Message | null> {
    return db.findOne<Message>('messages', 'id = $1', [id]);
  },

  async findByConversation(conversationId: string, limit = 100): Promise<Message[]> {
    return db.findMany<Message>(
      'messages',
      'conversation_id = $1',
      [conversationId],
      { orderBy: 'timestamp ASC', limit }
    );
  },
};

// ============================================================
// EXPORT
// ============================================================

export const repos = {
  sellers: SellersRepo,
  contacts: ContactsRepo,
  conversations: ConversationsRepo,
  instances: InstancesRepo,
  rawEvents: RawEventsRepo,
  messages: MessagesRepo,
};

export default repos;
