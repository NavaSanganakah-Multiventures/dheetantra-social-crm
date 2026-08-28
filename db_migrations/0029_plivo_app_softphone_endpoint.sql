-- 0029 Plivo: softphone endpoint credentials for in-app (app) answering
ALTER TABLE plivo_configs ADD COLUMN endpoint_username TEXT;
ALTER TABLE plivo_configs ADD COLUMN endpoint_password TEXT;
