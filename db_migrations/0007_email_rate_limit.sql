-- Email sending rate limiter (atomic counter via INSERT ... ON CONFLICT ... RETURNING)
CREATE TABLE IF NOT EXISTS email_rate_limits (
  window_key TEXT PRIMARY KEY, -- 'workspaceId:minuteBucket'
  workspace_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_rate_limits_workspace ON email_rate_limits(workspace_id);
