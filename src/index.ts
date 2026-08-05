import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env } from './types';
import { handleIncomingMessage } from './services/chatbot';
import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import { EmailMessage } from 'cloudflare:email';
import metaOauth from './routes/meta-oauth';
import adminRouter from './routes/admin';
import broadcastQueueConsumer from '../workers/broadcast-queue';
import authRoutes from './routes/authRoutes';
import crmRoutes from './routes/crmRoutes';
import emailRoutes from './routes/emailRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import inboxRoutes from './routes/inboxRoutes';
import callRoutes from './routes/callRoutes';
import miscRoutes from './routes/miscRoutes';
import billingRoutes from './routes/billingRoutes';
import {
  authMiddleware,
  pagination,
  requireRole,
  DOMAIN_REGEX,
  EMAIL_REGEX,
  parseDomain,
  checkEmailRateLimit,
  getWorkspacePlanLimits,
  checkEmailPlanQuota,
  incrementEmailUsage,
  checkDomainAddRateLimit,
  checkDomainAbuse,
  parseEmailMediaJson,
  stripHtmlTags,
} from './shared';

export class ChatDurableObject extends DurableObject {
  constructor(state: any, env: Env) {
    super(state, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // If it's a POST to /broadcast, broadcast the JSON body to all connected WebSockets
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      try {
        const data = await request.json() as { type?: string; [key: string]: any };
        const sockets = this.ctx.getWebSockets();
        console.log(`[DO Broadcast] Sending type=${data.type} to ${sockets.length} WebSocket(s)`);
        let sent = 0;
        for (const socket of sockets) {
          try {
            socket.send(JSON.stringify(data));
            sent++;
          } catch (e) {
            console.error('[DO Broadcast] Failed to send to WebSocket:', e);
          }
        }
        console.log(`[DO Broadcast] Successfully sent to ${sent}/${sockets.length} WebSocket(s)`);
        return new Response('OK');
      } catch (err: any) {
        console.error('[DO Broadcast] Error:', err);
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

      console.log(`[DO] WebSocket connected. Total sockets after accept: ${this.ctx.getWebSockets().length}`);

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
          } catch (e) { }
        }
      }
    } catch (e) {
      console.error("Error parsing/relaying WebSocket message:", e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
      const validCode = (code === 1005 || code === 1006) ? 1000 : code;
      console.log(`[DO] WebSocket closed: code=${validCode}, reason=${reason}`);
    } catch (e) {
      console.error("Error in websocket close handler:", e);
    }
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

// Security, Domain Verification, and Rate Limiting Middleware
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin');
  const ip = c.req.header('cf-connecting-ip') || 'unknown';

  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).hostname;
    } catch (e) {
      return c.text('Forbidden: Invalid Origin header', 400);
    }

    const isBaseDomain = originHost === 'localhost' || 
                         originHost === 'navasanganakah.com' ||
                         originHost.endsWith('.navasanganakah.com');
    
    if (!isBaseDomain) {
      // Check if domain is verified
      const status = c.env.SECRETS_KV ? await c.env.SECRETS_KV.get(`DOMAIN:${originHost}`) : null;
      if (status !== 'verified') {
        return c.text('Forbidden: Domain not verified or blocked', 403);
      }

      // Rate Limiter Logic for external domains (e.g., max 100 reqs / min)
      if (c.env.SECRETS_KV) {
        const rateKey = `RATE:${originHost}:${Math.floor(Date.now() / 60000)}`;
        const currentReqs = parseInt(await c.env.SECRETS_KV.get(rateKey) || '0', 10);
        
        if (currentReqs >= 100) {
          // Auto-block the domain due to spam
          await c.env.SECRETS_KV.put(`DOMAIN:${originHost}`, 'blocked');
          if (c.env.DB) {
            await c.env.DB.prepare("UPDATE api_domains SET status = 'blocked', blocked_reason = 'rate_limit_exceeded', updated_at = CURRENT_TIMESTAMP WHERE domain = ?").bind(originHost).run();
          }
          console.warn(`[Security] Auto-blocked domain ${originHost} due to rate limiting.`);
          c.res && c.res.headers && c.res.headers.set('X-RateLimit-Warning', `Your domain ${originHost} has been auto-blocked due to exceeding rate limits`);
          return c.text('Too Many Requests. Domain automatically blocked due to spam activity.', 429);
        }
        
        await c.env.SECRETS_KV.put(rateKey, (currentReqs + 1).toString(), { expirationTtl: 60 });
      }
    }
  }
  await next();
});

