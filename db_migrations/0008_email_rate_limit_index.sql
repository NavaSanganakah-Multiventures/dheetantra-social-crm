-- Index for the per-send rate-limit cleanup DELETE (WHERE created_at < now)
CREATE INDEX IF NOT EXISTS idx_email_rate_limits_created ON email_rate_limits(created_at);
