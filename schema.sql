CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  upfront_price REAL DEFAULT 0, -- For premium features
  pay_as_you_go_rate REAL DEFAULT 0, -- Variable rate
  features_json TEXT, -- JSON array of feature flags/limits
  limits_json TEXT, -- JSON object of plan limits (email_monthly_limit etc.)
  billing_type TEXT DEFAULT 'recurring', -- 'recurring' | 'one_time'
  billing_period TEXT DEFAULT 'monthly', -- 'daily' | 'weekly' | 'monthly' | 'yearly'
  billing_interval INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'INR',
  is_active INTEGER DEFAULT 1,
  is_free INTEGER DEFAULT 0,
  razorpay_plan_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  is_registered BOOLEAN DEFAULT 0, -- To ensure they actually registered, not just requested an OTP for login
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces table (for SaaS multi-tenancy)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id TEXT, -- Link to plans table
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Workspace Members (M2M relation mapping users to workspaces)
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member'
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL, -- Unix timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OTPs table
CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL, -- Unix timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster OTP lookup by email during verification
CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);

-- Index for faster conversations lookup
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);

-- ==========================================
-- STEP 2 SCHEMA: OMNICHANNEL INBOX
-- ==========================================

-- Contacts / Customers (people messaging the businesses)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'whatsapp', 'instagram', 'facebook'
  platform_contact_id TEXT NOT NULL, -- e.g., wa_id or IG PSID
  name TEXT DEFAULT 'Unknown User',
  phone TEXT,
  additional_phone TEXT,
  email TEXT,
  gender TEXT,
  instagram_username TEXT,
  facebook_username TEXT,
  whatsapp_username TEXT,
  notes TEXT,
  is_lead INTEGER DEFAULT 0,
  lead_status TEXT DEFAULT 'new',
  lead_source TEXT DEFAULT 'manual',
  lead_value REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, platform, platform_contact_id) -- Prevent duplicate contacts per workspace per platform
);

-- Conversations (links a contact to a workspace context)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed', 'snoozed'
  phone_number_id TEXT,
  customer_last_message_at DATETIME,
  ai_label TEXT, -- Gemini classification: 'lead','urgent','complaint','inquiry','support','follow_up','spam','other'
  ai_summary TEXT, -- Short Gemini summary of the conversation
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Messages (the actual chat messages)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'contact', 'agent', 'bot'
  content TEXT, -- Text body of the message
  media_url TEXT, -- If there's an R2 media attachment
  platform_message_id TEXT UNIQUE, -- ID from Meta to prevent duplicates
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read'
  message_type TEXT DEFAULT 'text',
  platform TEXT NOT NULL DEFAULT 'whatsapp', -- source channel: 'whatsapp', 'email' (future: 'instagram', 'facebook')
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for fast inbox querying
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_ai ON conversations(workspace_id, ai_label);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- WhatsApp API Configurations
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  access_token TEXT NOT NULL,
  verify_token TEXT,
  reply_mode TEXT DEFAULT 'manual',
  calling_enabled INTEGER DEFAULT 1,
  ai_provider TEXT DEFAULT 'gemini',
  ai_voice_instructions TEXT,
  about TEXT DEFAULT '',
  description TEXT DEFAULT '',
  website TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  username TEXT DEFAULT '',
  profile_picture_url TEXT DEFAULT '',
  call_schedule TEXT DEFAULT '{"enabled":false,"start_time":"09:00","end_time":"17:00","days":[1,2,3,4,5,6,7]}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'UTILITY',
  language TEXT DEFAULT 'en_US',
  body_text TEXT NOT NULL,
  status TEXT DEFAULT 'APPROVED',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  categories TEXT DEFAULT 'UTILITY',
  screens_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  phone_number_id TEXT,
  caller_number TEXT,
  type TEXT NOT NULL DEFAULT 'voice',
  direction TEXT NOT NULL DEFAULT 'incoming',
  status TEXT NOT NULL DEFAULT 'missed',
  duration INTEGER DEFAULT 0,
  recording_url TEXT,
  hangup_cause TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- ==========================================
-- STEP 4 & 5 SCHEMA: BROADCASTS & PUBLISHING
-- ==========================================

-- Broadcast Campaigns
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'processing', 'completed', 'failed'
  total_recipients INTEGER DEFAULT 0,
  successful_sends INTEGER DEFAULT 0,
  failed_sends INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Scheduled Social Media Posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'instagram', 'facebook'
  content TEXT,
  media_urls TEXT, -- JSON array of complete R2 paths
  scheduled_for DATETIME NOT NULL,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'published', 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ==========================================
-- STEP 7: B2B EMAIL & CUSTOM DOMAINS SCHEMA
-- ==========================================

