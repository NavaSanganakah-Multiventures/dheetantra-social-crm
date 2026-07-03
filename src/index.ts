import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env } from './types';
import { handleIncomingMessage } from './services/chatbot';
import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';
import metaOauth from './routes/meta-oauth';
import { schemaSql, dropSql } from './schema';

export class ChatDurableObject extends DurableObject {
  constructor(state: any, env: Env) {
    super(state, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // If it's a POST to /broadcast, broadcast the JSON body to all connected WebSockets
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      try {
        const data = await request.json();
        const sockets = this.ctx.getWebSockets();
        for (const socket of sockets) {
          try {
            socket.send(JSON.stringify(data));
          } catch (e) {
            // Ignore closed or dead sockets
          }
        }
        return new Response('OK');
      } catch (err: any) {
        return new Response(err.message, { status: 500 });
      }
    }

    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept the server end of the WebSocket
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Chat Durable Object Endpoint', { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    try {
      const data = JSON.parse(text);
      const { event, payload } = data;

      // Handle WhatsApp Calling Bridge (Placeholder for Meta Cloud API WebRTC Beta)
      if (event === 'offer' && payload.target) {
        console.log(`[Calling] Initiating call to WhatsApp target: ${payload.target}`);
        // Bridge with Meta Cloud API Voice (SIP or WebRTC Beta)
      }

      // Relay the event and payload to other clients in the room
      const sockets = this.ctx.getWebSockets();
      for (const socket of sockets) {
        if (socket !== ws) {
          try {
            socket.send(JSON.stringify({ event, payload }));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error("Error parsing/relaying WebSocket message:", e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("WebSocket error:", error);
  }
}

export class AutomationWorkflow extends WorkflowEntrypoint<Env, any> {
  async run(event: any, step: any) {
    console.log("Running workflow", event);
  }
}

// ==========================================
// DHITANTRA - MAIN WORKER ENTRY POINT
// Uses "Workers with Assets" Architecture
// ==========================================

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for custom SDKs and mobile apps
app.use('/api/*', cors());

// Auto-migrate tables for Multiple WABAs
async function ensureMultipleWabaSchema(db: any) {
  try {
    try {
      await db.prepare("ALTER TABLE conversations ADD COLUMN phone_number_id TEXT").run();
    } catch(e) {}

    try {
      await db.prepare("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'").run();
    } catch(e) {}

    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN waba_id TEXT").run();
    } catch(e) {}

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
      } catch (e) {}
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
    } catch(e) {}

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
    } catch(e) {}

    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_uri TEXT").run();
    } catch(e) {}
    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_ws_server TEXT").run();
    } catch(e) {}
    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_username TEXT").run();
    } catch(e) {}
    try {
      await db.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_password TEXT").run();
    } catch(e) {}

    try {
      await db.prepare(`
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
        )
      `).run();
    } catch(e) {}
  } catch(e) {
    console.error("Migration check error:", e);
  }
}

app.use('/api/whatsapp/*', async (c, next) => {
  if (c.env.DB) {
    await ensureMultipleWabaSchema(c.env.DB);
  }
  await next();
});

app.use('/api/inbox/*', async (c, next) => {
  if (c.env.DB) {
    await ensureMultipleWabaSchema(c.env.DB);
  }
  await next();
});

app.route('/api/meta', metaOauth);

// Health Check
app.get('/api/health', (c) => {
  return c.json({ status: 'active', environment: c.env.ENVIRONMENT || 'preview' });
});

// Meta Public Config
app.get('/api/config/meta', async (c) => {
  const appId = await c.env.SECRETS_KV.get('FB_APP_ID');
  const configId = await c.env.SECRETS_KV.get('FB_CONFIG_ID');
  return c.json({
    appId: appId || '',
    configId: configId || ''
  });
});

// ==========================================
// AUTHENTICATION ROUTES (B2C & CRM STAFF)
// ==========================================

app.get('/api/auth/me', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return c.json({ user: null }, 401);

  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) {
      return c.json({ user: JSON.parse(userDataStr) });
    }
  } else {
    // Mock user for local development if KV is missing
    return c.json({ user: { email: 'dev@dhitantra.local', id: 'mock-user-123' } });
  }

  return c.json({ user: null }, 401);
});

app.post('/api/auth/send-otp', async (c) => {
  const { email, type = 'login', name } = await c.req.json();
  if (!email) return c.json({ error: 'Email is required' }, 400);

  // Check Database for user registration state
  if (c.env.DB) {
    try {
      const existingUser: any = await c.env.DB.prepare('SELECT id, is_registered, name FROM users WHERE email = ?').bind(email).first();
      const isRegistered = existingUser ? existingUser.is_registered === 1 : false;

      if (type === 'login' && !isRegistered) {
        return c.json({ error: 'अमान्य क्रेडेंशियल' }, 401);
      }
      if (type === 'register' && isRegistered) {
        return c.json({ error: 'यह ईमेल पहले से पंजीकृत है।' }, 400);
      }

      // If registering and user doesn't exist, create user with is_registered = 0
      if (type === 'register') {
        if (!existingUser) {
          const userId = crypto.randomUUID();
          await c.env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, 0)')
            .bind(userId, email, name || 'User').run();
        } else {
          await c.env.DB.prepare('UPDATE users SET name = ? WHERE email = ?')
            .bind(name || existingUser.name || 'User', email).run();
        }
      }
    } catch (err) {
      console.error("DB check failed:", err);
    }
  }

  if (c.env.SECRETS_KV) {
    const cooldownKey = `OTP_COOLDOWN:${email}`;
    const inCooldown = await c.env.SECRETS_KV.get(cooldownKey);
    if (inCooldown) {
      return c.json({ error: 'कृपया एक और OTP का अनुरोध करने से पहले 60 सेकंड प्रतीक्षा करें।' }, 429);
    }
    await c.env.SECRETS_KV.put(cooldownKey, '1', { expirationTtl: 60 });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save OTP in Database
  if (c.env.DB) {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      await c.env.DB.prepare('DELETE FROM otps WHERE email = ?').bind(email).run();
      const id = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO otps (id, email, otp_code, expires_at) VALUES (?, ?, ?, ?)')
        .bind(id, email, otp, expiresAt).run();
    } catch (err) {
      console.error("DB OTP insert failed:", err);
    }
  }

  if (c.env.SECRETS_KV) {
    // Store type and name with the OTP for verification
    const payload = JSON.stringify({ otp, type, name });
    await c.env.SECRETS_KV.put(`OTP:${email}`, payload, { expirationTtl: 600 });
  }

  if (c.env.EMAIL_SENDER && typeof c.env.EMAIL_SENDER.send === 'function') {
    // Cloudflare Email Routing / Services logic
    try {
      const senderEmail = "dheetantra@navasanganakah.com";
      const senderName = "DheeTantra";
      const rawEmail = `From: ${senderName} <${senderEmail}>\r\nTo: ${email}\r\nSubject: Dhitantra - ${type === 'register' ? 'Registration' : 'Login'} OTP\r\n\r\nYour code is: ${otp}`;
      
      const message = new EmailMessage(senderEmail, email, rawEmail);
      await c.env.EMAIL_SENDER.send(message);
      
      console.log(`Email sent to ${email}`);
    } catch (err) {
      console.error("Failed to send email via Cloudflare:", err);
    }
  } else {
    // Fallback for local development
    console.log(`\n\n=== 🔐 OTP FOR ${email} (${type}) ===\n${otp}\n========================\n\n`);
  }
  
  return c.json({ success: true, message: 'OTP Sent' });
});

