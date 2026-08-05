-- ==========================================
-- Email billing, domain-add rate limits and plan-based quotas
-- ==========================================

-- Structured limits per plan (keep features_json as marketing string array)
-- NOTE: SQLite does not support "IF NOT EXISTS" on ADD COLUMN; this migration
-- runs once (tracked in d1_migrations), so a plain ADD COLUMN is safe.
ALTER TABLE plans ADD COLUMN limits_json TEXT DEFAULT '{}';

-- Monthly email usage per workspace (resets per year-month)
CREATE TABLE IF NOT EXISTS workspace_email_usage (
  workspace_id TEXT NOT NULL,
  year_month TEXT NOT NULL, -- e.g. '2026-08'
  emails_sent INTEGER NOT NULL DEFAULT 0,
  overage_emails INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, year_month),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_email_usage_workspace ON workspace_email_usage(workspace_id);

-- Per-workspace daily domain-add rate limiter
CREATE TABLE IF NOT EXISTS domain_add_rate_limits (
  window_key TEXT PRIMARY KEY, -- 'workspaceId:YYYY-MM-DD'
  workspace_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_add_rate_limits_workspace ON domain_add_rate_limits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_domain_add_rate_limits_created ON domain_add_rate_limits(created_at);

-- Seed plan limits for the default plans created by /api/plans
UPDATE plans SET limits_json = '{
  "email_monthly_limit": 100,
  "max_domains": 1,
  "max_mailboxes_per_domain": 3,
  "allow_email_send": true
}' WHERE name = 'Starter Pay-As-You-Go';

UPDATE plans SET limits_json = '{
  "email_monthly_limit": 1000,
  "max_domains": 5,
  "max_mailboxes_per_domain": 10,
  "allow_email_send": true
}' WHERE name = 'Pro Premium';

UPDATE plans SET limits_json = '{
  "email_monthly_limit": 10000,
  "max_domains": 100,
  "max_mailboxes_per_domain": 100,
  "allow_email_send": true
}' WHERE name = 'Enterprise Unlocked';
