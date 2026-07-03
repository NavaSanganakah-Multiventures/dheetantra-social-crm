import fs from 'fs';

let content = fs.readFileSync('src/index.ts', 'utf-8');

// 1. Add FCM registration endpoint
const fcmEndpoint = `
// ==========================================
// FCM NOTIFICATIONS
// ==========================================

app.post('/api/fcm/register', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  let userId = '';
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(\`SESSION:\${sessionId}\`);
    if (userDataStr) {
      const user = JSON.parse(userDataStr);
      userId = user.id;
    }
  }

  if (!userId) return c.json({ error: 'User not found' }, 401);

  const { token, device_type } = await c.req.json();
  if (!token) return c.json({ error: 'Token is required' }, 400);

  if (c.env.DB) {
    try {
      await c.env.DB.prepare(
        'INSERT INTO fcm_tokens (id, user_id, token, device_type) VALUES (?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, device_type = excluded.device_type'
      ).bind(crypto.randomUUID(), userId, token, device_type || 'web').run();
      return c.json({ success: true, message: 'FCM token registered' });
    } catch (e: any) {
      console.error('Failed to register FCM token', e);
      return c.json({ error: 'Failed to register token' }, 500);
    }
  }
  return c.json({ error: 'DB not configured' }, 500);
});

`;

content = content.replace(
  "// 1. Authentication (Multi-tenant)",
  fcmEndpoint + "// 1. Authentication (Multi-tenant)"
);

// 2. Add notification triggering in webhook
const notifyLogic = `
            // Send FCM and Email Notifications
            c.executionCtx.waitUntil(
              (async () => {
                try {
                  const config = await c.env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
                  if (config && config.workspace_id) {
                    // Get all members of the workspace
                    const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(config.workspace_id).all<{ user_id: string }>();
                    if (members.results && members.results.length > 0) {
                      const userIds = members.results.map(m => m.user_id);
                      
                      // Fetch FCM tokens
                      const placeholders = userIds.map(() => '?').join(',');
                      const tokens = await c.env.DB.prepare(\`SELECT token FROM fcm_tokens WHERE user_id IN (\${placeholders})\`).bind(...userIds).all<{ token: string }>();
                      
                      const { sendPushNotification } = await import('../lib/fcm');
                      const title = \`New message from \${contact.profile.name}\`;
                      const bodyPreview = messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText;
                      
                      if (tokens.results) {
                        for (const row of tokens.results) {
                          await sendPushNotification(c.env, row.token, title, bodyPreview, { workspaceId: config.workspace_id, contactName: contact.profile.name });
                        }
                      }

                      // Fetch emails
                      const emails = await c.env.DB.prepare(\`SELECT email FROM users WHERE id IN (\${placeholders})\`).bind(...userIds).all<{ email: string }>();
                      if (emails.results && c.env.EMAIL_SENDER && typeof c.env.EMAIL_SENDER.send === 'function') {
                        const { EmailMessage } = await import('cloudflare:email');
                        for (const row of emails.results) {
                          const rawEmail = \`From: Notifications <notifications@dhitantra.com>\\r\\nTo: \${row.email}\\r\\nSubject: [Dhitantra] \${title}\\r\\n\\r\\nYou have a new message:\\n\\n\${bodyPreview}\\n\\nReply in the CRM dashboard.\`;
                          await c.env.EMAIL_SENDER.send(new EmailMessage("notifications@dhitantra.com", row.email, rawEmail));
                        }
                      }
                    }
                  }
                } catch(e) {
                  console.error('Failed to send notifications', e);
                }
              })()
            );
`;

content = content.replace(
  "// Trigger Chatbot Logic for both Cloud API & WhatsApp Business App",
  notifyLogic + "\n            // Trigger Chatbot Logic for both Cloud API & WhatsApp Business App"
);

fs.writeFileSync('src/index.ts', content);
console.log('src/index.ts updated');
