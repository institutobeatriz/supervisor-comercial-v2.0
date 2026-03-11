/**
 * Repositories
 * Supervisor Comercial
 */
import { db } from './pool.js';
// ============================================================
// SELLERS
// ============================================================
export const SellersRepo = {
    async create(input) {
        return db.insert('sellers', {
            name: input.name,
            email: input.email || null,
            phone: input.phone || null,
            active: true,
            config: {},
        });
    },
    async findById(id) {
        return db.findOne('sellers', 'id = $1', [id]);
    },
    async findActive() {
        return db.findMany('sellers', 'active = true', []);
    },
    async update(id, data) {
        return db.update('sellers', data, 'id = $1', [id]);
    },
};
// ============================================================
// CONTACTS
// ============================================================
export const ContactsRepo = {
    async create(input) {
        return db.insert('contacts', {
            phone_e164: input.phone_e164,
            display_name: input.display_name || null,
            tags: input.tags || [],
            is_business: false,
        });
    },
    async findByPhone(phone) {
        return db.findOne('contacts', 'phone_e164 = $1', [phone]);
    },
    async findById(id) {
        return db.findOne('contacts', 'id = $1', [id]);
    },
    async upsertByPhone(phone, data) {
        const existing = await this.findByPhone(phone);
        if (existing) {
            const updated = await db.update('contacts', data, 'id = $1', [existing.id]);
            return updated;
        }
        return this.create({ phone_e164: phone, ...data });
    },
    async addTag(id, tag) {
        await db.query('UPDATE contacts SET tags = array_append(tags, $1) WHERE id = $2 AND NOT ($1 = ANY(tags))', [tag, id]);
    },
};
// ============================================================
// CONVERSATIONS
// ============================================================
export const ConversationsRepo = {
    async create(input) {
        return db.insert('conversations', {
            contact_id: input.contact_id,
            seller_id: input.seller_id,
            status: 'open',
            funnel_stage: 'lead',
            total_messages: 0,
            client_messages: 0,
            seller_messages: 0,
            tags: [],
            metadata: {},
        });
    },
    async findById(id) {
        return db.findOne('conversations', 'id = $1', [id]);
    },
    async findByContact(contactId) {
        return db.findMany('conversations', 'contact_id = $1', [contactId], {
            orderBy: 'created_at DESC',
        });
    },
    async findOpenByContact(contactId) {
        return db.findOne('conversations', 'contact_id = $1 AND status = $2', [contactId, 'open']);
    },
    async incrementMessages(id, origin) {
        const column = origin === 'client' ? 'client_messages' : 'seller_messages';
        await db.query(`UPDATE conversations SET
        total_messages = total_messages + 1,
        ${column} = ${column} + 1,
        last_message_at = NOW(),
        ${origin === 'seller' ? 'last_seller_message_at = NOW(),' : ''}
        updated_at = NOW()
      WHERE id = $1`, [id]);
    },
    async updateStatus(id, status) {
        await db.query('UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    },
    async updateFunnel(id, stage) {
        await db.query('UPDATE conversations SET funnel_stage = $1, updated_at = NOW() WHERE id = $2', [stage, id]);
    },
};
// ============================================================
// INSTANCES
// ============================================================
export const InstancesRepo = {
    async create(data) {
        return db.insert('instances', {
            name: data.name,
            evolution_id: data.evolution_id,
            token: data.token,
            seller_id: data.seller_id || null,
            status: data.status || 'disconnected',
            config: data.config || {},
        });
    },
    async findById(id) {
        return db.findOne('instances', 'id = $1', [id]);
    },
    async findByName(name) {
        return db.findOne('instances', 'name = $1', [name]);
    },
    async findByEvolutionId(evolutionId) {
        return db.findOne('instances', 'evolution_id = $1', [evolutionId]);
    },
    async upsertByName(name, data) {
        const existing = await this.findByName(name);
        if (existing) {
            const updated = await db.update('instances', data, 'id = $1', [existing.id]);
            return updated;
        }
        return this.create(data);
    },
    async updateStatus(id, status) {
        const connectedAt = status === 'connected' ? new Date() : null;
        const disconnectedAt = status === 'disconnected' ? new Date() : null;
        await db.query(`UPDATE instances SET
        status = $1,
        connected_at = COALESCE($2, connected_at),
        disconnected_at = COALESCE($3, disconnected_at),
        updated_at = NOW()
      WHERE id = $4`, [status, connectedAt, disconnectedAt, id]);
    },
};
// ============================================================
// RAW EVENTS
// ============================================================
export const RawEventsRepo = {
    async create(data) {
        return db.insert('raw_events', {
            instance_id: data.instance_id || null,
            event_type: data.event_type,
            payload: data.payload,
            message_id: data.message_id || null,
            processing_status: 'pending',
        });
    },
    async findPending(limit = 100) {
        return db.findMany('raw_events', 'processing_status = $1', ['pending'], { orderBy: 'received_at ASC', limit });
    },
    async markProcessing(id) {
        await db.query('UPDATE raw_events SET processing_status = $1 WHERE id = $2', ['processing', id]);
    },
    async markCompleted(id) {
        await db.query('UPDATE raw_events SET processing_status = $1, processed_at = NOW() WHERE id = $2', ['completed', id]);
    },
    async markFailed(id, error) {
        await db.query('UPDATE raw_events SET processing_status = $1, processing_error = $2, processed_at = NOW() WHERE id = $3', ['failed', error, id]);
    },
};
// ============================================================
// MESSAGES
// ============================================================
export const MessagesRepo = {
    async create(data) {
        return db.insert('messages', {
            conversation_id: data.conversation_id,
            instance_id: data.instance_id || null,
            message_id: data.message_id,
            from_jid: data.from_jid,
            to_jid: data.to_jid,
            message_type: data.message_type || 'text',
            content: data.content || null,
            media_url: data.media_url || null,
            media_mime_type: data.media_mime_type || null,
            media_size: data.media_size || null,
            caption: data.caption || null,
            origin: data.origin || 'client',
            is_edited: false,
            is_deleted: false,
            is_forwarded: data.is_forwarded || false,
            quoted_message_id: data.quoted_message_id || null,
            timestamp: data.timestamp || new Date(),
        });
    },
    async findById(id) {
        return db.findOne('messages', 'id = $1', [id]);
    },
    async findByMessageId(messageId) {
        return db.findOne('messages', 'message_id = $1', [messageId]);
    },
    async findByConversation(conversationId, limit = 100) {
        return db.findMany('messages', 'conversation_id = $1 AND is_deleted = false', [conversationId], { orderBy: 'timestamp ASC', limit });
    },
    async findRecentAudio(conversationId, limit = 10) {
        return db.findMany('messages', 'conversation_id = $1 AND message_type = $2 AND is_deleted = false', [conversationId, 'audio'], { orderBy: 'timestamp DESC', limit });
    },
    async markDeleted(messageId) {
        await db.query('UPDATE messages SET is_deleted = true WHERE message_id = $1', [messageId]);
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
//# sourceMappingURL=repos.js.map