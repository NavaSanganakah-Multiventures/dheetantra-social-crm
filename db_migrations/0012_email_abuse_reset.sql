-- ==========================================
-- EMAIL ABUSE: RESET BASELINE + INDEX REORDER
-- ==========================================

-- abuse_reset_at gives a domain a fresh 24h failure baseline when an admin
-- unsuspends it. Without this, failures recorded before the unsuspend would
-- deterministically auto-suspend the domain again on its very next send
-- (the 24h window cannot be diluted by successful sends while the ratio is
-- still >= 0.5), looping admin unsuspend -> re-suspend until the window ages
-- out. checkDomainAbuse scans only logs created_at >= abuse_reset_at.
ALTER TABLE domains ADD COLUMN abuse_reset_at DATETIME;

-- Re-key the abuse scan index so the 24h range on created_at is a contiguous
-- seek. Idempotent guards make this safe whether or not 0011 already ran with
-- the (domain_id, status, created_at) ordering.
DROP INDEX IF EXISTS idx_email_send_logs_domain_status_time;
CREATE INDEX IF NOT EXISTS idx_email_send_logs_domain_status_time
  ON email_send_logs(domain_id, created_at, status);