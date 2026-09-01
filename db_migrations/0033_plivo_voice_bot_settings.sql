ALTER TABLE plivo_configs ADD COLUMN voice_bot_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plivo_configs ADD COLUMN office_hours_start TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE plivo_configs ADD COLUMN office_hours_end TEXT NOT NULL DEFAULT '16:00';
ALTER TABLE plivo_configs ADD COLUMN office_hours_audio_url TEXT;
ALTER TABLE plivo_configs ADD COLUMN busy_audio_url TEXT;
