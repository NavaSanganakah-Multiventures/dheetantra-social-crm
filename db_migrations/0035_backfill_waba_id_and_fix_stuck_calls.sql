-- 1. Backfill waba_id for existing configs (just in case any are NULL)
UPDATE whatsapp_configs 
SET waba_id = (
  SELECT waba_id 
  FROM waba_accounts 
  WHERE waba_accounts.workspace_id = whatsapp_configs.workspace_id 
  LIMIT 1
) 
WHERE waba_id IS NULL;

-- 2. Clear out old stuck calls to unblock new calls
UPDATE calls 
SET status = 'ended' 
WHERE source = 'whatsapp' AND status IN ('dialing', 'ringing', 'in_progress');
