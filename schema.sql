CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  upfront_price REAL DEFAULT 0, -- For premium features
  pay_as_you_go_rate REAL DEFAULT 0, -- Variable rate
  features_json TEXT, -- JSON array of feature flags/limits
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for fast inbox querying
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, status);
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

-- Domain Emails (Email Routing Addresses)
CREATE TABLE IF NOT EXISTS domain_emails (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  email_address TEXT UNIQUE NOT NULL, -- e.g., 'contact@client-domain.com'
  forward_to TEXT, -- e.g., 'info@our-crm.com'
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

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
