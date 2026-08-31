-- ==========================================
-- TWILIO VOICE SDK SUPPORT
-- Adds fields needed for Twilio Voice SDK tokens and Flutter in-app calling.
-- ==========================================

ALTER TABLE twilio_configs ADD COLUMN voice_application_sid TEXT;
ALTER TABLE twilio_configs ADD COLUMN api_key_sid TEXT;
ALTER TABLE twilio_configs ADD COLUMN api_key_secret TEXT;
ALTER TABLE twilio_configs ADD COLUMN push_credential_sid_android TEXT;
ALTER TABLE twilio_configs ADD COLUMN push_credential_sid_ios TEXT;
