-- 0034 Plivo: AI voice agent fallback (Audio Stream / WebSocket -> Gemini Live)
ALTER TABLE plivo_configs ADD COLUMN ai_fallback_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plivo_configs ADD COLUMN ai_instructions TEXT;
ALTER TABLE plivo_configs ADD COLUMN ai_voice_model TEXT NOT NULL DEFAULT 'models/gemini-2.0-flash-exp';
