-- 0030 Plivo: persist the softphone Application ID so its SIP URI (sip:{app_id}@app.plivo.com) can be shown
ALTER TABLE plivo_configs ADD COLUMN endpoint_app_id TEXT;