// Standard CORS now safely allows * because unverified origins are rejected above
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-workspace-id'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Authentication and Authorization Middleware

app.use('/api/crm/*', authMiddleware);
app.use('/api/whatsapp/config*', authMiddleware);
app.use('/api/whatsapp/templates*', authMiddleware);
app.use('/api/whatsapp/flows*', authMiddleware);
app.use('/api/whatsapp/send', authMiddleware);
app.use('/api/whatsapp/calls*', authMiddleware);
app.use('/api/inbox/*', authMiddleware);
app.use('/api/media/upload', authMiddleware);
app.use('/api/broadcast', authMiddleware);
app.use('/api/broadcast/*', authMiddleware);
app.use('/api/workspace', authMiddleware);
app.use('/api/domains', authMiddleware);
app.use('/api/domains/*', authMiddleware);
app.use('/api/email-templates', authMiddleware);
app.use('/api/email-templates/*', authMiddleware);
app.use('/api/email/*', authMiddleware);
app.use('/api/domain-emails/*', authMiddleware);
app.use('/api/whatsapp/upload', authMiddleware);
app.use('/api/whatsapp/media', authMiddleware);

// Billing endpoints are authenticated except the Razorpay webhook
app.use('/api/billing/*', async (c, next) => {
  if (c.req.path === '/api/billing/webhook') return next();
  return authMiddleware(c, next);
});

app.route('/api/meta', metaOauth);
app.route('/api/admin', adminRouter);
app.route('/', authRoutes);
app.route('/', crmRoutes);
app.route('/', emailRoutes);
app.route('/', whatsappRoutes);
app.route('/', inboxRoutes);
app.route('/', callRoutes);
app.route('/', miscRoutes);
app.route('/', billingRoutes);

// Health Check
app.get('/api/health', (c) => {
  return c.json({ status: 'active', environment: c.env.ENVIRONMENT || 'preview' });
});

