-- ==========================================
-- 0019: SaaS Custom Hostnames + Email Addon Gating
--
-- 1. Add Cloudflare for SaaS custom_hostnames table for dashboard white-label domains.
-- 2. Add service_addons + addon_subscriptions tables for paid per-service add-ons.
-- 3. Extend domains table with billing/approval gating fields so email zones are
--    only created after the workspace has paid for the email add-on.
-- ==========================================

-- -------------------------------------------------
-- 1. CUSTOM HOSTNAMES (Cloudflare for SaaS)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_hostnames (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain TEXT NOT NULL COLLATE NOCASE,
  hostname_id TEXT,                                   -- Cloudflare custom hostname id
  status TEXT DEFAULT 'pending',                      -- pending | pending_validation | active | failed
  verification_code TEXT,                             -- TXT/CNAME verification record value
  fallback_origin TEXT DEFAULT '',                    -- e.g. app.navasanganakah.com
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_custom_hostnames_workspace ON custom_hostnames(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_custom_hostnames_domain ON custom_hostnames(domain);

-- -------------------------------------------------
-- 2. SERVICE ADDONS (paid optional services)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS service_addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  upfront_price REAL DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'recurring',    -- recurring | one_time
  billing_period TEXT DEFAULT 'monthly',              -- daily | weekly | monthly | yearly
  billing_interval INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'INR',
  razorpay_plan_id TEXT,
  max_domains INTEGER DEFAULT 1,                      -- how many email domains this addon allows
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_addons_active ON service_addons(is_active, sort_order);

-- -------------------------------------------------
-- 3. ADDON SUBSCRIPTIONS
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS addon_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  addon_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',            -- created | active | past_due | paused | completed | cancelled | expired
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  current_period_start INTEGER,
  current_period_end INTEGER,                         -- unix seconds
  cancel_at_period_end INTEGER DEFAULT 0,
  domains_allowed INTEGER DEFAULT 1,
  domains_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES service_addons(id)
);

CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_workspace ON addon_subscriptions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_addon ON addon_subscriptions(addon_id, status);
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_razorpay ON addon_subscriptions(razorpay_subscription_id);

-- -------------------------------------------------
-- 4. DOMAINS TABLE EXTENSIONS (email gating)
-- -------------------------------------------------
ALTER TABLE domains ADD COLUMN billing_status TEXT DEFAULT 'unpaid';     -- unpaid | paid | refunded
ALTER TABLE domains ADD COLUMN subscription_id TEXT;                     -- reference to addon_subscriptions
ALTER TABLE domains ADD COLUMN admin_notes TEXT;
ALTER TABLE domains ADD COLUMN requested_by TEXT;                        -- user_id who requested

CREATE INDEX IF NOT EXISTS idx_domains_billing ON domains(workspace_id, billing_status, review_status);

-- -------------------------------------------------
-- 5. SEED DEFAULT EMAIL ADDON PLANS
-- -------------------------------------------------
INSERT INTO service_addons 
  (id, name, description, upfront_price, billing_type, billing_period, billing_interval, currency, razorpay_plan_id, max_domains, is_active, sort_order)
VALUES
  ('email-addon-1', 'Email Service - 1 Domain', 'One custom email domain with Cloudflare Email Routing.', 499, 'recurring', 'monthly', 1, 'INR', NULL, 1, 1, 1),
  ('email-addon-5', 'Email Service - 5 Domains', 'Five custom email domains with Cloudflare Email Routing.', 1999, 'recurring', 'monthly', 1, 'INR', NULL, 5, 1, 2),
  ('email-addon-10', 'Email Service - 10 Domains', 'Ten custom email domains with Cloudflare Email Routing.', 3499, 'recurring', 'monthly', 1, 'INR', NULL, 10, 1, 3)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  upfront_price = excluded.upfront_price,
  billing_type = excluded.billing_type,
  billing_period = excluded.billing_period,
  billing_interval = excluded.billing_interval,
  currency = excluded.currency,
  max_domains = excluded.max_domains,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP;
