-- ==========================================
-- CALLS TABLE: VOICE (TWILIO/GSM) COLUMNS
-- ==========================================
-- Production calls table was seeded from schema.sql
-- before these columns existed, so they were missing.
-- Fixes: "D1_ERROR: table calls has no column named source"
-- (recording_url is intentionally NOT added here: it already
-- exists in schema.sql / production calls table.)
-- ==========================================

ALTER TABLE calls ADD COLUMN source TEXT DEFAULT 'whatsapp';
ALTER TABLE calls ADD COLUMN notes TEXT;
ALTER TABLE calls ADD COLUMN started_at DATETIME;
ALTER TABLE calls ADD COLUMN ended_at DATETIME;
ALTER TABLE calls ADD COLUMN summary TEXT;
ALTER TABLE calls ADD COLUMN ai_summary_generated_at DATETIME;
ALTER TABLE calls ADD COLUMN transcript TEXT;
ALTER TABLE calls ADD COLUMN twilio_config_id TEXT;
ALTER TABLE calls ADD COLUMN external_call_id TEXT;