// ==========================================
// SECURE GEMINI VOICE WEBSOCKET PROXY
// ==========================================
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
    // Log only metadata, never the full body (it may contain PII, tokens and
    // media URLs). Errors below already capture what is needed for debugging.
    console.log('[WhatsApp] Webhook received:', {
      object: body.object,
      entries: Array.isArray(body.entry) ? body.entry.length : 0,
      fields: Array.isArray(body.entry) ? body.entry.flatMap((e: any) => (e.changes || []).map((ch: any) => ch.field)) : [],
    });

    // Check if it's a WhatsApp status update or message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          // ==========================================
          // OFFICIAL WhatsApp Cloud API Calling Webhook Handler
          // Field: 'calls' — Meta sends call events here
          // ==========================================
          if (change.field === 'calls') {
            // Safe access: change.value could be undefined
            if (!change.value || typeof change.value !== 'object') {
              console.error('[Calling] change.value is missing or not an object:', change);
              continue;
            }
            const callsArray = change.value.calls;
            if (!callsArray || !Array.isArray(callsArray)) continue;

            console.log(`[Calling] ✅ calls field handler FIRED. phone_number_id from payload: ${change.value.metadata?.phone_number_id}`);

            const phoneNumberId = change.value.metadata?.phone_number_id;

            for (const callData of callsArray) {
              const callId = callData.id;
              const event = callData.event; // 'connect' | 'terminate' | 'offer'
              const callerNumber = callData.from;
              const sdp = callData.session?.sdp;
              const sdpType = callData.session?.sdp_type;
              const direction = callData.direction; // 'USER_INITIATED' | 'BUSINESS_INITIATED'

              if (!callId) continue;

              console.log(`[Calling] Event: ${event}, Call ID: ${callId}, From: ${callerNumber}, Direction: ${direction}, HasSDP: ${!!sdp}`);

              const config = await c.env.DB.prepare('SELECT workspace_id, calling_enabled, call_schedule FROM whatsapp_configs WHERE phone_number_id = ?')
                .bind(phoneNumberId).first<{ workspace_id: string; calling_enabled: number; call_schedule: string }>();

              if (!config) {
                console.error(`[Calling] ❌ No config found for phone_number_id: ${phoneNumberId}`);
                continue;
              }

              console.log(`[Calling] Found workspace_id: ${config.workspace_id} for phone_number_id: ${phoneNumberId}`);

              // Check call schedule for incoming calls
              if (config.calling_enabled === 0) {
                console.log(`[Calling] ⛔ Calling is disabled for ${phoneNumberId}. Skipping incoming call.`);
                continue;
              }
              if (config.call_schedule && (event === 'connect' || event === 'offer')) {
                try {
                  const schedule = JSON.parse(config.call_schedule);
                  if (schedule.enabled) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMin = now.getMinutes();
                    const currentTime = currentHour * 60 + currentMin;
                    const startParts = (schedule.start_time || '09:00').split(':').map(Number);
                    const endParts = (schedule.end_time || '17:00').split(':').map(Number);
                    const startMin = startParts[0] * 60 + (startParts[1] || 0);
                    const endMin = endParts[0] * 60 + (endParts[1] || 0);
                    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
                    const days = Array.isArray(schedule.days) ? schedule.days : [1,2,3,4,5];

                    if (!days.includes(dayOfWeek) || currentTime < startMin || currentTime > endMin) {
                      console.log(`[Calling] ⛔ Outside call schedule for ${phoneNumberId}. Day=${dayOfWeek}, Time=${currentHour}:${currentMin}, Schedule=${schedule.start_time}-${schedule.end_time}`);
                      const callId = crypto.randomUUID();
                      await c.env.DB.prepare(`
                        INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                      `).bind(callId, config.workspace_id, '', phoneNumberId, callerNumber || 'unknown', 'voice', 'incoming', 'missed', 0).run();
                      continue;
                    }
                  }
                } catch (e) {
                  console.error(`[Calling] Error parsing call_schedule for ${phoneNumberId}:`, e);
                }
              }

              if (event === 'connect' || event === 'offer') {
                // Incoming call — save to DB + broadcast to frontend
                let contactId = '';
                const existingContact = await c.env.DB.prepare(
                  "SELECT id FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?"
                ).bind(config.workspace_id, callerNumber).first<{ id: string }>();

                if (existingContact) {
                  contactId = existingContact.id;
                } else {
                  contactId = crypto.randomUUID();
                  await c.env.DB.prepare(
                    "INSERT INTO contacts (id, workspace_id, platform, name, platform_contact_id) VALUES (?, ?, ?, ?, ?)"
                  ).bind(contactId, config.workspace_id, 'whatsapp', `+${callerNumber}`, callerNumber).run();
                }
                console.log(`[Calling] Contact sorted: ${contactId}`);

                await c.env.DB.prepare(`
                INSERT OR IGNORE INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(callId, config.workspace_id, contactId, phoneNumberId, callerNumber, 'voice',
                  direction === 'BUSINESS_INITIATED' ? 'outgoing' : 'incoming', 'ringing', 0).run();
                console.log(`[Calling] Call saved to DB: ${callId}`);

                // Broadcast to frontend via Durable Object for Human Answering
                try {
                  console.log(`[Calling] Broadcasting to DO: global-${config.workspace_id} for Human Answering`);
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  const broadcastResp = await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'whatsapp_incoming_call',
                      callId: callId,
                      from: callerNumber,
                      sdp: sdp,
                      sdpType: sdpType,
                      phoneNumberId: phoneNumberId,
                      direction: direction
                    })
                  }));
                  const broadcastBody = await broadcastResp.text();
                  console.log(`[Calling] ✅ Broadcast response from DO: ${broadcastBody}`);
                } catch (e) {
                  console.error('[Calling] ❌ Failed to broadcast incoming call:', e);
                }

              } else if (event === 'terminate') {
                console.log(`[Calling] Call terminated: ${callId}`);
                const hangupCause = callData.hangup_cause || 'normal';
                const duration = callData.duration || 0;

                const existingCall = await c.env.DB.prepare('SELECT direction, status FROM calls WHERE id = ?')
                  .bind(callId).first<{ direction: string, status: string }>();

                const wasMissed = existingCall && existingCall.direction === 'incoming' &&
                  existingCall.status === 'ringing' && duration === 0;

                await c.env.DB.prepare('UPDATE calls SET status = ?, duration = ?, hangup_cause = ? WHERE id = ?')
                  .bind(wasMissed ? 'missed' : 'ended', duration, hangupCause, callId).run();

                try {
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'whatsapp_call_terminated',
                      callId: callId,
                      duration: duration
                    })
                  }));
                } catch (e) { }

                if (wasMissed) {
                  c.executionCtx.waitUntil(
                    (async () => {
                      try {
                        const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?')
                          .bind(config.workspace_id).all<{ user_id: string }>();
                        if (members.results && members.results.length > 0) {
                          const userIds = members.results.map(m => m.user_id);
                          const placeholders = userIds.map(() => '?').join(',');
                          const tokens = await c.env.DB.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`)
                            .bind(...userIds).all<{ token: string }>();

                          const { sendPushNotification } = await import('../lib/fcm');
                          if (tokens.results) {
                            for (const row of tokens.results) {
                              await sendPushNotification(c.env, row.token,
                                `मिस्ड कॉल +${callerNumber}`,
                                'आपकी एक WhatsApp वॉयस कॉल मिस हो गई',
                                { workspaceId: config.workspace_id, type: 'missed_call' });
                            }
                          }
                        }
                      } catch (e) {
                        console.error('[Calling] Failed to send missed call notification:', e);
                      }
                    })()
                  );
                }
              }
            }
            continue;
          }

          if (change.value && change.value.messages) {
            const message = change.value.messages[0];
            const contact = change.value.contacts[0];
            const phoneNumberId = change.value.metadata?.phone_number_id;

            let messageText = '';
            let messageType = 'text';
            let mediaUrl: string | null = null;

            if (message.text) {
              messageText = message.text.body;
              messageType = 'text';
            } else if (message.interactive) {
              if (message.interactive.type === 'button_reply') {
                messageText = message.interactive.button_reply.title;
              } else if (message.interactive.type === 'list_reply') {
                messageText = message.interactive.list_reply.title;
              } else if (message.interactive.type === 'nfm_reply') {
                messageText = message.interactive.nfm_reply?.response_json ? JSON.parse(message.interactive.nfm_reply.response_json).name || 'Flow Reply' : 'Flow Reply';
              } else {
                messageText = 'Interactive Response';
              }
              messageType = 'interactive';
              mediaUrl = JSON.stringify(message.interactive);
            } else if (message.order) {
              messageText = message.order.text || 'Order Received';
              messageType = 'order';
              mediaUrl = JSON.stringify(message.order);
            } else if (message.reaction) {
              messageText = message.reaction.emoji || '';
              messageType = 'reaction';
              mediaUrl = message.reaction.message_id; // the message they reacted to
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
            } else if (message.type === 'system') {
              if (message.system && message.system.type === 'user_initiated_call') {
                messageText = 'इनकमिंग कॉल (Incoming Voice Call)';
                messageType = 'system_call';
              } else {
                messageText = message.system?.body || 'System Message';
                messageType = 'system';
                mediaUrl = JSON.stringify(message.system);
              }
            } else {
              messageText = `Unsupported message type: ${message.type}`;
              messageType = message.type || 'unknown';
              mediaUrl = JSON.stringify(message); // Save raw for unknown
            }

            if (message.context && message.context.id) {
              messageText = `[Reply] ` + messageText;
            }

            console.log(`New ${messageType} message from ${contact?.profile?.name ?? 'Unknown'} (${message.from}):`, messageText);

            // Download media to R2 if needed
            let finalMediaUrl = mediaUrl;
            if (['image', 'video', 'document'].includes(messageType) && mediaUrl) {
              try {
                const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first();
                if (config && config.access_token) {
                  const res = await fetch(`https://graph.facebook.com/v19.0/${mediaUrl}`, {
                    headers: { 'Authorization': `Bearer ${config.access_token}` }
                  });
                  const data = await res.json() as { url?: string };
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
              } catch (e) {
                console.error("Failed to download media to R2", e);
                finalMediaUrl = `https://graph.facebook.com/v19.0/${mediaUrl}`;
              }
            }

            // Skip FCM/Email notifications for system_call (handled separately via calls field or missed call logic)
            if (messageType !== 'system_call') {
              c.executionCtx.waitUntil(
                (async () => {
                  try {
                    const config = await c.env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
                    if (config && config.workspace_id) {
                      const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(config.workspace_id).all<{ user_id: string }>();
                      if (members.results && members.results.length > 0) {
                        const userIds = members.results.map(m => m.user_id);
                        const placeholders = userIds.map(() => '?').join(',');
                        const tokens = await c.env.DB.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`).bind(...userIds).all<{ token: string }>();

                        const { sendPushNotification } = await import('../lib/fcm');
                        const title = `New message from ${contact.profile.name}`;
                        const bodyPreview = messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText;

                        if (tokens.results) {
                          for (const row of tokens.results) {
                            await sendPushNotification(c.env, row.token, title, bodyPreview, { workspaceId: config.workspace_id, contactName: contact?.profile?.name ?? 'Unknown' });
                          }
                        }

                        const emails = await c.env.DB.prepare(`SELECT email FROM users WHERE id IN (${placeholders})`).bind(...userIds).all<{ email: string }>();
                        if (emails.results && c.env.EMAIL_SENDER && typeof c.env.EMAIL_SENDER.send === 'function') {
                          const { EmailMessage } = await import('cloudflare:email');
                          for (const row of emails.results) {
                            const senderEmail = c.env.EMAIL_SENDER_ADDRESS || 'dheetantra@navasanganakah.com';
                            const rawEmail = `From: DheeTantra <${senderEmail}>\r\nTo: ${row.email}\r\nSubject: [DheeTantra] ${title}\r\n\r\nYou have a new message:\n\n${bodyPreview}\n\nReply in the CRM dashboard.`;
                            await c.env.EMAIL_SENDER.send(new EmailMessage(senderEmail, row.email, rawEmail));
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.error('Failed to send notifications', e);
                  }
                })()
              );
            }

            // Trigger Chatbot Logic
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
              const msg = await c.env.DB.prepare('SELECT id, conversation_id FROM messages WHERE platform_message_id = ?').bind(platformMsgId).first<{ id: string, conversation_id: string }>();

              if (msg) {
                await c.env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?')
                  .bind(status, msg.id).run();

                // Broadcast to conversation DO
                const doId = c.env.CHAT_DO.idFromName(msg.conversation_id);
                const stub = c.env.CHAT_DO.get(doId);
                await stub.fetch(new Request('http://do/broadcast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'message_status_updated',
                    message_id: msg.id,
                    conversation_id: msg.conversation_id,
                    status: status,
                    platformMessageId: platformMsgId
                  })
                }));
              }
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
// B2C & B2B API ROUTES (API Domains)
// ==========================================
app.get('/api/chat/connect/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  // Route WebSocket upgrade request to the Durable Object
  const id = c.env.CHAT_DO.idFromName(roomId);
  const stub = c.env.CHAT_DO.get(id);
  const resp = await stub.fetch(c.req.raw);
  return resp;
});

// 4. Media Upload (R2 Storage)
const worker = {
  fetch: app.fetch,

  // Workflow entry point (Background Tasks & FCM)
  async workflow(event: any, env: any, ctx: any) {
    console.log("Executing background workflow...", event);
    // e.g., Call Firebase Cloud Messaging (FCM) API here
  },

  // Scheduled maintenance: auto-retry Cloudflare onboarding for approved
  // domains stuck in pending/failed so they start receiving email, and
  // expire subscriptions whose access window has passed (downgrade to free).
  async scheduled(controller: any, env: any, ctx: any) {
    const { runDomainMaintenance } = await import('./services/emailService');
    await runDomainMaintenance(env, ctx);
    const { expireSubscriptions } = await import('./services/subscriptionService');
    const expired = await expireSubscriptions(env);
    if (expired > 0) {
      console.log(`[Billing] Expired ${expired} subscription(s) and downgraded workspaces to free plan`);
    }
  },

  // Queue consumer (Broadcast deliveries: sends WhatsApp template messages
  // via Meta API and updates campaign counters — see workers/broadcast-queue.ts)
  async queue(batch: any, env: any, ctx: any) {
    await broadcastQueueConsumer.queue(batch as any, env as any);
  },

  // Email receiver (Cloudflare Email Routing -> DheeTantra inbox)
  async email(message: any, env: any, ctx: any) {
    console.log(`[Email] email() handler invoked: from=${message.from} to=${message.to} rawSize=${message.rawSize}`);
    const { handleIncomingEmail } = await import('./services/emailService');
    await handleIncomingEmail(message, env, ctx);
  }
};

export default worker;
