-- ==========================================
-- EMAIL ABUSE MONITORING (auto-suspend)
-- ==========================================

-- Accelerate the rolling 24h failure scan used to auto-suspend abusive
-- domains (see checkDomainAbuse in src/index.ts).
-- Column order (domain_id, created_at, status) enables a contiguous range seek
-- on the 24h window; the previous (domain_id, status, created_at) order forced
-- a walk of the domain's full send history.
CREATE INDEX IF NOT EXISTS idx_email_send_logs_domain_status_time
  ON email_send_logs(domain_id, created_at, status);
