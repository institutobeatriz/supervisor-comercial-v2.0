-- Migration 012: Add email column to sellers table
-- Fixes missing email column that is referenced in application code.
-- NOTE: monthly_goal_cents is already owned by migration 003.

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS email TEXT NULL;
