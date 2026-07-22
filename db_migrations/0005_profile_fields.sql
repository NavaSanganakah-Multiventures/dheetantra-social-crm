-- WhatsApp Business Profile fields
ALTER TABLE whatsapp_configs ADD COLUMN about TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN description TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN website TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN email TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN address TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN username TEXT DEFAULT '';
ALTER TABLE whatsapp_configs ADD COLUMN profile_picture_url TEXT DEFAULT '';

-- Call schedule: JSON {"enabled":false,"start_time":"09:00","end_time":"17:00","days":[1,2,3,4,5,6,7]}
ALTER TABLE whatsapp_configs ADD COLUMN call_schedule TEXT DEFAULT '{"enabled":false,"start_time":"09:00","end_time":"17:00","days":[1,2,3,4,5,6,7]}';
