export const dropSql = `
DROP TABLE IF EXISTS calls;
DROP TABLE IF EXISTS whatsapp_templates;
DROP TABLE IF EXISTS waba_phone_numbers;
DROP TABLE IF EXISTS waba_accounts;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS domain_emails;
DROP TABLE IF EXISTS domains;
DROP TABLE IF EXISTS scheduled_posts;
DROP TABLE IF EXISTS broadcast_campaigns;
DROP TABLE IF EXISTS api_domains;
DROP TABLE IF EXISTS whatsapp_configs;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS otps;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS child;
DROP TABLE IF EXISTS child2;
DROP TABLE IF EXISTS parent;
DROP TABLE IF EXISTS parent2;
DROP TABLE IF EXISTS new_child;
DROP TABLE IF EXISTS a;
`;

export const schemaSql = `
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  upfront_price REAL DEFAULT 0,
  pay_as_you_go_rate REAL DEFAULT 0,
  features_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  is_registered BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_contact_id TEXT NOT NULL,
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
  UNIQUE(workspace_id, platform, platform_contact_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  phone_number_id TEXT,
  customer_last_message_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  content TEXT,
  media_url TEXT,
  platform_message_id TEXT UNIQUE,
  status TEXT DEFAULT 'sent',
  message_type TEXT DEFAULT 'text',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  access_token TEXT NOT NULL,
  verify_token TEXT,
  reply_mode TEXT DEFAULT 'manual',
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

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  successful_sends INTEGER DEFAULT 0,
  failed_sends INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  content TEXT,
  media_urls TEXT,
  scheduled_for DATETIME NOT NULL,
  status TEXT DEFAULT 'scheduled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  domain_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS domain_emails (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  email_address TEXT UNIQUE NOT NULL,
  forward_to TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, template_type)
);

CREATE TABLE IF NOT EXISTS waba_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  business_id TEXT,
  waba_id TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'voice',
  direction TEXT NOT NULL DEFAULT 'incoming',
  status TEXT NOT NULL DEFAULT 'missed',
  duration INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
`;

// Auto-migrate tables for Multiple WABAs
export async function runAlterMigrations(db: any) {
  try {
    try {
      await db.prepare("ALTER TABLE conversations ADD COLUMN phone_number_id TEXT").run();
    } catch (e) { }

    try {
      await db.prepare("ALTER TABLE conversations ADD COLUMN customer_last_message_at DATETIME").run();
    } catch (e) { }

    try {
      await db.prepare("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'").run();
    } catch (e) { }

    try {
      await db.prepare("ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'Asia/Kolkata'").run();
    } catch (e) { }

    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN waba_id TEXT").run();
    } catch (e) { }

    // Add new columns to contacts dynamically for backwards compatibility
    const columns = [
      "phone TEXT",
      "additional_phone TEXT",
      "email TEXT",
      "gender TEXT",
      "instagram_username TEXT",
      "facebook_username TEXT",
      "whatsapp_username TEXT",
      "notes TEXT",
      "is_lead INTEGER DEFAULT 0",
      "lead_status TEXT DEFAULT 'new'",
      "lead_source TEXT DEFAULT 'manual'",
      "lead_value REAL DEFAULT 0"
    ];
    for (const col of columns) {
      try {
        await db.prepare(`ALTER TABLE contacts ADD COLUMN ${col}`).run();
      } catch (e) { }
    }

    try {
      await db.prepare(`
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
        )
      `).run();
    } catch (e) { }

    const tableSql = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='whatsapp_configs'").first<{ sql: string }>();
    if (tableSql && tableSql.sql && (tableSql.sql.includes('UNIQUE') || tableSql.sql.includes('unique'))) {
      console.log("Recreating whatsapp_configs table to support multiple manual WABAs...");
      try {
        await db.prepare("ALTER TABLE whatsapp_configs RENAME TO whatsapp_configs_old").run();
        await db.prepare(`
          CREATE TABLE whatsapp_configs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            phone_number_id TEXT NOT NULL,
            waba_id TEXT,
            access_token TEXT NOT NULL,
            verify_token TEXT,
            reply_mode TEXT DEFAULT 'manual',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
          )
        `).run();
        await db.prepare(`
          INSERT OR IGNORE INTO whatsapp_configs (id, workspace_id, phone_number_id, waba_id, access_token, verify_token, reply_mode, created_at)
          SELECT id, workspace_id, phone_number_id, NULL, access_token, verify_token, COALESCE(reply_mode, 'manual'), created_at FROM whatsapp_configs_old
        `).run();
        await db.prepare("DROP TABLE whatsapp_configs_old").run();
        console.log("whatsapp_configs table recreated successfully!");
      } catch (err) {
        console.error("Failed to migrate whatsapp_configs:", err);
      }
    }

    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN calling_enabled INTEGER DEFAULT 1").run();
    } catch (e) { }

    // SIP columns removed — using Cloudflare Realtime TURN instead

    try {
      await db.prepare(`
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
        )
      `).run();
    } catch (e) { }

    // Add new columns to existing calls table
    const callColumns = [
      "phone_number_id TEXT",
      "caller_number TEXT",
      "recording_url TEXT",
      "hangup_cause TEXT"
    ];
    for (const col of callColumns) {
      try {
        await db.prepare(`ALTER TABLE calls ADD COLUMN ${col}`).run();
      } catch (e) { }
    }
  } catch (e) {
    console.error("Migration check error:", e);
  }
}

