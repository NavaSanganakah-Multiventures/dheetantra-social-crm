-- Performance: Index on whatsapp_configs.phone_number_id for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_phone ON whatsapp_configs(phone_number_id);

-- Performance: Index on calls for missed call dedup and workspace queries
CREATE INDEX IF NOT EXISTS idx_calls_caller_workspace ON calls(caller_number, workspace_id);
CREATE INDEX IF NOT EXISTS idx_calls_workspace_created ON calls(workspace_id, created_at);

-- Performance: Index on contacts for faster duplicate checks during import
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_platform ON contacts(workspace_id, platform, platform_contact_id);

-- Performance: Index on messages for conversation ordering
CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(platform_message_id);
