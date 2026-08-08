-- ==========================================
-- 0018: Message platform/source column
-- ==========================================
-- Every message now records its source channel directly (no JOIN needed):
--   'whatsapp' | 'email' (and future: 'instagram' | 'facebook')
-- Existing rows are backfilled from message_type ('email' emails, everything
-- else was WhatsApp), matching how conversations/contacts already store
-- platform.

ALTER TABLE messages ADD COLUMN platform TEXT NOT NULL DEFAULT 'whatsapp';

UPDATE messages SET platform = 'email' WHERE message_type = 'email';

CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(conversation_id, platform);
