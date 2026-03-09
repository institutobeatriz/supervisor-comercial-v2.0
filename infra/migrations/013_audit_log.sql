-- Migration 013: Persistent Audit Log
-- APPEND-ONLY: never DELETE or UPDATE rows in this table.
-- Records all AI decisions for compliance, debugging and cost tracking.

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id    TEXT NOT NULL,
    job_id      TEXT NOT NULL,
    task        TEXT NOT NULL,       -- 'classify' | 'stt' | 'vision' | 'analyze' | 'report'
    action      TEXT NOT NULL,
    model       TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    cost_cents  INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    decision    TEXT NOT NULL,       -- 'success' | 'fallback' | 'error' | 'rejected' | 'dlq'
    reason      TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON audit_log (trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_task     ON audit_log (task, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_decision ON audit_log (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log (created_at DESC);
