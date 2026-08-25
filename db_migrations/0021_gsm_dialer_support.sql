-- ==========================================
-- GSM DEFAULT DIALER SUPPORT (Phase 1)
-- 1. Calls table extended for GSM call logs & recordings
-- 2. Users keep a default-dialer preference
-- ==========================================

ALTER TABLE calls ADD COLUMN source TEXT DEFAULT 'whatsapp';
ALTER TABLE calls ADD COLUMN recording_url TEXT;
ALTER TABLE calls ADD COLUMN notes TEXT;
ALTER TABLE calls ADD COLUMN started_at DATETIME;
ALTER TABLE calls ADD COLUMN ended_at DATETIME;

ALTER TABLE users ADD COLUMN default_dialer_enabled INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_calls_source_workspace ON calls(workspace_id, source, created_at);
CREATE INDEX IF NOT EXISTS idx_calls_recording ON calls(recording_url);
