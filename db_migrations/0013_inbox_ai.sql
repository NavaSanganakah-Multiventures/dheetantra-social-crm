-- ==========================================
-- UNIFIED INBOX: AI LABELING
-- ==========================================

-- ai_label: Gemini-classified conversation category ('lead', 'urgent',
-- 'complaint', 'inquiry', 'support', 'follow_up', 'spam', 'other').
-- ai_summary: short Gemini summary of the conversation (optional).
ALTER TABLE conversations ADD COLUMN ai_label TEXT;
ALTER TABLE conversations ADD COLUMN ai_summary TEXT;

-- Fast filtering by workspace + AI category for the unified inbox.
CREATE INDEX IF NOT EXISTS idx_conversations_ai
  ON conversations(workspace_id, ai_label);
