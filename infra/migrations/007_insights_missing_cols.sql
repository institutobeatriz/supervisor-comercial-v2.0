-- Migration 007: Add missing columns to conversation_insights
-- These columns are queried by the conversations API but were missing from init schema.

ALTER TABLE conversation_insights
    ADD COLUMN IF NOT EXISTS temperature TEXT NULL;
    -- 'hot' | 'warm' | 'cold' — conversation temperature based on engagement

ALTER TABLE conversation_insights
    ADD COLUMN IF NOT EXISTS urgency_score SMALLINT NULL;
    -- 0-100 urgency score based on message analysis

-- Index for filtering by temperature in dashboard
CREATE INDEX IF NOT EXISTS idx_conversation_insights_temperature
    ON conversation_insights (temperature) WHERE temperature IS NOT NULL;
