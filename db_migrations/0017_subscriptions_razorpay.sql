-- ==========================================
-- 0017: RAZORPAY SUBSCRIPTIONS & BILLING
-- Plans get billing config; subscriptions,
-- payments and webhook events get tables.
-- ==========================================

ALTER TABLE plans ADD COLUMN billing_type TEXT DEFAULT 'recurring';   -- 'recurring' | 'one_time'
ALTER TABLE plans ADD COLUMN billing_period TEXT DEFAULT 'monthly';   -- 'daily' | 'weekly' | 'monthly' | 'yearly'
ALTER TABLE plans ADD COLUMN billing_interval INTEGER DEFAULT 1;
ALTER TABLE plans ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE plans ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE plans ADD COLUMN is_free INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN razorpay_plan_id TEXT;
ALTER TABLE plans ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Workspace subscriptions (one row per paid/free plan activation)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_order_id TEXT,
  razorpay_plan_id TEXT,
  billing_type TEXT NOT NULL DEFAULT 'recurring',
  status TEXT NOT NULL DEFAULT 'created',  -- created|authenticated|active|past_due|paused|completed|cancelled|expired
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  current_period_start INTEGER,
  current_period_end INTEGER,              -- unix seconds
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay ON subscriptions(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period ON subscriptions(status, current_period_end);

-- Payment / invoice history
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subscription_id TEXT,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_order_id TEXT,
  razorpay_subscription_id TEXT,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'captured',  -- captured|failed|refunded|pending
  method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id, created_at);

-- Webhook idempotency log (razorpay_event_id = event:entity_id composite key)
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  razorpay_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  processed INTEGER DEFAULT 1,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Guarantee a free plan exists so workspaces always have a downgrade target
INSERT INTO plans (id, name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json,
                   billing_type, billing_period, billing_interval, currency, is_active, is_free, sort_order)
SELECT 'free', 'Free', 'Free starter plan with basic features.', 0, 0,
       '["WhatsApp Integration", "Basic Inbox", "Email Service"]',
       '{"email_monthly_limit": 100, "max_domains": 1, "max_mailboxes_per_domain": 3, "allow_email_send": true}',
       'one_time', 'monthly', 1, 'INR', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE is_free = 1);

-- Backfill: workspaces without a plan get the free plan
UPDATE workspaces SET plan_id = (SELECT id FROM plans WHERE is_free = 1 LIMIT 1)
WHERE plan_id IS NULL AND EXISTS (SELECT 1 FROM plans WHERE is_free = 1);
