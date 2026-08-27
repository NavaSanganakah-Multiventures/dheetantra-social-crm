-- 0027 Plivo voice provider: config tables + agent availability fields
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE workspace_members ADD COLUMN voice_status TEXT NOT NULL DEFAULT 'not_live';
ALTER TABLE workspace_members ADD COLUMN voice_status_updated_at DATETIME;
ALTER TABLE calls ADD COLUMN plivo_config_id TEXT;
ALTER TABLE calls ADD COLUMN assigned_user_id TEXT;

CREATE TABLE IF NOT EXISTS plivo_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Plivo Account',
  auth_id TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plivo_from_numbers (
  id TEXT PRIMARY KEY,
  plivo_config_id TEXT NOT NULL,
  from_number TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plivo_config_id) REFERENCES plivo_configs(id) ON DELETE CASCADE,
  UNIQUE (plivo_config_id, from_number)
);

CREATE INDEX IF NOT EXISTS idx_plivo_configs_workspace
  ON plivo_configs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_plivo_from_numbers_config
  ON plivo_from_numbers(plivo_config_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_voice_status
  ON workspace_members(voice_status);
