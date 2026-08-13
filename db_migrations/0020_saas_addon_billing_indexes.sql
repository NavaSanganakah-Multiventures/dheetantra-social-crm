-- 0020: SaaS email add-on billing
--   - billing-gated domain review support index
--   - enforce at most one active/created email add-on subscription per workspace
CREATE INDEX IF NOT EXISTS idx_domains_billing ON domains(workspace_id, billing_status, review_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_sub_active_email ON addon_subscriptions(workspace_id) WHERE addon_id LIKE 'email-addon-%' AND status IN ('created','active');