app.post('/api/auth/verify-otp', async (c) => {
  const { email, otp } = await c.req.json();
  if (!email || !otp) return c.json({ error: 'Missing fields' }, 400);

  let isVerified = false;

  // 1. Verify OTP in D1 Database
  if (c.env.DB) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const dbOtp: any = await c.env.DB.prepare('SELECT * FROM otps WHERE email = ? AND otp_code = ? AND expires_at > ?')
        .bind(email, otp, now).first();
      
      if (dbOtp) {
        isVerified = true;
        // Delete the verified OTP
        await c.env.DB.prepare('DELETE FROM otps WHERE email = ?').bind(email).run();
      }
    } catch (err) {
      console.error("DB OTP verification failed:", err);
    }
  }

  // 2. Fallback to SECRETS_KV
  if (!isVerified && c.env.SECRETS_KV) {
    const storedPayload = await c.env.SECRETS_KV.get(`OTP:${email}`);
    if (storedPayload) {
      try {
        const otpData = JSON.parse(storedPayload);
        if (otpData.otp === otp) {
          isVerified = true;
          await c.env.SECRETS_KV.delete(`OTP:${email}`);
        }
      } catch (e) {
        if (storedPayload === otp) {
          isVerified = true;
          await c.env.SECRETS_KV.delete(`OTP:${email}`);
        }
      }
    }
  }

  // 3. Bypass OTP for local/testing
  if (!isVerified && otp === '123456') {
    isVerified = true;
  }

  if (!isVerified) {
    return c.json({ error: 'अमान्य क्रेडेंशियल' }, 401);
  }

  let user = { id: crypto.randomUUID(), email, name: '' };
  let defaultWorkspaceId = crypto.randomUUID();

  if (c.env.DB) {
    try {
      const existingUser: any = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      
      if (existingUser) {
        user.id = existingUser.id;
        user.name = existingUser.name || 'User';

        // If the user was registered with is_registered = 0, complete registration
        if (existingUser.is_registered === 0) {
          await c.env.DB.prepare('UPDATE users SET is_registered = 1 WHERE id = ?').bind(user.id).run();
        }

        // Check or create workspace
        const workspace: any = await c.env.DB.prepare('SELECT workspace_id FROM workspace_members WHERE user_id = ?').bind(user.id).first();
        if (workspace) {
          defaultWorkspaceId = workspace.workspace_id;
        } else {
          await c.env.DB.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
            .bind(defaultWorkspaceId, `${user.name || 'My'} Workspace`).run();
          await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
            .bind(defaultWorkspaceId, user.id, 'owner').run();
        }
      } else {
        // Fallback user creation if not exists in DB yet (e.g. bypass or DB schema updated)
        const userId = crypto.randomUUID();
        await c.env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, 1)')
          .bind(userId, email, 'User').run();
        user.id = userId;
        user.name = 'User';

        await c.env.DB.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
          .bind(defaultWorkspaceId, `My Workspace`).run();
        await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
          .bind(defaultWorkspaceId, userId, 'owner').run();
      }
    } catch (err) {
      console.error("DB operations failed during OTP verification:", err);
    }
  }

  const sessionId = crypto.randomUUID();
  if (c.env.SECRETS_KV) {
    await c.env.SECRETS_KV.put(`SESSION:${sessionId}`, JSON.stringify(user), { expirationTtl: 604800 });
  }

  setCookie(c, 'auth_session', sessionId, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Lax',
    maxAge: 604800,
    path: '/',
  });

  return c.json({ success: true, user, workspaceId: defaultWorkspaceId });
});

app.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (sessionId && c.env.SECRETS_KV) {
    await c.env.SECRETS_KV.delete(`SESSION:${sessionId}`);
  }
  deleteCookie(c, 'auth_session', { path: '/' });
  return c.json({ success: true });
});

// ==========================================
// WHATSAPP CLOUD API INTEGRATION
// ==========================================

// Webhook Verification (WhatsApp uses GET request for verification)
app.get('/api/whatsapp/webhook', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (mode === 'subscribe' && token === await c.env.SECRETS_KV.get('WHATSAPP_VERIFY_TOKEN')) {
    console.log('WhatsApp Webhook Verified!');
    return new Response(challenge, { status: 200 });
  } else {
    return c.json({ error: 'Forbidden', message: 'Verification failed' }, 403);
  }
});

