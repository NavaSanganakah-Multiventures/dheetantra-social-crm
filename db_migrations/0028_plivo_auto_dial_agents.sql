-- 0028 Plivo: per-account toggle to disable PSTN auto-forward to live agents
ALTER TABLE plivo_configs ADD COLUMN auto_dial_agents INTEGER NOT NULL DEFAULT 1;
