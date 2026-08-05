-- ==========================================
-- Missing indexes for hot query paths
-- (webhook lookups, inbox lists, call history, pagination ORDER BYs)
-- ==========================================

-- Contacts lookup by platform id (webhook handler dedup path)
CREATE INDEX IF NOT EXISTS idx_contacts_platform_contact ON contacts(workspace_id, platform, platform_contact_id);

-- Contacts list pagination (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_created ON contacts(workspace_id, created_at);

-- Messages dedup by platform_message_id (status webhooks)
CREATE INDEX IF NOT EXISTS idx_messages_platform_msg ON messages(platform_message_id);

-- Call dedup / status lookups
CREATE INDEX IF NOT EXISTS idx_calls_caller_status ON calls(caller_number, workspace_id, status, created_at);

-- Calls list pagination
CREATE INDEX IF NOT EXISTS idx_calls_workspace_created ON calls(workspace_id, created_at);

-- Inbox conversation lists (platform + updated_at ordering)
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_updated ON conversations(workspace_id, updated_at);

-- Inbox last-message subquery
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);

-- Misc list endpoints
CREATE INDEX IF NOT EXISTS idx_api_domains_workspace_created ON api_domains(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_domain_emails_domain_default ON domain_emails(domain_id, is_default, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_workspace_created ON whatsapp_templates(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_workspace_created ON whatsapp_flows(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_templates_workspace_created ON email_templates(workspace_id, created_at);
