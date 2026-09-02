-- 0036: Call routing redesign - per-agent ringing tracking
-- Tracks which agents received a ring push for each call, enabling:
--   * Simultaneous ringing to all available (live) agents
--   * Agent decline = only their ring stops, others keep ringing
--   * Call auto-ends only when ALL ringing agents decline or timeout
--   * Answer tracking for agent busy-status restoration

ALTER TABLE calls ADD COLUMN answered_by_user_id TEXT;

CREATE TABLE IF NOT EXISTS call_ringing_agents (
  call_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ringing',
  device_source TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (call_id, user_id),
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_call_ringing_agents_workspace ON call_ringing_agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_ringing_agents_status ON call_ringing_agents(status);
