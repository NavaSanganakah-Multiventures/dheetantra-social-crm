-- ==========================================
-- Missing tables used by billing / rate-limit / contact form code
-- (referenced in src/index.ts but absent from schema.sql)
-- ==========================================

-- Monthly email usage per workspace (plan quota + overage billing)
CREATE TABLE IF NOT EXISTS workspace_email_usage (
  workspace_id TEXT NOT NULL,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  emails_sent INTEGER NOT NULL DEFAULT 0,
  overage_emails INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, year_month)
);

-- Daily per-workspace domain add rate limiting (atomic counter)
CREATE TABLE IF NOT EXISTS domain_add_rate_limits (
  window_key TEXT PRIMARY KEY, -- 'workspaceId:YYYY-MM-DD'
  workspace_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_add_rate_limits_created ON domain_add_rate_limits(created_at);

-- Public contact form submissions (admin review)
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Plan limits JSON (used by getWorkspacePlanLimits / admin plan CRUD)
ALTER TABLE plans ADD COLUMN limits_json TEXT;
