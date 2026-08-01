-- ==========================================
-- EMAIL SERVICE: CUSTOM DOMAINS + SEND LOGS
-- ==========================================

ALTER TABLE domains ADD COLUMN zone_id TEXT;
ALTER TABLE domains ADD COLUMN setup_mode TEXT DEFAULT 'full';
ALTER TABLE domains ADD COLUMN nameservers TEXT;
ALTER TABLE domains ADD COLUMN verification_records TEXT;
ALTER TABLE domains ADD COLUMN mx_records TEXT;
ALTER TABLE domains ADD COLUMN spf_record TEXT;
ALTER TABLE domains ADD COLUMN dkim_records TEXT;
ALTER TABLE domains ADD COLUMN dmarc_record TEXT;
ALTER TABLE domains ADD COLUMN routing_rule_id TEXT;
ALTER TABLE domains ADD COLUMN sending_onboarded INTEGER DEFAULT 0;
ALTER TABLE domains ADD COLUMN error_message TEXT;
ALTER TABLE domains ADD COLUMN last_checked_at DATETIME;

ALTER TABLE domain_emails ADD COLUMN local_part TEXT;
ALTER TABLE domain_emails ADD COLUMN is_default INTEGER DEFAULT 0;

-- Outbound email send log (one row per email sent through EMAIL_SENDER)
CREATE TABLE IF NOT EXISTS email_send_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'failed'
  error_code TEXT,
  error_message TEXT,
  message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_send_logs_workspace ON email_send_logs(workspace_id, created_at);