// Webhook Receiver (WhatsApp sends incoming messages via POST)
app.post('/api/whatsapp/webhook', async (c) => {
  try {
    const body = await c.req.json();

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'calls' && change.value && change.value.calls) {
            const callEvent = change.value.calls[0];
            const phoneNumberId = change.value.metadata?.phone_number_id;

            if (callEvent.event === 'connect' || callEvent.event === 'ringing' || callEvent.event === 'offer') {
              console.log(`Incoming call from ${callEvent.from} (Call ID: ${callEvent.id})`);

              // Save call to database
              const callId = callEvent.id;
              // We need to find workspace for this phone number
              const config = await c.env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
              
              if (config) {
                // Ensure contact exists or create dummy
                const contactId = `contact-${callEvent.from}`;
                await c.env.DB.prepare('INSERT OR IGNORE INTO contacts (id, workspace_id, name, platform_contact_id) VALUES (?, ?, ?, ?)')
                  .bind(contactId, config.workspace_id, `+${callEvent.from}`, callEvent.from).run();

                await c.env.DB.prepare(`
                  INSERT OR IGNORE INTO calls (id, workspace_id, contact_id, type, direction, status, duration)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(callId, config.workspace_id, contactId, 'voice', 'incoming', 'ringing', 0).run();

                // Broadcast to frontend to ring!
                try {
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'whatsapp_incoming_call',
                      callId: callId,
                      from: callEvent.from,
                      sdp: callEvent.session?.sdp,
                      phoneNumberId: phoneNumberId
                    })
                  }));
                } catch (e) {
                  console.error('Failed to broadcast incoming call:', e);
                }
              }
            } else if (callEvent.event === 'terminate') {
               console.log(`Call terminated: ${callEvent.id}`);
               const config = await c.env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
               if (config) {
                 await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ?').bind('ended', callEvent.id).run();
                 try {
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'whatsapp_call_terminated',
                      callId: callEvent.id
                    })
                  }));
                 } catch(e) {}
               }
            }
            continue;
          }

          if (change.value && change.value.messages) {
            const message = change.value.messages[0];
            const contact = change.value.contacts[0];
            const phoneNumberId = change.value.metadata.phone_number_id;
            
            let messageText = '';
            let messageType = 'text';
            let mediaUrl: string | null = null;
            
            if (message.text) {
              messageText = message.text.body;
              messageType = 'text';
            } else if (message.image) {
              messageText = message.image.caption || 'Image Message';
              messageType = 'image';
              mediaUrl = message.image.id;
            } else if (message.video) {
              messageText = message.video.caption || 'Video Message';
              messageType = 'video';
              mediaUrl = message.video.id;
            } else if (message.document) {
              messageText = message.document.caption || message.document.filename || 'Document Message';
              messageType = 'document';
              mediaUrl = message.document.id;
            } else if (message.location) {
              messageText = message.location.name 
                ? `${message.location.name} (${message.location.address || ''})` 
                : `Location: ${message.location.latitude}, ${message.location.longitude}`;
              messageType = 'location';
              mediaUrl = JSON.stringify({
                latitude: message.location.latitude,
                longitude: message.location.longitude,
                name: message.location.name,
                address: message.location.address
              });
            } else if (message.contacts) {
              const contactName = message.contacts[0]?.name?.formatted_name || 'Contact';
              const contactPhone = message.contacts[0]?.phones?.[0]?.phone || '';
              messageText = `Contact: ${contactName} (${contactPhone})`;
              messageType = 'contacts';
              mediaUrl = JSON.stringify(message.contacts);
            } else if (message.type === 'system' && message.system && message.system.type === 'user_initiated_call') {
              messageText = 'इनकमिंग कॉल (Incoming Voice Call)';
              messageType = 'system_call';
            } else {
              messageText = `Unsupported message type: ${message.type}`;
              messageType = message.type || 'unknown';
            }

            console.log(`New ${messageType} message from ${contact.profile.name} (${message.from}):`, messageText);
            
            // Download media to R2 if needed
            let finalMediaUrl = mediaUrl;
            if (['image', 'video', 'document'].includes(messageType) && mediaUrl) {
               try {
                  const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first();
                  if (config && config.access_token) {
                     const res = await fetch(`https://graph.facebook.com/v19.0/${mediaUrl}`, {
                        headers: { 'Authorization': `Bearer ${config.access_token}` }
                     });
                     const data = await res.json();
                     if (data.url) {
                        const binaryRes = await fetch(data.url, {
                           headers: { 'Authorization': `Bearer ${config.access_token}` }
                        });
                        const arrayBuffer = await binaryRes.arrayBuffer();
                        let extension = 'bin';
                        if (messageType === 'image') extension = 'jpg';
                        if (messageType === 'video') extension = 'mp4';
                        if (messageType === 'document') extension = 'pdf';
                        const key = `${crypto.randomUUID()}.${extension}`;
                        await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
                           httpMetadata: { contentType: binaryRes.headers.get('Content-Type') || 'application/octet-stream' }
                        });
                        finalMediaUrl = `/api/public/media/${key}`;
                     }
                  }
               } catch(e) {
                  console.error("Failed to download media to R2", e);
                  finalMediaUrl = `https://graph.facebook.com/v19.0/${mediaUrl}`;
               }
            }

            // Trigger Chatbot Logic for both Cloud API & WhatsApp Business App
            c.executionCtx.waitUntil(
              handleIncomingMessage(
                c.env, 
                phoneNumberId, 
                message.from, 
                messageText, 
                contact.profile.name,
                message.id,
                messageType,
                finalMediaUrl
              )
            );
          } else if (change.value && change.value.statuses) {
            const statusObj = change.value.statuses[0];
            const platformMsgId = statusObj.id;
            const status = statusObj.status; // 'sent', 'delivered', 'read'
            
            try {
              await c.env.DB.prepare('UPDATE messages SET status = ? WHERE platform_message_id = ?')
                .bind(status, platformMsgId).run();
            } catch (err: any) {
              console.error("Webhook status error:", err);
            }
          }
        }
      }
      return c.json({ status: 'success' });
    }

    return c.json({ error: 'Not a WhatsApp event' }, 404);
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});


// ==========================================
// B2C & B2B API ROUTES
// ==========================================

// 1. Authentication (Multi-tenant)
app.post('/api/auth/login', async (c) => {
  // Logic: Verify credentials, check D1 for tenant/subscription status
  // Generate JWT or store OTP session in SECRETS_KV
  return c.json({ token: 'jwt_or_api_key', workspace_id: 'tenant_123' });
});

// 2. CRM & Social Media Data (D1 Database)
app.get('/api/crm/contacts', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Fetch from D1 (Relational Data)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM contacts WHERE workspace_id = ? ORDER BY created_at DESC'
  ).bind(workspaceId).all();

  return c.json({ contacts: results });
});

// Create contact
app.post('/api/crm/contacts', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const body = await c.req.json();
  const {
    name,
    phone,
    additional_phone,
    email,
    gender,
    instagram_username,
    facebook_username,
    whatsapp_username,
    notes,
    is_lead,
    lead_status,
    lead_source,
    lead_value
  } = body;

  if (!name) return c.json({ error: 'नाम आवश्यक है (Name is required)' }, 400);
  if (!phone) return c.json({ error: 'फ़ोन नंबर आवश्यक है (Phone is required)' }, 400);

  const platformContactId = phone.replace(/[^0-9]/g, '');

  // Check if contact already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE workspace_id = ? AND platform = "whatsapp" AND platform_contact_id = ?'
  ).bind(workspaceId, platformContactId).first();

  if (existing) {
    return c.json({ error: 'इस फ़ोन नंबर वाला संपर्क पहले से मौजूद है।' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO contacts (
      id, workspace_id, platform, platform_contact_id, name, phone,
      additional_phone, email, gender, instagram_username, facebook_username,
      whatsapp_username, notes, is_lead, lead_status, lead_source, lead_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    workspaceId,
    'whatsapp',
    platformContactId,
    name,
    phone,
    additional_phone || null,
    email || null,
    gender || null,
    instagram_username || null,
    facebook_username || null,
    whatsapp_username || null,
    notes || null,
    is_lead ? 1 : 0,
    lead_status || 'new',
    lead_source || 'manual',
    Number(lead_value || 0)
  ).run();

  return c.json({ success: true, contact: { id, name, phone } });
});

// Update contact
app.put('/api/crm/contacts/:contactId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const contactId = c.req.param('contactId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const body = await c.req.json();
  const {
    name,
    phone,
    additional_phone,
    email,
    gender,
    instagram_username,
    facebook_username,
    whatsapp_username,
    notes,
    is_lead,
    lead_status,
    lead_source,
    lead_value
  } = body;

  if (!name) return c.json({ error: 'नाम आवश्यक है' }, 400);
  if (!phone) return c.json({ error: 'फ़ोन नंबर आवश्यक है' }, 400);

  const platformContactId = phone.replace(/[^0-9]/g, '');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND workspace_id = ?'
  ).bind(contactId, workspaceId).first();
  if (!existing) return c.json({ error: 'संपर्क नहीं मिला' }, 404);

  await c.env.DB.prepare(`
    UPDATE contacts SET
      name = ?,
      phone = ?,
      platform_contact_id = ?,
      additional_phone = ?,
      email = ?,
      gender = ?,
      instagram_username = ?,
      facebook_username = ?,
      whatsapp_username = ?,
      notes = ?,
      is_lead = ?,
      lead_status = ?,
      lead_source = ?,
      lead_value = ?
    WHERE id = ? AND workspace_id = ?
  `).bind(
    name,
    phone,
    platformContactId,
    additional_phone || null,
    email || null,
    gender || null,
    instagram_username || null,
    facebook_username || null,
    whatsapp_username || null,
    notes || null,
    is_lead ? 1 : 0,
    lead_status || 'new',
    lead_source || 'manual',
    Number(lead_value || 0),
    contactId,
    workspaceId
  ).run();

  return c.json({ success: true });
});

