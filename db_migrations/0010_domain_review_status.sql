-- ==========================================
-- Admin review workflow for custom domains
-- ==========================================

ALTER TABLE domains ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review';

-- Backfill: every existing domain that is already active/onboarded is considered approved
UPDATE domains SET review_status = 'approved' WHERE review_status IS NULL OR review_status = '';

CREATE INDEX IF NOT EXISTS idx_domains_review_status ON domains(workspace_id, review_status);