-- Client Custom Domains
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain_name TEXT UNIQUE NOT NULL, -- e.g., 'client-domain.com'
  status TEXT DEFAULT 'pending', -- 'pending', 'active', 'failed'
  review_status TEXT DEFAULT 'pending_review', -- 'pending_review', 'approved', 'rejected'
  setup_mode TEXT DEFAULT 'full', -- 'full' (nameservers) | 'cname' (partial / DNS-only)
  zone_id TEXT, -- Cloudflare zone id
  nameservers TEXT, -- JSON array (full setup)
  verification_records TEXT, -- JSON array (cname setup: TXT cloudflare-verify)
  mx_records TEXT, -- JSON array of {name, content, priority}
  spf_record TEXT, -- JSON array of {name, content}
  dkim_records TEXT, -- JSON array of {name, content}
  dmarc_record TEXT, -- JSON array of {name, content}
  routing_rule_id TEXT, -- Cloudflare Email Routing catch-all rule id
  sending_onboarded INTEGER DEFAULT 0, -- 1 once a send succeeded via send_email binding
  error_message TEXT,
  last_checked_at DATETIME,
  abuse_reset_at DATETIME, -- set on admin unsuspend: fresh 24h abuse window starts here
  consecutive_failures INTEGER DEFAULT 0, -- maintenance retry backoff counter
  next_retry_at DATETIME, -- maintenance rows skipped until this time passes
  pending_records TEXT, -- records the user must add at their provider (partial/CNAME mode)
  billing_status TEXT DEFAULT 'unpaid', -- 'unpaid' | 'paid' (email add-on gating, from 0019)
  subscription_id TEXT, -- addon_subscriptions.id that paid for this domain (from 0019)
  admin_notes TEXT, -- internal admin notes (from 0019)
  requested_by TEXT, -- user id who requested the domain (from 0019)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  blocked_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Domain Emails (Email Routing Addresses / Mailboxes)
CREATE TABLE IF NOT EXISTS domain_emails (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  local_part TEXT, -- e.g., 'contact'
  email_address TEXT UNIQUE NOT NULL, -- e.g., 'contact@client-domain.com'
  forward_to TEXT, -- e.g., 'info@our-crm.com'
  status TEXT DEFAULT 'active',
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- Outbound email send log (one row per email sent through EMAIL_SENDER)
CREATE TABLE IF NOT EXISTS email_send_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'failed'
  error_code TEXT,
  error_message TEXT,
  message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_send_logs_workspace ON email_send_logs(workspace_id, created_at);

-- Abuse monitoring scan (24h failure counts per domain)
-- Column order (domain_id, created_at, status) lets SQLite range-seek the
-- 24h window instead of walking the domain's full send history.
CREATE INDEX IF NOT EXISTS idx_email_send_logs_domain_status_time ON email_send_logs(domain_id, created_at, status);

-- Monthly email usage per workspace (plan quota + overage billing)
CREATE TABLE IF NOT EXISTS workspace_email_usage (
  workspace_id TEXT NOT NULL,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  emails_sent INTEGER NOT NULL DEFAULT 0,
  overage_emails INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, year_month)
);

-- Daily per-workspace domain add rate limiting (atomic counter)
CREATE TABLE IF NOT EXISTS domain_add_rate_limits (
  window_key TEXT PRIMARY KEY, -- 'workspaceId:YYYY-MM-DD'
  workspace_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_add_rate_limits_created ON domain_add_rate_limits(created_at);

-- Public contact form submissions (admin review)
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email sending rate limiter (atomic counter via INSERT ... ON CONFLICT ... RETURNING)
CREATE TABLE IF NOT EXISTS email_rate_limits (
  window_key TEXT PRIMARY KEY, -- 'workspaceId:minuteBucket'
  workspace_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_rate_limits_workspace ON email_rate_limits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_rate_limits_created ON email_rate_limits(created_at);

-- Customizable Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_type TEXT NOT NULL, -- e.g., 'otp', 'welcome', 'invoice'
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, template_type)
);

-- FCM Tokens
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  device_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS waba_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  business_id TEXT, -- Meta Business Manager ID
  waba_id TEXT NOT NULL UNIQUE, -- WhatsApp Business Account ID
  name TEXT,
  timezone_id TEXT,
  currency TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS waba_phone_numbers (
  id TEXT PRIMARY KEY,
  waba_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone_number TEXT,
  quality_rating TEXT,
  verified_name TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (waba_id) REFERENCES waba_accounts(waba_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ==========================================
-- STEP: RAZORPAY SUBSCRIPTIONS & BILLING
-- ==========================================

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

-- ===== Email SaaS gating (migration 0019_saas_email_gating) =====
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

CREATE INDEX IF NOT EXISTS idx_domains_billing ON domains(workspace_id, billing_status, review_status);
-- billing-gated domain review support (idx_domains_billing)