// Delete contact
app.delete('/api/crm/contacts/:contactId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const contactId = c.req.param('contactId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND workspace_id = ?'
  ).bind(contactId, workspaceId).first();
  if (!existing) return c.json({ error: 'संपर्क नहीं मिला' }, 404);

  // Delete conversations and messages associated with this contact
  const convs = await c.env.DB.prepare('SELECT id FROM conversations WHERE contact_id = ?').bind(contactId).all<{ id: string }>();
  if (convs.results) {
    for (const conv of convs.results) {
      await c.env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(conv.id).run();
      await c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(conv.id).run();
    }
  }

  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?')
    .bind(contactId, workspaceId).run();

  return c.json({ success: true });
});

// Initiate conversation from contact list
app.post('/api/inbox/conversations/initiate', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { contactId, phone_number_id } = await c.req.json();
  if (!contactId) return c.json({ error: 'Contact ID required' }, 400);

  const contact = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?')
    .bind(contactId, workspaceId).first<{ platform_contact_id: string }>();
  if (!contact) return c.json({ error: 'संपर्क नहीं मिला' }, 404);

  let finalPhoneNumberId = phone_number_id;
  if (!finalPhoneNumberId) {
    const config = await c.env.DB.prepare('SELECT phone_number_id FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(workspaceId).first<{ phone_number_id: string }>();
    if (config) {
      finalPhoneNumberId = config.phone_number_id;
    }
  }

  let conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND (phone_number_id = ? OR phone_number_id IS NULL)')
    .bind(workspaceId, contactId, finalPhoneNumberId || '').first<{ id: string }>();

  if (!conv) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, workspaceId, contactId, 'whatsapp', 'open', finalPhoneNumberId || null).run();
    
    const newConv = await c.env.DB.prepare(`
      SELECT c.*, t.name as contact_name, t.platform_contact_id as phone
      FROM conversations c
      JOIN contacts t ON c.contact_id = t.id
      WHERE c.id = ?
    `).bind(id).first();

    return c.json({ success: true, conversation: newConv });
  }

  const existingConv = await c.env.DB.prepare(`
    SELECT c.*, t.name as contact_name, t.platform_contact_id as phone
    FROM conversations c
    JOIN contacts t ON c.contact_id = t.id
    WHERE c.id = ?
  `).bind(conv.id).first();

  return c.json({ success: true, conversation: existingConv });
});

// 3. Real-Time Chat (Durable Objects + SQLite)
app.get('/api/chat/connect/:roomId', (c) => {
  const roomId = c.req.param('roomId');
  // Route WebSocket upgrade request to the Durable Object
  const id = c.env.CHAT_DO.idFromName(roomId);
  const stub = c.env.CHAT_DO.get(id);
  return stub.fetch(c.req.raw);
});

// 4. Media Upload (R2 Storage)
app.post('/api/media/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || typeof file === 'string') {
       return c.json({ error: 'No file uploaded' }, 400);
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const extension = file.name ? file.name.split('.').pop() : 'bin';
    const key = `${crypto.randomUUID()}.${extension}`;
    await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });
    
    const origin = new URL(c.req.url).origin;
    const r2Url = `${origin}/api/public/media/${key}`;
    return c.json({ success: true, url: r2Url, mediaUrl: r2Url, r2Url: r2Url });
  } catch(e: any) {
    console.error("R2 upload error", e);
    return c.json({ error: 'Internal Server Error', details: e.message }, 500);
  }
});

// 5. Trigger Background Workflow (FCM Notifications / Scheduling)
app.post('/api/campaigns/schedule', async (c) => {
  const { campaignId, scheduledTime } = await c.req.json();
  // Dispatch to Cloudflare Workflows or Queues for async processing
  // await c.env.AUTOMATION_WORKFLOW.create({ id: campaignId, params: { scheduledTime } });
  return c.json({ success: true, status: 'scheduled' });
});

// ==========================================
// 6. B2B EMAIL & CUSTOM DOMAINS
// ==========================================

// Add Custom Domain
app.post('/api/domains', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domainName, defaultEmailPrefix = 'info' } = await c.req.json();
  const domainId = crypto.randomUUID();
  const emailId = crypto.randomUUID();
  const emailAddress = `${defaultEmailPrefix}@${domainName}`;

  // In production, we would call Cloudflare API to add domain to zone and setup Email Routing
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO domains (id, workspace_id, domain_name) VALUES (?, ?, ?)'
    ).bind(domainId, workspaceId, domainName),
    c.env.DB.prepare(
      'INSERT INTO domain_emails (id, domain_id, email_address, forward_to) VALUES (?, ?, ?, ?)'
    ).bind(emailId, domainId, emailAddress, 'admin@dhitantra.com') // forward_to should be configured by user
  ]);

  return c.json({ 
    success: true, 
    domain_id: domainId, 
    domain_name: domainName, 
    email_address: emailAddress,
    status: 'pending_verification' 
  });
});

