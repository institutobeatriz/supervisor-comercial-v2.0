-- Migration 010: Instance-to-Seller Mapping
-- Maps Evolution API instance names to seller IDs.
-- Replaces the hardcoded map in webhook.ts.

CREATE TABLE IF NOT EXISTS instance_seller_map (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance    TEXT NOT NULL UNIQUE,
    seller_id   UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instance_seller_map_active
    ON instance_seller_map (instance) WHERE active = TRUE;

-- Seed with current hardcoded values
-- NOTE: These UUIDs must match what exists in the sellers table.
-- If sellers don't exist yet, this will fail — run after sellers are seeded.
-- Using DO $$ ... $$ block for safe conditional insert:
DO $$
BEGIN
    -- Only insert if seller with this ID exists
    IF EXISTS (SELECT 1 FROM sellers WHERE id = '80a50431-8f36-477c-9072-f0adcba3696e') THEN
        INSERT INTO instance_seller_map (instance, seller_id) VALUES
            ('Multivix',        '80a50431-8f36-477c-9072-f0adcba3696e'),
            ('Multivix-Alunos', '80a50431-8f36-477c-9072-f0adcba3696e')
        ON CONFLICT (instance) DO NOTHING;
    END IF;

    IF EXISTS (SELECT 1 FROM sellers WHERE id = '6f875432-5dea-4fcf-972e-b278eb2c1d5b') THEN
        INSERT INTO instance_seller_map (instance, seller_id) VALUES
            ('Instituto-Vendas', '6f875432-5dea-4fcf-972e-b278eb2c1d5b'),
            ('instituto-vendas',  '6f875432-5dea-4fcf-972e-b278eb2c1d5b')
        ON CONFLICT (instance) DO NOTHING;
    END IF;
END $$;
