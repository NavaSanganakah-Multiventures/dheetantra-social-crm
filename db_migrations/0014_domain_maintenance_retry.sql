-- ==========================================
-- Domain maintenance backoff + fallback records
-- ==========================================

-- Consecutive failure counter for scheduled maintenance retries (exponential backoff)
ALTER TABLE domains ADD COLUMN consecutive_failures INTEGER DEFAULT 0;

-- Next allowed maintenance re-check time; rows are skipped until this passes
ALTER TABLE domains ADD COLUMN next_retry_at DATETIME;

-- Records that could not be listed from the zone (CNAME/partial mode, listing
-- permission missing): surfaced in the UI as "add at your provider — not yet
-- active" instead of pretending they already exist in the zone.
ALTER TABLE domains ADD COLUMN pending_records TEXT;