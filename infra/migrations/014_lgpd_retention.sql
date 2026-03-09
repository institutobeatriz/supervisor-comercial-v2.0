-- Migration 014: LGPD data retention and anonymization function
-- Implements Art. 16 of Brazil's LGPD (Lei Geral de Proteção de Dados)
-- Anonymizes contact data for inactive non-customers after 2 years

CREATE OR REPLACE FUNCTION anonymize_inactive_contacts(
    inactive_days INTEGER DEFAULT 730  -- 2 anos = 730 dias
) RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE contacts
    SET
        display_name = 'ANONIMIZADO',
        -- Irreversible hash of phone number to maintain referential integrity
        phone_e164 = 'ANON-' || encode(sha256(phone_e164::bytea), 'hex')
    WHERE
        -- Never purchased (non-customers need less retention)
        id NOT IN (
            SELECT DISTINCT c.contact_id
            FROM conversations c
            JOIN sales_outcomes so ON so.conversation_id = c.id
            WHERE so.outcome = 'won'
        )
        -- Last contact was more than N days ago
        AND id IN (
            SELECT contact_id FROM conversations
            GROUP BY contact_id
            HAVING MAX(last_message_at) < NOW() - (inactive_days || ' days')::INTERVAL
        )
        -- Not already anonymized
        AND phone_e164 NOT LIKE 'ANON-%';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
