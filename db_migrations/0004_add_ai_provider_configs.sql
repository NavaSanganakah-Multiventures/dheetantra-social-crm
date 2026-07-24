-- Add ai_provider and ai_voice_instructions to whatsapp_configs
ALTER TABLE whatsapp_configs ADD COLUMN ai_provider TEXT DEFAULT 'gemini';
ALTER TABLE whatsapp_configs ADD COLUMN ai_voice_instructions TEXT;
