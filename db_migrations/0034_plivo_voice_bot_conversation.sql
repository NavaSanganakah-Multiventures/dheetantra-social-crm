-- 0034 Plivo: voice bot conversation settings (Gemini Live bridge)
-- voice_bot_instructions: system instruction for the AI receptionist ("Arya")
-- voice_bot_greeting: optional short <Speak> played before the <Stream> starts
ALTER TABLE plivo_configs ADD COLUMN voice_bot_instructions TEXT;
ALTER TABLE plivo_configs ADD COLUMN voice_bot_greeting TEXT;