// Create/Update Email Template
app.post('/api/email-templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { templateType, subject, bodyHtml } = await c.req.json();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO email_templates (id, workspace_id, template_type, subject, body_html) 
     VALUES (?, ?, ?, ?, ?) 
     ON CONFLICT(workspace_id, template_type) 
     DO UPDATE SET subject = excluded.subject, body_html = excluded.body_html, updated_at = CURRENT_TIMESTAMP`
  ).bind(id, workspaceId, templateType, subject, bodyHtml).run();

  return c.json({ success: true, template_type: templateType });
});

// Fetch Email Templates
app.get('/api/email-templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM email_templates WHERE workspace_id = ?'
  ).bind(workspaceId).all();

  return c.json({ templates: results });
});

// Fetch Domain Emails
app.get('/api/domain-emails/:domainId', async (c) => {
  const domainId = c.req.param('domainId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM domain_emails WHERE domain_id = ?'
  ).bind(domainId).all();
  return c.json({ emails: results });
});

// ==========================================
// 7. WHATSAPP API INTEGRATION
// ==========================================

// Save WhatsApp Config
app.post('/api/whatsapp/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { 
    id, phone_number_id, waba_id, access_token, verify_token, reply_mode,
    sip_uri, sip_ws_server, sip_username, sip_password 
  } = await c.req.json();
  const newId = id || crypto.randomUUID();

  try {
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN reply_mode TEXT DEFAULT 'manual'").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN waba_id TEXT").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_uri TEXT").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_ws_server TEXT").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_username TEXT").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN sip_password TEXT").run();
    } catch(e) {}

    let existing: any = null;
    if (id) {
      existing = await c.env.DB.prepare('SELECT id, access_token, reply_mode FROM whatsapp_configs WHERE id = ?').bind(id).first();
    } else {
      existing = await c.env.DB.prepare('SELECT id, access_token, reply_mode FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phone_number_id).first();
    }

    const finalId = id || existing?.id || newId;
    const finalToken = access_token || existing?.access_token || '';
    const finalReplyMode = reply_mode || existing?.reply_mode || 'manual';

    if (existing || id) {
      await c.env.DB.prepare(
        `UPDATE whatsapp_configs SET 
          phone_number_id = ?, waba_id = ?, access_token = ?, verify_token = ?, reply_mode = ?,
          sip_uri = ?, sip_ws_server = ?, sip_username = ?, sip_password = ?
        WHERE id = ?`
      ).bind(
        phone_number_id, waba_id || null, finalToken, verify_token, finalReplyMode,
        sip_uri || null, sip_ws_server || null, sip_username || null, sip_password || null,
        finalId
      ).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO whatsapp_configs (
          id, workspace_id, phone_number_id, waba_id, access_token, verify_token, reply_mode,
          sip_uri, sip_ws_server, sip_username, sip_password
        ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        finalId, workspaceId, phone_number_id, waba_id || null, finalToken, verify_token, finalReplyMode,
        sip_uri || null, sip_ws_server || null, sip_username || null, sip_password || null
      ).run();
    }
    return c.json({ success: true, message: 'WhatsApp config saved', id: finalId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get WhatsApp Config
app.get('/api/whatsapp/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN reply_mode TEXT DEFAULT 'manual'").run();
    } catch(e) {}
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN waba_id TEXT").run();
    } catch(e) {}
    
    const { results } = await c.env.DB.prepare('SELECT id, phone_number_id, waba_id, verify_token, reply_mode, sip_uri, sip_ws_server, sip_username, sip_password, created_at FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).all();
    const config = results && results.length > 0 ? results[0] : null;
    return c.json({ config: config || null, configs: results || [] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete WhatsApp Config
app.delete('/api/whatsapp/config/:id', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('DELETE FROM whatsapp_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true, message: 'WhatsApp config deleted successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// WHATSAPP TEMPLATE MANAGEMENT
// ==========================================

// Get all local and Meta templates
app.get('/api/whatsapp/templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    try {
      await c.env.DB.prepare(`
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
    } catch(e) {}

    const { results: localTemplates } = await c.env.DB.prepare(
      'SELECT * FROM whatsapp_templates WHERE workspace_id = ? ORDER BY created_at DESC'
    ).bind(workspaceId).all();

    const config = await c.env.DB.prepare(
      'SELECT waba_id, access_token FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC'
    ).bind(workspaceId).first();

    let metaTemplates: any[] = [];
    let fetchError = null;

    if (config && config.waba_id && config.access_token && config.access_token !== '••••••••••••••••') {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${config.waba_id}/message_templates`, {
          headers: { 'Authorization': `Bearer ${config.access_token}` }
        });
        const data: any = await res.json();
        if (data && data.data) {
          metaTemplates = data.data.map((t: any) => {
            const bodyComp = t.components?.find((comp: any) => comp.type === 'BODY');
            return {
              id: t.id,
              name: t.name,
              category: t.category,
              language: t.language,
              body_text: bodyComp ? bodyComp.text : '',
              status: t.status,
              is_meta: true
            };
          });
        } else if (data && data.error) {
          fetchError = data.error.message;
        }
      } catch (e: any) {
        fetchError = e.message;
      }
    }

    return c.json({ 
      success: true, 
      local: localTemplates || [], 
      meta: metaTemplates || [],
      metaError: fetchError
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create/Submit WhatsApp Template
app.post('/api/whatsapp/templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { name, category, language, body_text } = await c.req.json();
  if (!name || !body_text) return c.json({ error: 'Name and body text are required' }, 400);

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const templateId = crypto.randomUUID();

  try {
    try {
      await c.env.DB.prepare(`
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
    } catch(e) {}

    const config = await c.env.DB.prepare(
      'SELECT waba_id, access_token FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC'
    ).bind(workspaceId).first();

    let metaSuccess = false;
    let metaError = null;

    if (config && config.waba_id && config.access_token && config.access_token !== '••••••••••••••••') {
      try {
        const payload = {
          name: cleanName,
          category: category || 'UTILITY',
          language: language || 'en_US',
          components: [
            {
              type: 'BODY',
              text: body_text
            }
          ]
        };

        const res = await fetch(`https://graph.facebook.com/v19.0/${config.waba_id}/message_templates`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data: any = await res.json();
        if (data && data.id) {
          metaSuccess = true;
        } else if (data && data.error) {
          metaError = data.error.message;
        }
      } catch (e: any) {
        metaError = e.message;
      }
    }

    await c.env.DB.prepare(
      `INSERT INTO whatsapp_templates (id, workspace_id, name, category, language, body_text, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      templateId, 
      workspaceId, 
      cleanName, 
      category || 'UTILITY', 
      language || 'en_US', 
      body_text, 
      metaSuccess ? 'PENDING' : 'APPROVED'
    ).run();

    return c.json({ 
      success: true, 
      message: metaSuccess ? 'Template submitted to Meta and saved locally!' : 'Template saved locally!',
      id: templateId,
      metaSubmitted: metaSuccess,
      metaError: metaError
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete local template
app.delete('/api/whatsapp/templates/:id', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('DELETE FROM whatsapp_templates WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true, message: 'Template deleted successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Send Template Message
app.post('/api/whatsapp/templates/send', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, templateName, languageCode, parameters, phoneNumberId } = await c.req.json();
  if (!to || !templateName) return c.json({ error: 'Missing to or templateName' }, 400);

  try {
    let config: any = null;
    if (phoneNumberId) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phoneNumberId).first();
    }
    if (!config) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp is not configured for this workspace' }, 400);

    const components: any[] = [];
    if (parameters && Array.isArray(parameters) && parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map(p => ({
          type: 'text',
          text: p
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode || 'en_US'
        },
        components: components.length > 0 ? components : undefined
      }
    };

    const res = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await res.json();
    if (data.error) {
      return c.json({ error: data.error.message }, 400);
    }

    // Save to database as a sent message
    let contact = await c.env.DB.prepare('SELECT id FROM contacts WHERE workspace_id = ? AND platform_contact_id = ?').bind(workspaceId, to).first();
    let contactId = contact?.id;
    if (!contactId) {
      contactId = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, ?, ?, ?)')
        .bind(contactId, workspaceId, 'whatsapp', to, to).run();
    }

    let conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id = ?').bind(workspaceId, contactId, config.phone_number_id).first<{ id: string }>();
    if (!conv) {
      // Fallback for older conversations without phone_number_id set
      conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id IS NULL').bind(workspaceId, contactId).first<{ id: string }>();
      if (conv) {
        await c.env.DB.prepare('UPDATE conversations SET phone_number_id = ? WHERE id = ?').bind(config.phone_number_id, conv.id).run();
      }
    }
    let convId = conv?.id;
    if (!convId) {
      convId = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(convId, workspaceId, contactId, 'whatsapp', 'open', config.phone_number_id).run();
    }

    const msgId = crypto.randomUUID();
    const content = `[Template Message] ${templateName}`;
    const platformMsgId = data.messages?.[0]?.id || crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, platform_message_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(msgId, convId, 'agent', 'text', content, platformMsgId).run();

    // Broadcast template message via Durable Object
    try {
      const doId = c.env.CHAT_DO.idFromName(convId);
      const stub = c.env.CHAT_DO.get(doId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: msgId,
            conversation_id: convId,
            sender_type: 'agent',
            message_type: 'text',
            content,
            platform_message_id: platformMsgId,
            created_at: new Date().toISOString()
          }
        })
      }));
    } catch (doErr) {
      console.error("Failed to broadcast template message to DO:", doErr);
    }

    return c.json({ success: true, message: 'Template message sent successfully!', data });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// Send WhatsApp Message
app.post('/api/admin/migrate', async (c) => {
  try {
    const reset = c.req.query('reset') === 'true';
    
    // Disable foreign keys temporarily
    try { await c.env.DB.prepare('PRAGMA foreign_keys = OFF').run(); } catch(e) {}
    
    if (reset) {
      const dropStatements = dropSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of dropStatements) {
        await c.env.DB.prepare(stmt).run();
      }
    }
    
    const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await c.env.DB.prepare(stmt).run();
    }
    
    // Re-enable foreign keys
    try { await c.env.DB.prepare('PRAGMA foreign_keys = ON').run(); } catch(e) {}
    
    return c.json({ success: true, message: reset ? 'Database completely reset and migrated successfully!' : 'Database schema migrated successfully!' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/api/whatsapp/send', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, text, conversationId, type = 'text', mediaUrl, r2Url, filename, location, contacts, phoneNumberId } = await c.req.json();
  if (!to || !conversationId) return c.json({ error: 'Missing required fields' }, 400);

  try {
    let config: any = null;
    if (phoneNumberId) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phoneNumberId).first();
    }
    if (!config) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp is not configured for this workspace' }, 400);

    // Build the Meta Cloud API payload
    let payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: type
    };


    // Check if it's a relative path starting with / or an absolute URL starting with http
    const isMediaId = mediaUrl && !mediaUrl.startsWith('http') && !mediaUrl.startsWith('/');
    
    // Ensure relative R2 paths are converted to fully qualified absolute public URLs for Meta Cloud API
    let finalMediaUrl = mediaUrl;
    if (mediaUrl && mediaUrl.startsWith('/')) {
      const origin = new URL(c.req.url).origin;
      finalMediaUrl = `${origin}${mediaUrl}`;
    }
    
    const mediaObj = isMediaId ? { id: mediaUrl } : { link: finalMediaUrl };

    if (type === 'text') {
      if (!text) return c.json({ error: 'Text content is required for text messages' }, 400);
      payload.text = { preview_url: false, body: text };
    } else if (type === 'image') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for image messages' }, 400);
      payload.image = { ...mediaObj, caption: text || "" };
    } else if (type === 'video') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for video messages' }, 400);
      payload.video = { ...mediaObj, caption: text || "" };
    } else if (type === 'document') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for document messages' }, 400);
      payload.document = { ...mediaObj, filename: filename || 'Document.pdf', caption: text || "" };
    } else if (type === 'location') {
      if (!location || !location.latitude || !location.longitude) {
        return c.json({ error: 'Latitude and longitude are required for location messages' }, 400);
      }
      payload.location = {
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name || 'Location',
        address: location.address || ''
      };
    } else if (type === 'contacts') {
      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return c.json({ error: 'Contacts list is required' }, 400);
      }
      payload.contacts = contacts;
    } else {
      return c.json({ error: `Unsupported send type: ${type}` }, 400);
    }

    // Call Meta Cloud API
    const metaResponse = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const metaData: any = await metaResponse.json();
    if (metaData.error) {
      return c.json({ error: metaData.error.message }, 400);
    }

    // Ensure database columns are up-to-date
    try {
      await c.env.DB.prepare("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'").run();
    } catch(e) {}

    // Save sent message to database
    let contentToSave = text;
    if (type === 'location') {
      contentToSave = JSON.stringify(location);
    } else if (type === 'contacts') {
      contentToSave = JSON.stringify(contacts);
    } else if (type === 'document' && !text) {
      contentToSave = filename || 'Document.pdf';
    }

    const savedMessageId = crypto.randomUUID();
    const platformMsgId = metaData.messages?.[0]?.id || crypto.randomUUID();
    const mediaUrlToSave = r2Url || mediaUrl || null;

    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        savedMessageId, 
        conversationId, 
        'agent', 
        type, 
        contentToSave || null, 
        mediaUrlToSave, 
        platformMsgId
      ).run();

    // Update conversation
    await c.env.DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(conversationId).run();

    // Broadcast message via Durable Object
    try {
      const doId = c.env.CHAT_DO.idFromName(conversationId);
      const stub = c.env.CHAT_DO.get(doId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: savedMessageId,
            conversation_id: conversationId,
            sender_type: 'agent',
            message_type: type,
            content: contentToSave || null,
            media_url: mediaUrlToSave,
            platform_message_id: platformMsgId,
            created_at: new Date().toISOString()
          }
        })
      }));
    } catch (doErr) {
      console.error("Failed to broadcast message to DO:", doErr);
    }

    return c.json({ success: true, message: 'Message sent successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get Inbox Conversations
app.get('/api/inbox/conversations', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const phoneNumberId = c.req.query('phoneNumberId');
  let query = `
    SELECT c.id, c.status, c.updated_at, c.phone_number_id, ct.name as contact_name, ct.platform_contact_id as phone, ct.id as contact_id
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.workspace_id = ?
  `;
  const binds: any[] = [workspaceId];
  if (phoneNumberId && phoneNumberId !== 'all') {
    query += ` AND (c.phone_number_id = ? OR c.phone_number_id IS NULL)`;
    binds.push(phoneNumberId);
  }
  query += ` ORDER BY c.updated_at DESC`;

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();

  return c.json({ conversations: results || [] });
});

// Get Messages for a Conversation
app.get('/api/inbox/messages/:conversationId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Validate conversation belongs to workspace
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Forbidden' }, 403);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).bind(conversationId).all();

  return c.json({ messages: results });
});

// Update conversation status (open/closed)
app.post('/api/inbox/conversations/:conversationId/status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { status } = await c.req.json();
  if (status !== 'open' && status !== 'closed') {
    return c.json({ error: 'Invalid status. Must be "open" or "closed"' }, 400);
  }

  // Validate conversation belongs to workspace
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Conversation not found or forbidden' }, 404);

  await c.env.DB.prepare('UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, conversationId).run();

  // Broadcast status change via Durable Object
  try {
    const doId = c.env.CHAT_DO.idFromName(conversationId);
    const stub = c.env.CHAT_DO.get(doId);
    await stub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation_status_updated',
        conversation_id: conversationId,
        status
      })
    }));
  } catch (doErr) {
    console.error("Failed to broadcast status update to DO:", doErr);
  }

  return c.json({ success: true, status });
});

// Delete conversation
app.delete('/api/inbox/conversations/:conversationId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Validate conversation belongs to workspace
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Conversation not found or forbidden' }, 404);

  // Delete messages first to maintain database cleanliness
  await c.env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(conversationId).run();
  await c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(conversationId).run();

  // Broadcast deletion via Durable Object
  try {
    const doId = c.env.CHAT_DO.idFromName(conversationId);
    const stub = c.env.CHAT_DO.get(doId);
    await stub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation_deleted',
        conversation_id: conversationId
      })
    }));
  } catch (doErr) {
    console.error("Failed to broadcast deletion to DO:", doErr);
  }

  return c.json({ success: true, message: 'Conversation deleted successfully' });
});

// ==========================================
// CALLING FEATURES API ENDPOINTS
// ==========================================

// GET call history
app.get('/api/whatsapp/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(`
    SELECT cl.*, ct.name as contact_name, ct.platform_contact_id as phone
    FROM calls cl
    LEFT JOIN contacts ct ON cl.contact_id = ct.id
    WHERE cl.workspace_id = ?
    ORDER BY cl.created_at DESC
  `).bind(workspaceId).all();

  return c.json({ calls: results || [] });
});

// CREATE a manual or outgoing call log
app.post('/api/whatsapp/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { contactId, type, direction, status, duration } = await c.req.json();
  if (!contactId) return c.json({ error: 'Contact ID required' }, 400);

  const callId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO calls (id, workspace_id, contact_id, type, direction, status, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(callId, workspaceId, contactId, type || 'voice', direction || 'outgoing', status || 'ringing', duration || 0).run();

  const contact = await c.env.DB.prepare('SELECT name, platform_contact_id FROM contacts WHERE id = ?').bind(contactId).first<{ name: string, platform_contact_id: string }>();

  // Broadcast call event to global DO so UI updates
  const payload = {
    type: 'incoming_call',
    call: {
      id: callId,
      workspace_id: workspaceId,
      contact_id: contactId,
      contact_name: contact?.name || 'Contact',
      phone: contact?.platform_contact_id || '',
      type: type || 'voice',
      direction: direction || 'outgoing',
      status: status || 'ringing',
      created_at: new Date().toISOString()
    }
  };

  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const globalStub = c.env.CHAT_DO.get(globalDoId);
    await globalStub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  } catch (e) {}

  return c.json({ success: true, callId });
});

// UPDATE call status (answered, ended, duration, etc.)
app.post('/api/whatsapp/calls/:id/status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { status, duration } = await c.req.json();

  await c.env.DB.prepare('UPDATE calls SET status = ?, duration = COALESCE(?, duration) WHERE id = ? AND workspace_id = ?')
    .bind(status, duration, callId, workspaceId).run();

  // Broadcast update via global DO
  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const globalStub = c.env.CHAT_DO.get(globalDoId);
    await globalStub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'call_status_updated',
        call_id: callId,
        status,
        duration
      })
    }));
  } catch (e) {}

  return c.json({ success: true });
});

// ANSWER a WhatsApp WebRTC call
app.post('/api/whatsapp/calls/:id/answer', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { sdp, phoneNumberId, from } = await c.req.json();
  const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first<{ access_token: string }>();
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;
  
  // pre_accept
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: from,
      action: 'pre_accept',
      call_id: callId,
      session: { sdp: sdp, sdp_type: 'answer' }
    })
  });

  // accept
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: from,
      action: 'accept',
      call_id: callId,
      session: { sdp: sdp, sdp_type: 'answer' }
    })
  });

  const data = await res.json();
  
  await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ? AND workspace_id = ?')
    .bind('in_progress', callId, workspaceId).run();

  return c.json({ success: true, data });
});

// TERMINATE a WhatsApp WebRTC call
app.post('/api/whatsapp/calls/:id/terminate', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phoneNumberId } = await c.req.json();
  const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first<{ access_token: string }>();
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      action: 'terminate', // or reject depending on state, but terminate works for active calls
      call_id: callId
    })
  });

  const data = await res.json();

  await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ? AND workspace_id = ?')
    .bind('ended', callId, workspaceId).run();

  return c.json({ success: true, data });
});

// UPLOAD call recording
app.post('/api/whatsapp/calls/recordings', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No audio file provided' }, 400);
    }

    const fileName = `${workspaceId}/recordings/${Date.now()}-${file.name}`;
    
    await c.env.MEDIA_BUCKET.put(fileName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type }
    });

    return c.json({ success: true, path: fileName });
  } catch (err) {
    return c.json({ error: 'Failed to upload recording' }, 500);
  }
});

// TOGGLE calling configuration
app.post('/api/whatsapp/calls/toggle', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { calling_enabled } = await c.req.json();
  const enabledValue = calling_enabled ? 1 : 0;

  await c.env.DB.prepare('UPDATE whatsapp_configs SET calling_enabled = ? WHERE workspace_id = ?')
    .bind(enabledValue, workspaceId).run();

  return c.json({ success: true, calling_enabled: enabledValue === 1 });
});

// GET calling configuration
app.get('/api/whatsapp/calls/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const config = await c.env.DB.prepare('SELECT calling_enabled FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first<{ calling_enabled: number }>();

  return c.json({ calling_enabled: config ? config.calling_enabled === 1 : true });
});

// Broadcast Campaign
app.post('/api/broadcast', async (c) => {
  const { workspaceId, campaignName, textBody, contactIds } = await c.req.json();
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // In a real scenario, this would use Cloudflare Queues to send messages in bulk
  // For now, we return a success status
  return c.json({ success: true, message: 'Broadcast queued successfully' });
});

// ==========================================
// 8. PLANS & PRICING
// ==========================================

// Fetch public plans
app.get('/api/plans', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM plans ORDER BY upfront_price ASC').all();
    
    // If no plans exist yet, seed some defaults
    if (results.length === 0) {
      const defaultPlans = [
        {
          id: crypto.randomUUID(),
          name: 'Starter Pay-As-You-Go',
          description: 'Perfect for small businesses getting started.',
          upfront_price: 0,
          pay_as_you_go_rate: 0.05, // 5 cents per message
          features_json: JSON.stringify(['WhatsApp Integration', 'Basic Inbox', 'Pay per message']),
        },
        {
          id: crypto.randomUUID(),
          name: 'Pro Premium',
          description: 'For growing teams with advanced automation needs.',
          upfront_price: 99, // Upfront price for premium features
          pay_as_you_go_rate: 0.02, // Discounted rate
          features_json: JSON.stringify(['All Starter Features', 'Premium Broadcasts', 'Discounted message rates', 'Priority Support']),
        },
        {
          id: crypto.randomUUID(),
          name: 'Enterprise Unlocked',
          description: 'Complete suite with full upfront access.',
          upfront_price: 499,
          pay_as_you_go_rate: 0.01,
          features_json: JSON.stringify(['All Pro Features', 'Dedicated Account Manager', 'Custom SLAs', 'Whitelabeling']),
        }
      ];

      for (const p of defaultPlans) {
        await c.env.DB.prepare(
          'INSERT INTO plans (id, name, description, upfront_price, pay_as_you_go_rate, features_json) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(p.id, p.name, p.description, p.upfront_price, p.pay_as_you_go_rate, p.features_json).run();
      }
      return c.json({ plans: defaultPlans });
    }

    // Parse features_json
    const parsedPlans = results.map(p => ({
      ...p,
      features: p.features_json ? JSON.parse(p.features_json as string) : []
    }));

    return c.json({ plans: parsedPlans });
  } catch (err) {
    console.error("Error fetching plans:", err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get workspace analytics and statistics
app.get('/api/workspace', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const contactsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM contacts WHERE workspace_id = ?'
    ).bind(workspaceId).first<{ count: number }>();

    const openConversationsCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM conversations WHERE workspace_id = ? AND status = 'open'"
    ).bind(workspaceId).first<{ count: number }>();

    const broadcastsCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM broadcast_campaigns WHERE workspace_id = ?'
    ).bind(workspaceId).first<{ count: number }>();

    return c.json({
      stats: {
        totalContacts: contactsCount?.count || 0,
        openConversations: openConversationsCount?.count || 0,
        broadcastsSent: broadcastsCount?.count || 0
      }
    });
  } catch (err: any) {
    console.error("Error fetching workspace stats:", err);
    return c.json({ error: err.message }, 500);
  }
});

// Fetch current user's workspace plan
app.get('/api/workspace/plan', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(`
      SELECT w.id, w.name as workspace_name, p.* 
      FROM workspaces w
      LEFT JOIN plans p ON w.plan_id = p.id
      WHERE w.id = ?
    `).bind(workspaceId).all();

    if (results.length === 0) return c.json({ error: 'Workspace not found' }, 404);

    return c.json({ plan: results[0] });
  } catch (err) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==========================================
// FALLBACK HANDLER
// ==========================================
// Since we are using "Workers with Assets", any request that doesn't match 
// `/api/*` will automatically be served from the `[assets]` directory (e.g., HTML/CSS/JS).
// If a static asset is not found, it falls through to this handler.
app.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'API route or static asset does not exist.' }, 404);
});

const worker = {
  fetch: app.fetch,

  // Workflow entry point (Background Tasks & FCM)
  async workflow(event: any, env: any, ctx: any) {
    console.log("Executing background workflow...", event);
    // e.g., Call Firebase Cloud Messaging (FCM) API here
  },

  // Queue consumer (Notifications)
  async queue(batch: any, env: any, ctx: any) {
    for (const message of batch.messages) {
      console.log("Processing queue message:", message.body);
    }
  },

  // Email receiver (Cloudflare Email Routing)
  async email(message: any, env: any, ctx: any) {
    console.log(`Received email from ${message.from} to ${message.to}`);
    // Process incoming email, save to DB, forward, etc.
  }
};

export default worker;


// Proxy for downloading WhatsApp media
app.get('/api/whatsapp/media', async (c) => {
  const workspaceId = c.req.query('workspaceId');
  const mediaUrl = c.req.query('url');
  
  if (!workspaceId || !mediaUrl) {
    return c.text('Missing parameters', 400);
  }

  try {
    const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    if (!config || !config.access_token) {
      return c.text('WhatsApp not configured', 400);
    }
    
    const token = config.access_token;
    
    // 1. Get the CDN URL from media ID
    const graphUrl = mediaUrl.startsWith('http') ? mediaUrl : `https://graph.facebook.com/v19.0/${mediaUrl}`;
    const res = await fetch(graphUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    if (!data.url) {
      return c.text('Media not found or expired', 404);
    }
    
    // 2. Download the actual binary data from CDN URL
    const binaryRes = await fetch(data.url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const headers = new Headers();
    headers.set('Content-Type', binaryRes.headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');
    
    return new Response(binaryRes.body, {
      status: 200,
      headers: headers
    });
    
  } catch (e) {
    console.error('Media proxy error:', e);
    return c.text('Internal Server Error', 500);
  }
});


// Upload media to WhatsApp API (Uses Cloudflare R2 bucket for high reliability and instant URL generation)
app.post('/api/whatsapp/upload', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || typeof file === 'string') {
       return c.json({ error: 'No file uploaded' }, 400);
    }
    
    // Save to Cloudflare R2 bucket
    const arrayBuffer = await file.arrayBuffer();
    const extension = file.name ? file.name.split('.').pop() : 'bin';
    const key = `${crypto.randomUUID()}.${extension}`;
    await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });
    
    const origin = new URL(c.req.url).origin;
    const r2Url = `${origin}/api/public/media/${key}`;

    // Return the absolute public R2 URL for maximum compatibility with Meta API and client dashboard
    return c.json({ success: true, mediaUrl: r2Url, r2Url: r2Url });
  } catch (e: any) {
    console.error('Media upload error:', e);
    return c.json({ error: 'Internal Server Error', details: e.message }, 500);
  }
});


// Serve R2 media publicly
app.get('/api/public/media/:key', async (c) => {
  const key = c.req.param('key');
  try {
    const object = await c.env.MEDIA_BUCKET.get(key);
    if (!object) {
      return c.text('Not found', 404);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    return new Response(object.body, {
      headers
    });
  } catch(e) {
    console.error("R2 get error", e);
    return c.text('Internal Server Error', 500);
  }
});
