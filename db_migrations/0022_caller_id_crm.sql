-- ==========================================
-- CALLER ID + AFTER-CALL CRM (Phase 2)
-- 1. Store AI-generated call summaries
-- 2. Per-user caller-id and after-call toggle
-- ==========================================

ALTER TABLE calls ADD COLUMN summary TEXT;
ALTER TABLE calls ADD COLUMN ai_summary_generated_at DATETIME;
ALTER TABLE calls ADD COLUMN transcript TEXT;

ALTER TABLE users ADD COLUMN caller_id_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN after_call_crm_enabled INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_calls_summary ON calls(ai_summary_generated_at);
