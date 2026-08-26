-- ==========================================
-- WORKSPACE-BASED TWILIO VOICE CONFIGURATION
-- ==========================================

CREATE TABLE IF NOT EXISTS twilio_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Twilio Account',
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS twilio_from_numbers (
  id TEXT PRIMARY KEY,
  twilio_config_id TEXT NOT NULL,
  from_number TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (twilio_config_id) REFERENCES twilio_configs(id) ON DELETE CASCADE,
  UNIQUE (twilio_config_id, from_number)
);

CREATE INDEX IF NOT EXISTS idx_twilio_configs_workspace
  ON twilio_configs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_twilio_from_numbers_config
  ON twilio_from_numbers(twilio_config_id);

ALTER TABLE calls ADD COLUMN twilio_config_id TEXT;
ALTER TABLE calls ADD COLUMN external_call_id TEXT;
