import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env } from './types';
import { autoMigrate } from './autoMigrate';
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
import twilioVoice from './routes/twilioVoice';
import plivoVoice from './routes/plivoVoice';
import voiceAgentRoutes from './routes/voiceAgentRoutes';
import miscRoutes from './routes/miscRoutes';
import billingRoutes from './routes/billingRoutes';
import catalogRoutes from './routes/catalogRoutes';
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
  plivoStreamToken,
} from './shared';

// HMAC-SHA256 hex digest (Meta webhook signature verification).
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison (HMAC signatures, etc.).
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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

      // Auth metadata is supplied by the main Worker before it forwards the
      // upgrade request to the DO. These tags let us identify the owner of a
      // socket in logs and allow targeted broadcasts later.
      const userId = request.headers.get('x-auth-user-id');
      const workspaceId = request.headers.get('x-auth-workspace-id');
      const tags: string[] = [];
      if (userId) tags.push(`user:${userId}`);
      if (workspaceId) tags.push(`workspace:${workspaceId}`);

      // Accept the server end of the WebSocket
      this.ctx.acceptWebSocket(server, tags);

      console.log(`[DO] WebSocket connected for workspace=${workspaceId ?? 'unknown'} user=${userId ?? 'unknown'}. Total sockets after accept: ${this.ctx.getWebSockets().length}`);

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

      // Keepalive pings: answer with a pong on the SAME socket so the client
      // can confirm liveness/handshake. Never relay pings/pongs to other
      // sockets (with 2+ devices each ping would fan out to everyone).
      if (event === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong' }));
        } catch (e) {
          console.error('[DO] Failed to send pong:', e);
        }
        return;
      }
      if (event === 'pong') return;

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
      const tags = this.ctx.getTags(ws) || [];
      // Log the REAL close code. 1005/1006 are valid client-side indicators
      // (no close frame / abnormal termination) and should not be masked.
      console.log(`[DO] WebSocket closed: code=${code}, reason=${reason || '(empty)'}, clean=${wasClean}, tags=${tags.join(',') || 'none'}`);
    } catch (e) {
      console.error("Error in websocket close handler:", e);
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    const tags = this.ctx.getTags(ws) || [];
    console.error(`[DO] WebSocket error tags=${tags.join(',') || 'none'}:`, error);
    // Forcefully close the socket so the DO can reclaim it cleanly.
    try {
      ws.close(1011, 'Server encountered a WebSocket error');
    } catch (e) {
      // Socket may already be closed; ignore.
    }
  }
}

export class PlivoAudioBridge extends DurableObject {
  private mediaFormat = { contentType: 'audio/x-mulaw;rate=8000', sampleRate: 8000 };
  private streamStart: { callId?: string; streamId?: string; contentType: string; sampleRate: number } | null = null;
  private loaded = false;

  constructor(state: any, env: Env) {
    super(state, env);
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const role = request.headers.get('x-plivo-role') || '';
      const callId = request.headers.get('x-plivo-call-id') || '';
      const userId = request.headers.get('x-auth-user-id') || '';
      const tags: string[] = [];
      if (role) tags.push(`role:${role}`);
      if (callId) tags.push(`call:${callId}`);
      if (userId) tags.push(`user:${userId}`);

      this.ctx.acceptWebSocket(server, tags);
      console.log(`[PlivoAudio] ${role} socket connected call=${callId}`);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Plivo Audio Bridge', { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') return;

      const tags = this.ctx.getTags(ws) || [];
      const role = tags.find((t) => t.startsWith('role:'))?.slice(5) || '';

      if (data.type === 'ping' || data.event === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
        return;
      }

      if (role === 'plivo') {
        await this.handlePlivoMessage(ws, data);
      } else if (role === 'agent') {
        await this.handleAgentMessage(ws, data);
      }
    } catch (e) {
      console.error('[PlivoAudio] message error:', e);
      try { ws.close(1011, 'Invalid message payload'); } catch {}
    }
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const stored = await this.ctx.storage.get('plivoStream');
      if (stored) {
        this.mediaFormat = (stored && stored.mediaFormat) || this.mediaFormat;
        this.streamStart = (stored && stored.streamStart) || this.streamStart;
      }
    } catch {}
  }

  private async persist() {
    try {
      await this.ctx.storage.put('plivoStream', { mediaFormat: this.mediaFormat, streamStart: this.streamStart });
    } catch {}
  }

  async handlePlivoMessage(ws: WebSocket, data: any) {
    await this.ensureLoaded();
    if (data.event === 'start') {
      const start = data.start || {};
      // Plivo "start" event mediaFormat.encoding poora MIME bhejta hai
      // (jaise "audio/x-mulaw" / "audio/x-l16"). Purana code sirf "L16"
      // expect karta tha aur 'audio/' + encoding karke "audio/audio/x-mulaw"
      // jaisa galat contentType bhej deta tha. Ab robust parsing:
      let enc = String(start.mediaFormat && start.mediaFormat.encoding || 'audio/x-mulaw');
      if (!enc.startsWith('audio/')) {
        enc = 'audio/x-' + enc.toLowerCase().replace(/^x-/, '');
      }
      const sampleRate = Number((start.mediaFormat && start.mediaFormat.sampleRate) || 8000);
      this.mediaFormat = { contentType: `${enc};rate=${sampleRate}`, sampleRate: sampleRate };
      this.streamStart = {
        callId: start.callId,
        streamId: start.streamId,
        contentType: this.mediaFormat.contentType,
        sampleRate: this.mediaFormat.sampleRate,
      };
      await this.persist();
      this.broadcastToRole('agent', {
        type: 'stream_started',
        callId: start.callId,
        streamId: start.streamId,
        contentType: this.mediaFormat.contentType,
        sampleRate: this.mediaFormat.sampleRate,
      });
      return;
    }

    if (data.event === 'media' && data.media) {
      this.broadcastToRole('agent', {
        type: 'media',
        payload: data.media.payload,
        track: data.media.track,
        chunk: data.media.chunk,
        timestamp: data.media.timestamp,
        contentType: this.mediaFormat.contentType,
        sampleRate: this.mediaFormat.sampleRate,
      });
      return;
    }

    if (data.event === 'dtmf' && data.dtmf) {
      this.broadcastToRole('agent', { type: 'dtmf', digits: data.dtmf.digit || data.dtmf.digits || '' });
    }
  }

  async handleAgentMessage(ws: WebSocket, data: any) {
    await this.ensureLoaded();

    // Agent late-join handshake: agent connect hote hi 'ready' bhejta hai.
    // Agar Plivo 'start' pehle aa chuka hai (inbound), toh stored start
    // dobara 'stream_started' ke roop mein bhej do — agent ko negotiated
    // mu-law/8000 format mil jaata hai aur recorder/player usi par chale.
    if (data.type === 'ready') {
      if (this.streamStart) {
        try { ws.send(JSON.stringify({ type: 'stream_started', ...this.streamStart })); } catch {}
      }
      return;
    }

    if (data.type === 'media' && data.payload) {
      this.sendToRole('plivo', {
        event: 'playAudio',
        media: {
          // Plivo playAudio: contentType stream ke contentType se match
          // karna chahiye (docs: ';rate=' hatakar, jaise "audio/x-mulaw").
          contentType: this.mediaFormat.contentType.split(';')[0],
          sampleRate: this.mediaFormat.sampleRate,
          payload: data.payload,
        },
      });
      return;
    }

    if (data.type === 'dtmf' && data.digits != null) {
      this.sendToRole('plivo', { event: 'sendDTMF', dtmf: { digit: String(data.digits) } });
      return;
    }

    if (data.type === 'end') {
      // Agent ne call khatam ki: sab sockets band karo taaki
      // Plivo <Hangup/> execute ho aur call single leg par end ho.
      this.closeAll(1000, 'agent ended call');
    }
  }

  broadcastToRole(role: string, payload: any) {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const tags = this.ctx.getTags(socket) || [];
        if (tags.includes(`role:${role}`)) socket.send(JSON.stringify(payload));
      } catch {}
    }
  }

  sendToRole(role: string, payload: any) {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        const tags = this.ctx.getTags(socket) || [];
        if (tags.includes(`role:${role}`)) socket.send(JSON.stringify(payload));
      } catch {}
    }
  }

  closeAll(code: number, reason: string) {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try { socket.close(code, reason); } catch {}
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
      const tags = this.ctx.getTags(ws) || [];
      const role = tags.find((t) => t.startsWith('role:'))?.slice(5) || '';
      console.log(`[PlivoAudio] socket closed role=${role} code=${code}`);
      if (role === 'plivo') {
        // Plivo stream band -> agent ko batao aur sabhi sockets close karo.
        this.broadcastToRole('agent', { type: 'stream_ended' });
        this.closeAll(1000, 'plivo stream ended');
      }
    } catch (e) {
      console.error('[PlivoAudio] close error:', e);
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    try {
      const tags = this.ctx.getTags(ws) || [];
      console.error(`[PlivoAudio] socket error tags=${tags.join(',') || 'none'}:`, error);
      ws.close(1011, 'WebSocket error');
    } catch {}
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

// Echo the caller origin back so credentialed requests (cookies) work for web
// dashboard subdomains / custom domains. Wildcard '*' is rejected by browsers
// when credentials: true is used.
app.use('/api/*', cors({
  origin: (origin) => origin,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-workspace-id'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Authentication and Authorization Middleware

app.use('/api/crm/*', authMiddleware);
// NOTE: Hono wildcards only match as a whole path segment ("/*"). A
// pattern like "/api/whatsapp/config*" (star attached to a word) matches
// NOTHING, so authMiddleware never ran for these routes. That left
// requireRole() with no workspaceRole -> "Forbidden: workspace role not
// resolved" on every owner/admin action (e.g. adding a WhatsApp account,
// saving templates, publishing flows, re-enabling calls). Use the exact
// path plus the "/*" sub-path form so the middleware actually applies.
// /api/whatsapp/webhook (Meta callbacks) is intentionally NOT covered here.
app.use('/api/whatsapp/config', authMiddleware);
app.use('/api/whatsapp/config/*', authMiddleware);
app.use('/api/whatsapp/templates', authMiddleware);
app.use('/api/whatsapp/templates/*', authMiddleware);
app.use('/api/whatsapp/flows', authMiddleware);
app.use('/api/whatsapp/flows/*', authMiddleware);
app.use('/api/whatsapp/send', authMiddleware);
app.use('/api/whatsapp/calls', authMiddleware);
app.use('/api/whatsapp/calls/*', authMiddleware);
// Twilio webhook callbacks are signed by Twilio and do not carry our
// auth session, so exclude /api/twilio/webhook/* from JWT/session auth.
// Other /api/twilio/* routes still require authentication.
app.use('/api/twilio/*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api/twilio/webhook')) {
    return next();
  }
  return authMiddleware(c, next);
});
// Plivo webhook callbacks are signed by Plivo and do not carry our auth
// session, so exclude /api/plivo/webhook/* from JWT/session auth.
// Other /api/plivo/* routes still require authentication.
app.use('/api/plivo/*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api/plivo/webhook')) {
    return next();
  }
  return authMiddleware(c, next);
});
app.use('/api/voice', authMiddleware);
app.use('/api/voice/*', authMiddleware);
app.use('/api/calls', authMiddleware);
app.use('/api/calls/*', authMiddleware);
app.use('/api/inbox/*', authMiddleware);
app.use('/api/media/upload', authMiddleware);
app.use('/api/broadcast', authMiddleware);
app.use('/api/broadcast/*', authMiddleware);
app.use('/api/workspace', authMiddleware);
app.use('/api/workspace/*', authMiddleware);
app.use('/api/domains', authMiddleware);
app.use('/api/domains/*', authMiddleware);
app.use('/api/email-templates', authMiddleware);
app.use('/api/email-templates/*', authMiddleware);
app.use('/api/email/*', authMiddleware);
app.use('/api/domain-emails/*', authMiddleware);
app.use('/api/domain-emails', authMiddleware);
// saasRoutes use requireRole but /api/saas had no authMiddleware coverage at
// all, so create/delete domain actions returned "workspace role not resolved".
app.use('/api/saas/*', authMiddleware);
app.use('/api/whatsapp/upload', authMiddleware);
app.use('/api/whatsapp/media', authMiddleware);
// TURN/ICE credentials cost money (Cloudflare Calls); require auth so anonymous
// callers cannot mint long-lived (24h) credentials.
app.use('/api/webrtc/*', authMiddleware);
// /api/campaigns/schedule is guarded by requireRole, which reads workspaceRole
// set by authMiddleware. Without this the route always 403s.
app.use('/api/campaigns/*', authMiddleware);
app.use('/api/fcm/*', authMiddleware);
app.use('/api/catalogs', authMiddleware);
app.use('/api/catalogs/*', authMiddleware);

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
app.route('/', twilioVoice);
app.route('/', plivoVoice);
app.route('/', voiceAgentRoutes);
app.route('/', miscRoutes);
app.route('/', billingRoutes);
app.route('/', catalogRoutes);

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

// Downloads a Meta media payload to R2 and returns the object key, or null
// if the download cannot be completed. Meta media URLs expire after ~5
// minutes, so callers should never persist the raw graph.facebook.com URL.
async function downloadMediaToR2(env: Env, phoneNumberId: string, mediaUrl: string, messageType: string): Promise<string | null> {
  const config = await env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?')
    .bind(phoneNumberId).first<{ access_token: string }>();
  if (!config || !config.access_token) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${mediaUrl}`, {
        headers: { 'Authorization': `Bearer ${config.access_token}` }
      });
      const data = await res.json() as { url?: string };
      if (!data.url) return null;
      const binaryRes = await fetch(data.url, {
        headers: { 'Authorization': `Bearer ${config.access_token}` }
      });
      const arrayBuffer = await binaryRes.arrayBuffer();
      let extension = 'bin';
      if (messageType === 'image') extension = 'jpg';
      if (messageType === 'video') extension = 'mp4';
      if (messageType === 'document') extension = 'pdf';
      if (messageType === 'audio') extension = 'ogg';
      if (messageType === 'sticker') extension = 'webp';
      const sub = (binaryRes.headers.get('Content-Type') || '').split('/')[1]?.split(';')[0]?.toLowerCase();
      if (sub && /^[a-z0-9]{2,6}$/.test(sub)) extension = sub;
      const key = `${crypto.randomUUID()}.${extension}`;
      await env.MEDIA_BUCKET.put(key, arrayBuffer, {
        httpMetadata: { contentType: binaryRes.headers.get('Content-Type') || 'application/octet-stream' }
      });
      return key;
    } catch (e) {
      if (attempt === 0) {
        console.warn('Failed to download media to R2 (attempt 1, retrying once):', e);
      } else {
        console.error('Failed to download media to R2 (giving up):', e);
      }
    }
  }
  return null;
}
// Webhook Receiver (WhatsApp sends incoming messages via POST)
app.post('/api/whatsapp/webhook', async (c) => {
  try {
    // Meta signs webhook deliveries with the app secret (x-hub-signature-256).
    // Verification is enforced whenever WHATSAPP_APP_SECRET is present in
    // SECRETS_KV. If the secret is NOT configured we FAIL OPEN (accept the
    // event) with a loud error log - a hard 503 here silently kills every
    // incoming message (no DB save, no realtime broadcast, no push), which is
    // worse than accepting unverified webhooks until the operator sets the
    // secret. Set WHATSAPP_APP_SECRET to restore strict verification.
    const appSecretRaw = await c.env.SECRETS_KV?.get('WHATSAPP_APP_SECRET');
    const appSecret = appSecretRaw?.trim();
    const rawBody = await c.req.text();
    if (appSecret) {
      const signature = c.req.header('x-hub-signature-256') || '';
      const expected = 'sha256=' + await hmacSha256Hex(appSecret, rawBody);
      if (!constantTimeEqual(signature, expected)) {
        console.warn('[WhatsApp] Webhook signature mismatch  ignoring event', {
          secretLength: appSecret.length,
          signatureLength: signature.length,
          expectedLength: expected.length,
          hint: 'Make sure WHATSAPP_APP_SECRET in SECRETS_KV is the Meta App Secret (not the access token).',
        });
        return c.json({
          error: 'Webhook signature mismatch',
          detail: 'WHATSAPP_APP_SECRET in SECRETS_KV does not match the secret used by Meta to sign this webhook. Verify the App Secret in your Meta App > App Settings > Basic.'
        }, 403);
      }
    } else {
      console.error('[WhatsApp] WHATSAPP_APP_SECRET missing in SECRETS_KV - accepting webhook WITHOUT signature verification. Add WHATSAPP_APP_SECRET (Meta App Secret) to SECRETS_KV to enable verification.');
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
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
          // Field: 'calls' - Meta sends call events here
          // ==========================================
          if (change.field === 'calls') {
            // Safe access: change.value could be undefined
            if (!change.value || typeof change.value !== 'object') {
              console.error('[Calling] change.value is missing or not an object:', change);
              continue;
            }
            const callsArray = change.value.calls;
            if (!callsArray || !Array.isArray(callsArray)) continue;

            console.log(`[Calling] [OK] calls field handler FIRED. phone_number_id from payload: ${change.value.metadata?.phone_number_id}`);

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

              if (event === 'offer' && !sdp) {
                console.error('[Calling] OFFER without SDP -- callData keys: ' + Object.keys(callData).join(',') + ' | session: ' + JSON.stringify(callData.session || null));
              }
              const config = await c.env.DB.prepare('SELECT workspace_id, calling_enabled, call_schedule, access_token FROM whatsapp_configs WHERE phone_number_id = ?')
                .bind(phoneNumberId).first<{ workspace_id: string; calling_enabled: number; call_schedule: string; access_token: string }>();

              if (!config) {
                console.error(`[Calling] [ERR] No config found for phone_number_id: ${phoneNumberId}`);
                continue;
              }

              console.log(`[Calling] Found workspace_id: ${config.workspace_id} for phone_number_id: ${phoneNumberId}`);

              // Check call schedule for incoming calls
              if (config.calling_enabled === 0) {
                console.log(`[Calling] [SKIP] Calling is disabled for ${phoneNumberId}. Skipping incoming call.`);
                continue;
              }
              if (config.call_schedule && (event === 'connect' || event === 'offer')) {
                try {
                  const schedule = JSON.parse(config.call_schedule);
                  if (schedule.enabled) {
                    const now = new Date();
                    // Schedule times are defined in India time (IST = UTC+5:30); Workers' Date is UTC.
                    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                    const currentHour = ist.getUTCHours();
                    const currentMin = ist.getUTCMinutes();
                    const currentTime = currentHour * 60 + currentMin;
                    const startParts = (schedule.start_time || '09:00').split(':').map(Number);
                    const endParts = (schedule.end_time || '17:00').split(':').map(Number);
                    const startMin = startParts[0] * 60 + (startParts[1] || 0);
                    const endMin = endParts[0] * 60 + (endParts[1] || 0);
                    const dayOfWeek = ist.getUTCDay() === 0 ? 7 : ist.getUTCDay();
                    const days = Array.isArray(schedule.days) ? schedule.days : [1,2,3,4,5];

                    if (!days.includes(dayOfWeek) || currentTime < startMin || currentTime > endMin) {
                      console.log(`[Calling] [SKIP] Outside call schedule for ${phoneNumberId}. Day=${dayOfWeek}, Time=${currentHour}:${currentMin}, Schedule=${schedule.start_time}-${schedule.end_time}`);
                      // Resolve/create a contact for the missed call before logging it.
                      // calls.contact_id is NOT NULL with a FK to contacts(id); the previous
                      // empty-string value violated the FK (insert failed with foreign_keys
                      // on) and left a dangling reference otherwise. Mirror the connect/offer
                      // path's contact resolution. If there is no caller number we cannot
                      // build a valid contact, so skip the log rather than write a bad row.
                      let missedContactId = '';
                      if (callerNumber) {
                        const existingMissed = await c.env.DB.prepare(
                          "SELECT id FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?"
                        ).bind(config.workspace_id, callerNumber).first<{ id: string }>();
                        if (existingMissed) {
                          missedContactId = existingMissed.id;
                        } else {
                          missedContactId = crypto.randomUUID();
                          await c.env.DB.prepare(
                            "INSERT INTO contacts (id, workspace_id, platform, name, platform_contact_id) VALUES (?, ?, ?, ?, ?)"
                          ).bind(missedContactId, config.workspace_id, 'whatsapp', `+${callerNumber}`, callerNumber).run();
                        }
                      }
                      if (missedContactId) {
                        const missedCallId = crypto.randomUUID();
                        await c.env.DB.prepare(`
                          INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(missedCallId, config.workspace_id, missedContactId, phoneNumberId, callerNumber || 'unknown', 'voice', 'incoming', 'missed', 0).run();
                      } else {
                        console.warn(`[Calling] Skipping missed-call log for ${phoneNumberId}: no caller number to resolve a contact`);
                      }
                      continue;
                    }
                  }
                } catch (e) {
                  console.error(`[Calling] Error parsing call_schedule for ${phoneNumberId}:`, e);
                }
              }

              if (event === 'connect' || event === 'offer') {
              // Outgoing call progression (business/user-initiated)
              if (direction === 'BUSINESS_INITIATED') {
                let localCall = await c.env.DB.prepare(
                  'SELECT id, contact_id, status FROM calls WHERE workspace_id = ? AND external_call_id = ?'
                ).bind(config.workspace_id, callId).first<{ id: string; contact_id: string; status: string }>();

                if (!localCall) {
                  // Fallback: attach to the most recent dialing/ringing outbound WhatsApp row for this callee
                  localCall = await c.env.DB.prepare(
                    "SELECT id, contact_id, status FROM calls WHERE workspace_id = ? AND source = 'whatsapp' AND direction = 'outgoing' AND caller_number = ? AND status IN ('dialing','ringing') ORDER BY created_at DESC LIMIT 1"
                  ).bind(config.workspace_id, callerNumber).first<{ id: string; contact_id: string; status: string }>();
                  if (localCall) {
                    await c.env.DB.prepare('UPDATE calls SET external_call_id = ? WHERE id = ?')
                      .bind(callId, localCall.id).run();
                  }
                }

                if (!localCall) {
                  // No originating row found; create a minimal log so the event is not lost
                  let fallbackContactId = '';
                  if (callerNumber) {
                    const existing = await c.env.DB.prepare(
                      "SELECT id FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?"
                    ).bind(config.workspace_id, callerNumber).first<{ id: string }>();
                    if (existing) {
                      fallbackContactId = existing.id;
                    } else {
                      fallbackContactId = crypto.randomUUID();
                      await c.env.DB.prepare(
                        "INSERT INTO contacts (id, workspace_id, platform, name, platform_contact_id) VALUES (?, ?, ?, ?, ?)"
                      ).bind(fallbackContactId, config.workspace_id, 'whatsapp', `+${callerNumber}`, callerNumber).run();
                    }
                  }
                  if (!fallbackContactId) {
                    console.warn('[Calling] Skipping outgoing fallback row for call ' + callId + ': no caller number to resolve a contact');
                    continue;
                  }
                  const fallbackId = crypto.randomUUID();
                  await c.env.DB.prepare(`
                    INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration, source, external_call_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).bind(fallbackId, config.workspace_id, fallbackContactId, phoneNumberId, callerNumber, 'voice', 'outgoing', 'ringing', 0, 'whatsapp', callId).run();
                  localCall = { id: fallbackId, contact_id: fallbackContactId, status: 'ringing' };
                }

                const hasAnswerSdp = !!sdp;
                const nextStatus = hasAnswerSdp ? 'in_progress' : 'ringing';
                await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ?')
                  .bind(nextStatus, localCall.id).run();

                try {
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: hasAnswerSdp ? 'whatsapp_outgoing_answer' : 'whatsapp_outgoing_ringing',
                      callId: localCall.id,
                      externalCallId: callId,
                      from: callerNumber,
                      sdp: sdp || '',
                      sdpType: sdpType || 'offer',
                      phoneNumberId: phoneNumberId
                    })
                  }));
                } catch (e) {
                  console.error('[Calling] Failed to broadcast outgoing call progress:', e);
                }

                continue;
              }

                // An incoming call that has already connected must not ring again.
                if (event === 'connect') {
                  await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ? AND workspace_id = ?')
                    .bind('in_progress', callId, config.workspace_id).run();
                  continue;
                }

                // Incoming call - save to DB + broadcast to frontend
                let contactId = '';
                let callerName = callerNumber ? `+${callerNumber}` : 'Unknown';
                const existingContact = await c.env.DB.prepare(
                  "SELECT id, name FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?"
                ).bind(config.workspace_id, callerNumber).first<{ id: string; name: string }>();

                if (existingContact && existingContact.name) {
                  callerName = existingContact.name;
                }

                if (existingContact) {
                  contactId = existingContact.id;
                } else {
                  contactId = crypto.randomUUID();
                  await c.env.DB.prepare(
                    "INSERT INTO contacts (id, workspace_id, platform, name, platform_contact_id) VALUES (?, ?, ?, ?, ?)"
                  ).bind(contactId, config.workspace_id, 'whatsapp', `+${callerNumber}`, callerNumber).run();
                }
                console.log(`[Calling] Contact sorted: ${contactId}`);

                const insertResult = await c.env.DB.prepare(`
                INSERT OR IGNORE INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(callId, config.workspace_id, contactId, phoneNumberId, callerNumber, 'voice',
                  direction === 'BUSINESS_INITIATED' ? 'outgoing' : 'incoming', 'ringing', 0).run();
                const insertedFresh = insertResult.meta?.changes === 1;
                console.log('[Calling] Call saved to DB: ' + callId + ' (fresh insert: ' + insertedFresh + ')');

                // Persist Meta's SDP offer so the mobile app can fetch it on accept
                // (GET /api/whatsapp/calls/:id/sdp) instead of shipping it via FCM.
                await c.env.DB.prepare('UPDATE calls SET sdp = ?, sdp_type = ? WHERE id = ?')
                  .bind(sdp || '', sdpType || 'offer', callId).run();

                // Duplicate 'offer' delivery (Meta retry/dedup miss): row already exists,
                // so skip the busy-check + broadcast + push to avoid a double ring/push.
                if (!insertedFresh) {
                  console.log('[Calling] Duplicate offer webhook for ' + callId + ' -- skipping broadcast & push (SDP refreshed)');
                  continue;
                }

                // ==========================================
                // LINE-BUSY CHECK (WhatsApp-style busy)
                // Agar is workspace mein pehle se koi call 'ringing' mein hai toh
                // nayi incoming call ko turant Meta ko
                // reject bhej dete hain - caller ko busy tone milega, app par
                // ring/push nahi aayegi. Ye "oldest wins" hai: do calls ek
                // saath aayein (race) toh jo pehle insert hui wo ring karegi,
                // baaki sab busy - dono webhooks isi same answer par converge
                // karte hain, isliye ye deterministic hai.
                //
                // NOTE (default dialer): PSTN calls mein bhi yahi line-busy
                // concept use hoga - app default dialer banne par incoming
                // PSTN call ko TelecomManager se auto-reject karega jab ek
                // call pehle se active ho.
                if (direction !== 'BUSINESS_INITIATED') {
                  // Pehle stale 'ringing' rows ko cleanup karo. 30 sec se zyada purani
                  // 'ringing' calls ka matlab terminate webhook miss ho gaya ya app mar gaya.
                  // Agar inhe clear na karein toh wo line ko hamesha busy dikhaayengi.
                  const cleanup = await c.env.DB.prepare(`
                    UPDATE calls SET status = 'missed', hangup_cause = 'stale_timeout'
                    WHERE workspace_id = ? AND status = 'ringing' AND strftime('%s', created_at) < strftime('%s', 'now', '-30 seconds')
                  `).bind(config.workspace_id).run();
                  if (cleanup.meta?.changes) {
                    console.log(`[Calling] Cleaned ${cleanup.meta.changes} stale ringing call(s) before busy check`);
                  }

                  const activeCall = await c.env.DB.prepare(`
                    SELECT id, status FROM calls
                    WHERE workspace_id = ? AND status = 'ringing' AND id != ?
                    ORDER BY strftime('%s', created_at) ASC LIMIT 1
                  `).bind(config.workspace_id, callId).first<{ id: string; status: string }>();

                  if (activeCall) {
                    console.log(`[Calling] [SKIP] Line busy (existing ${activeCall.status}: ${activeCall.id}) - auto-rejecting call ${callId} from ${callerNumber}`);
                    // Meta ko reject - caller ko WhatsApp jaisa busy tone milega
                    try {
                      const rejectUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;
                      await fetch(rejectUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          messaging_product: 'whatsapp',
                          call_id: callId,
                          action: 'reject'
                        })
                      });
                    } catch (e) {
                      console.error('[Calling] Busy auto-reject to Meta failed:', e);
                    }
                    // Call log mein 'busy' status ke saath record - ring/push
                    // broadcast skip (neeche continue).
                    await c.env.DB.prepare('UPDATE calls SET status = ?, hangup_cause = ? WHERE id = ?')
                      .bind('busy', 'busy', callId).run();
                    console.log(`[Calling] Call ${callId} marked busy - no ring, no push`);
                    continue;
                  }
                }

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
                      sdp: sdp || '',
                      sdpType: sdpType,
                      phoneNumberId: phoneNumberId,
                      direction: direction
                    })
                  }));
                  const broadcastBody = await broadcastResp.text();
                  console.log(`[Calling] [OK] Broadcast response from DO: ${broadcastBody}`);
                } catch (e) {
                  console.error('[Calling] [ERR] Failed to broadcast incoming call:', e);
                }

                // High-priority FCM push so the incoming call is shown even when the
                // app is killed; the WebSocket broadcast will not reach a killed app.
                if (direction !== 'BUSINESS_INITIATED') {
                  c.executionCtx.waitUntil(
                    (async () => {
                      try {
                        const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?')
                          .bind(config.workspace_id).all<{ user_id: string }>();
                        if (!members.results || members.results.length === 0) return;
                        const userIds = members.results.map(m => m.user_id);
                        const placeholders = userIds.map(() => '?').join(',');
                        const tokens = await c.env.DB.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`)
                          .bind(...userIds).all<{ token: string }>();

                        const { sendPushNotification } = await import('../lib/fcm');
                        if (!tokens.results || tokens.results.length === 0) {
                          console.warn(`[Calling] No FCM tokens for workspace ${config.workspace_id} - incoming call push skipped`);
                          return;
                        }

                        const CHUNK = 25;
                        const MAX_TOTAL_SENDS = 45;
                        const targets = tokens.results.slice(-MAX_TOTAL_SENDS);
                        if (tokens.results.length > MAX_TOTAL_SENDS) {
                          console.warn(`[Calling] Incoming-call push truncated: ${tokens.results.length} tokens, sending to ${MAX_TOTAL_SENDS}`);
                        }

                        // Build rich caller context (email + last message) so a locked or
                        // killed phone can still show name, number, email and last message.
                        let contactEmail = '';
                        let lastMessage = '';
                        let pushConvId = '';
                        try {
                          if (existingContact) {
                            const contactRow = await c.env.DB.prepare('SELECT email FROM contacts WHERE id = ?').bind(existingContact.id).first<{ email?: string }>();
                            contactEmail = contactRow?.email || '';
                            const convRow = await c.env.DB.prepare("SELECT id FROM conversations WHERE contact_id = ? AND platform = 'whatsapp' ORDER BY updated_at DESC LIMIT 1").bind(existingContact.id).first<{ id: string }>();
                            pushConvId = convRow?.id || '';
                            if (pushConvId) {
                              const msgRow = await c.env.DB.prepare("SELECT content FROM messages WHERE conversation_id = ? ORDER BY rowid DESC LIMIT 1").bind(pushConvId).first<{ content?: string }>();
                              lastMessage = msgRow?.content || '';
                            }
                          }
                        } catch (e) {
                          console.error('[Calling] Failed to enrich incoming-call push context:', e);
                        }

                        console.log(`[Calling] Sending incoming-call push to ${targets.length} token(s) for workspace ${config.workspace_id}`);
                        for (let start = 0; start < targets.length; start += CHUNK) {
                          const chunk = targets.slice(start, start + CHUNK);
                          const sends = await Promise.allSettled(
                            chunk.map((row) =>
                              sendPushNotification(
                                c.env,
                                row.token,
                                'Incoming WhatsApp call',
                                `Call from ${callerName}`,
                                {
                                  workspaceId: config.workspace_id,
                                  type: 'incoming_call',
                                  id: callId,
                                  callerNumber: callerNumber || '',
                                  callerName: callerName,
                                  contactEmail: contactEmail,
                                  lastMessage: (lastMessage || '').slice(0, 160),
                                  conversationId: pushConvId,
                                  phoneNumberId: phoneNumberId || '',
                                  // NOTE: SDP is intentionally omitted from the FCM push
                                  // (a WebRTC offer can exceed FCM's ~4KB data limit);
                                  // the app fetches it via GET /api/whatsapp/calls/:id/sdp.
                                },
                                { ttlSeconds: 0, category: 'call', sound: 'default', dataOnly: true }
                              )
                            )
                          );
                          for (let i = 0; i < sends.length; i++) {
                            const s = sends[i];
                            if (s.status === 'fulfilled' && s.value.unregistered) {
                              try {
                                await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
                              } catch (e) {
                                console.error('Failed to delete unregistered FCM token:', e);
                              }
                            }
                            if (s.status === 'rejected') {
                              console.error('[Calling] Incoming-call push rejected:', s.reason);
                            } else if (s.status === 'fulfilled' && !s.value.success) {
                              console.error('[Calling] Incoming-call push failed:', s.value.error);
                            }
                          }
                        }
                      } catch (e) {
                        console.error('[Calling] Failed to send incoming call notification:', e);
                      }
                    })()
                  );
                }

              } else if (event === 'terminate') {
                console.log(`[Calling] Call terminated: ${callId}`);
                const hangupCause = callData.hangup_cause || 'normal';
                const duration = callData.duration || 0;

                const existingCall = await c.env.DB.prepare('SELECT id, direction, status FROM calls WHERE id = ? OR external_call_id = ?')
                  .bind(callId, callId).first<{ id: string; direction: string, status: string }>();

                const wasMissed = existingCall && existingCall.direction === 'incoming' &&
                  existingCall.status === 'ringing' && duration === 0;

                // The terminate event for a busy-rejected call arrives later. Preserve the
                // status, otherwise a 'busy' record would be rewritten to 'ended' and the
                // call log would show the wrong outcome.
                const finalStatus = existingCall?.status === 'busy'
                  ? 'busy'
                  : (wasMissed ? 'missed' : 'ended');

                await c.env.DB.prepare('UPDATE calls SET status = ?, duration = ?, hangup_cause = ? WHERE id = ?')
                  .bind(finalStatus, duration, hangupCause, existingCall?.id || callId).run();

                try {
                  const globalDoId = c.env.CHAT_DO.idFromName(`global-${config.workspace_id}`);
                  const globalDo = c.env.CHAT_DO.get(globalDoId);
                  await globalDo.fetch(new Request('http://internal/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'call_status_updated',
                      call_id: existingCall?.id || callId,
                      status: finalStatus,
                      duration: duration,
                      source: 'whatsapp'
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
                          if (tokens.results && tokens.results.length > 0) {
                            // Bound the fan-out: subrequest/wall-time limits are
                            // cumulative per invocation, so cap the TOTAL sends
                            // (not just concurrency) and chunk them.
                            const CHUNK = 25;
                            const MAX_TOTAL_SENDS = 45;
                            const targets = tokens.results.slice(-MAX_TOTAL_SENDS);
                            if (tokens.results.length > MAX_TOTAL_SENDS) {
                              console.warn(`[Calling] Missed-call push truncated: ${tokens.results.length} tokens, sending to ${MAX_TOTAL_SENDS}`);
                            }
                            for (let start = 0; start < targets.length; start += CHUNK) {
                              const chunk = targets.slice(start, start + CHUNK);
                              const sends = await Promise.allSettled(
                                chunk.map((row) =>
                                  sendPushNotification(
                                  c.env,
                                  row.token,
                                  `Missed Call +${callerNumber}`,
                                  'You missed a WhatsApp voice call',
                                  { workspaceId: config.workspace_id, type: 'missed_call', phone: callerNumber },
                                  { ttlSeconds: 0, category: 'call', sound: 'default' }
                                )
                                )
                              );
                              console.log('[Webhook] Fan-out chunk results: ' + sends.map((s: any) => s.status === 'fulfilled' ? (s.value.success ? 'OK' : 'FAIL:' + s.value.error) : 'REJECTED').join(', '));
                            // Remove dead tokens so future sends don't hit FCM with them.
                              for (let i = 0; i < sends.length; i++) {
                                const s = sends[i];
                                if (s.status === 'fulfilled' && s.value.unregistered) {
                                  try {
                                    await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
                                  } catch (e) {
                                    console.error('Failed to delete unregistered FCM token:', e);
                                  }
                                }
                              }
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
            // Meta batches messages: process EVERY message in the delivery,
            // not just the first - otherwise multi-message bursts are dropped.
            const contactsArray = change.value.contacts || [];
            const phoneNumberId = change.value.metadata?.phone_number_id;
            for (const message of change.value.messages) {
            const contact = contactsArray[0];
            const parsed = parseIncomingWhatsAppMessage(message);
            let messageText = parsed.text;
            const messageType = parsed.type;
            let mediaUrl = parsed.mediaUrl;

            if (message.context && message.context.id) {
              messageText = '[Reply] ' + messageText;
            }

            console.log('New ' + messageType + ' message from ' + (contact?.profile?.name ?? 'Unknown') + ' (' + message.from + '):', messageText);

            // Download media to R2 if needed
            let finalMediaUrl = mediaUrl;
            if (['image', 'video', 'document', 'audio', 'sticker'].includes(messageType) && mediaUrl) {
              const r2Key = await downloadMediaToR2(c.env, phoneNumberId, mediaUrl, messageType);
              finalMediaUrl = r2Key ? `/api/public/media/${r2Key}` : `meta-media:${mediaUrl}`;
            }

            // Skip FCM/Email notifications for system_call (handled separately via calls field or missed call logic)
            if (messageType !== 'system_call') {
              c.executionCtx.waitUntil(
                (async () => {
                  try {
                    console.log('[Webhook] Push block entered for messageType=' + messageType + ' from phoneNumberId=' + phoneNumberId);
                    const config = await c.env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
                    console.log('[Webhook] whatsapp_config lookup result: ' + (config ? 'found workspace_id=' + config.workspace_id : 'NOT FOUND'));
                    if (config && config.workspace_id) {
                      const senderName = contact?.profile?.name ?? message.from ?? 'Unknown';
                      // Resolve the conversation id so notification taps can
                      // deep-link straight into the chat (chatbot.ts resolves
                      // the same contact/conversation a moment later).
                      let pushConvId = '';
                      try {
                        const contactRow = await c.env.DB.prepare(
                          "SELECT id FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?"
                        ).bind(config.workspace_id, message.from || '').first<{ id: string }>();
                        if (contactRow) {
                          const convRow = await c.env.DB.prepare(
                            "SELECT id FROM conversations WHERE contact_id = ? AND platform = 'whatsapp' AND phone_number_id = ? ORDER BY created_at DESC LIMIT 1"
                          ).bind(contactRow.id, phoneNumberId).first<{ id: string }>();
                          pushConvId = convRow?.id || '';
                        }
                      } catch (e) {
                        console.error('[Webhook] Conversation lookup for push failed:', e);
                      }
                      const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(config.workspace_id).all<{ user_id: string }>();
                        console.log('[Webhook] workspace_members count: ' + (members.results?.length ?? 0));
                      if (members.results && members.results.length > 0) {
                        const userIds = members.results.map(m => m.user_id);
                        const placeholders = userIds.map(() => '?').join(',');
                        const tokens = await c.env.DB.prepare(`SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders})`).bind(...userIds).all<{ token: string }>();

                        const { sendPushNotification } = await import('../lib/fcm');
                        const title = senderName && senderName !== message.from
                          ? `${senderName} - ${message.from || ''}`
                          : (message.from || 'New WhatsApp message');
                        const bodyPreview = messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText;

                        if (tokens.results && tokens.results.length > 0) {
                          // Bound the fan-out: subrequest/wall-time limits are
                          // cumulative per invocation, so cap the TOTAL sends
                          // (not just concurrency) and chunk them.
                          const CHUNK = 25;
                          const MAX_TOTAL_SENDS = 45;
                          const targets = tokens.results.slice(-MAX_TOTAL_SENDS);
                          if (tokens.results.length > MAX_TOTAL_SENDS) {
                            console.warn(`[Webhook] New-message push truncated: ${tokens.results.length} tokens, sending to ${MAX_TOTAL_SENDS}`);
                          }
                          console.log(`[Webhook] Sending new-message push to ${targets.length} token(s) for workspace ${config.workspace_id}`);
                          for (let start = 0; start < targets.length; start += CHUNK) {
                            const chunk = targets.slice(start, start + CHUNK);
                            const sends = await Promise.allSettled(
                              chunk.map((row) =>
                                sendPushNotification(
                                c.env,
                                row.token,
                                title,
                                bodyPreview,
                                {
                                  workspaceId: config.workspace_id,
                                  contactName: senderName,
                                  type: 'new_message',
                                  senderNumber: message.from || '',
                                  messageId: message.id || '',
                                  conversation_id: pushConvId,
                                }
                              )
                              )
                            );
                            // Remove dead tokens so future sends don't hit FCM with them.
                            for (let i = 0; i < sends.length; i++) {
                              const s = sends[i];
                              if (s.status === 'fulfilled' && s.value.unregistered) {
                                try {
                                  await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
                                } catch (e) {
                                  console.error('Failed to delete unregistered FCM token:', e);
                                }
                              }
                              if (s.status === 'rejected') {
                                console.error('[Webhook] New-message push rejected:', s.reason);
                              } else if (s.status === 'fulfilled' && !s.value.success) {
                                console.error('[Webhook] New-message push failed:', s.value.error);
                              }
                            }
                          }
                        } else {
                          console.warn(`[Webhook] No FCM tokens for workspace ${config.workspace_id} - push skipped`);
                        }

                        // NOTE: Email notifications for incoming WhatsApp messages are
                        // intentionally disabled. Use FCM push notifications for real-time
                        // alerts; email is reserved for system notifications only.
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
                contact?.profile?.name || message.from || 'Unknown',
                message.id,
                messageType,
                finalMediaUrl
              )
            );
            }
          } else if (change.value && change.value.statuses) {
            // Meta can batch multiple status updates in one delivery. Process them
            // in the background so the webhook ACKs to Meta quickly instead of
            // blocking on sequential D1 + Durable Object round-trips.
            c.executionCtx.waitUntil((async () => {
              for (const statusObj of change.value.statuses) {
                const platformMsgId = statusObj.id;
                const status = statusObj.status; // 'sent', 'delivered', 'read'
          
                try {
                  const result = await c.env.DB.prepare(
                    'SELECT m.id, m.conversation_id, c.workspace_id FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.platform_message_id = ?'
                  ).bind(platformMsgId).first<{ id: string, conversation_id: string, workspace_id: string }>();
          
                  if (result) {
                    await c.env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?')
                      .bind(status, result.id).run();
          
                    // Broadcast to global workspace DO
                    const globalDoId = c.env.CHAT_DO.idFromName(`global-${result.workspace_id}`);
                    const stub = c.env.CHAT_DO.get(globalDoId);
                    await stub.fetch(new Request('http://do/broadcast', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'message_status_updated',
                        message_id: result.id,
                        conversation_id: result.conversation_id,
                        status: status,
                        platformMessageId: platformMsgId
                      })
                    }));
                  }
                } catch (err: any) {
                  console.error("Webhook status error:", err);
                }
              }
            })());
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
// ---------------------------------------------------------------------------
// WebSocket auth helper - validates the auth_session cookie or a ?sid=...
// query parameter and verifies workspace membership before allowing an
// upgrade to the global workspace Durable Object.
// ---------------------------------------------------------------------------
async function getAuthenticatedUserForWs(c: Context<{ Bindings: Env }>): Promise<{ user: any; workspaceId: string } | null> {
  const roomId = c.req.param('roomId');
  if (!roomId || !roomId.startsWith('global-')) {
    return null;
  }
  const workspaceId = roomId.slice('global-'.length);
  if (!workspaceId) {
    return null;
  }

  // Mobile apps cannot easily send httpOnly cookies over WebSocket, so they
  // pass the session id as a query param. Browsers send the cookie normally.
  const sessionId = c.req.query('sid') || getCookie(c, 'auth_session');
  if (!sessionId || !c.env.SECRETS_KV) {
    return null;
  }

  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (!userDataStr) {
    return null;
  }

  let user: any = null;
  try {
    user = JSON.parse(userDataStr);
  } catch (e) {
    return null;
  }
  if (!user || !user.id) {
    return null;
  }

  if (!c.env.DB) {
    // Local development fallback - still require a known room shape but skip DB.
    return { user, workspaceId };
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  ).bind(workspaceId, user.id).first<{ role: string }>();
  if (!member) {
    return null;
  }

  return { user, workspaceId };
}

// ---------------------------------------------------------------------------
// Plivo Audio Bridge auth helpers - agent ke liye session + workspace verify,
// Plivo side ke liye HMAC token verify.
// ---------------------------------------------------------------------------
async function getPlivoAgentAuth(c: Context<{ Bindings: Env }>, callId: string): Promise<{ user: any; workspaceId: string } | null> {
  if (!callId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) {
    return null;
  }

  const sessionId = c.req.query('sid') || getCookie(c, 'auth_session');
  if (!sessionId || !c.env.SECRETS_KV) {
    return null;
  }

  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (!userDataStr) {
    return null;
  }

  let user: any = null;
  try {
    user = JSON.parse(userDataStr);
  } catch (e) {
    return null;
  }
  if (!user || !user.id) {
    return null;
  }

  if (!c.env.DB) {
    // Local development fallback (DB nahi hota tab bhi session valid ho to allow).
    return { user, workspaceId: '' };
  }

  const call = await c.env.DB.prepare(
    "SELECT workspace_id FROM calls WHERE id = ? AND source = 'plivo'"
  ).bind(callId).first<{ workspace_id: string }>();
  if (!call) {
    return null;
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
  ).bind(call.workspace_id, user.id).first<{ role: string }>();
  if (!member) {
    return null;
  }

  return { user, workspaceId: call.workspace_id };
}

async function verifyPlivoAudioToken(c: Context<{ Bindings: Env }>, callId: string, token: string): Promise<boolean> {
  if (!callId || !token || !c.env.DB) {
    return false;
  }

  const call = await c.env.DB.prepare(
    'SELECT c.plivo_config_id, p.auth_token FROM calls c JOIN plivo_configs p ON p.id = c.plivo_config_id WHERE c.id = ? AND c.source = ?'
  ).bind(callId, 'plivo').first<{ plivo_config_id: string; auth_token: string }>();
  if (!call || !call.auth_token) {
    return false;
  }

  const expected = await plivoStreamToken(call.auth_token, callId);
  return constantTimeEqual(expected, token);
}

app.get('/api/chat/connect/:roomId', async (c) => {
  const roomId = c.req.param('roomId');
  const auth = await getAuthenticatedUserForWs(c);
  if (!auth) {
    return c.text('Unauthorized', 401);
  }

  // Route WebSocket upgrade request to the Durable Object, tagging it with
  // auth metadata so the DO can identify the socket owner.
  const id = c.env.CHAT_DO.idFromName(roomId);
  const stub = c.env.CHAT_DO.get(id);

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-auth-user-id', auth.user.id);
  headers.set('x-auth-workspace-id', auth.workspaceId);
  const req = new Request(c.req.raw, { headers });

  const resp = await stub.fetch(req);
  return resp;
});

app.get('/plivo/audio/:callId', async (c) => {
  const callId = c.req.param('callId');
  const token = c.req.query('token') || '';
  if (!(await verifyPlivoAudioToken(c, callId, token))) {
    return c.text('Forbidden', 403);
  }
  const id = c.env.PLIVO_AUDIO_DO.idFromName('call-' + callId);
  const stub = c.env.PLIVO_AUDIO_DO.get(id);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-plivo-role', 'plivo');
  headers.set('x-plivo-call-id', callId);
  const req = new Request(c.req.raw, { headers });
  const resp = await stub.fetch(req);
  return resp;
});

app.get('/api/plivo/audio/:callId', async (c) => {
  const callId = c.req.param('callId');
  const auth = await getPlivoAgentAuth(c, callId);
  if (!auth) {
    return c.text('Unauthorized', 401);
  }
  const id = c.env.PLIVO_AUDIO_DO.idFromName('call-' + callId);
  const stub = c.env.PLIVO_AUDIO_DO.get(id);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-plivo-role', 'agent');
  headers.set('x-plivo-call-id', callId);
  headers.set('x-auth-user-id', auth.user.id);
  const req = new Request(c.req.raw, { headers });
  const resp = await stub.fetch(req);
  return resp;
});

// 4. Media Upload (R2 Storage)

// ---------------------------------------------------------------------------
// Normalize every incoming WhatsApp Cloud API message type into the internal
// {type, text, mediaUrl} shape used by the chat handler and the Flutter app.
// Structured payloads are saved as JSON in media_url so the UI can render them.
// ---------------------------------------------------------------------------
function parseIncomingWhatsAppMessage(message: any): { type: string; text: string; mediaUrl: string | null } {
  const type = message.type || 'unknown';
  const payload: any = { incoming_type: type };
  let text = '';
  let mediaUrl = null;
  let messageType = type;

  if (message.text) {
    text = message.text.body || '';
    messageType = 'text';
  } else if (message.interactive) {
    const interactive = message.interactive;
    payload.interactive = interactive;
    if (interactive.type === 'button_reply' && interactive.button_reply) {
      const id = interactive.button_reply.id;
      const title = interactive.button_reply.title;
      payload.button_id = id;
      payload.button_title = title;
      text = 'Button reply: ' + (title || '') + (id ? ' (id: ' + id + ')' : '');
      text = text.trim();
    } else if (interactive.type === 'list_reply' && interactive.list_reply) {
      const id = interactive.list_reply.id;
      const title = interactive.list_reply.title;
      const description = interactive.list_reply.description;
      payload.list_row_id = id;
      payload.list_title = title;
      payload.list_description = description;
      text = 'List reply: ' + (title || '') + (description ? '\n' + description : '') + (id ? ' (id: ' + id + ')' : '');
      text = text.trim();
    } else if (interactive.type === 'nfm_reply' && interactive.nfm_reply) {
      let flowName = 'Flow Reply';
      try {
        const response = interactive.nfm_reply.response_json ? JSON.parse(interactive.nfm_reply.response_json) : null;
        if (response && response.name) flowName = response.name;
        payload.flow_response = response;
      } catch {}
      text = 'Flow reply: ' + flowName + (interactive.nfm_reply.body ? ' - ' + interactive.nfm_reply.body : '');
    } else {
      text = 'Interactive Response';
    }
    messageType = 'interactive';
    mediaUrl = JSON.stringify(payload);
  } else if (message.order) {
    const order = message.order;
    payload.order = order;
    let itemsText = '';
    if (order.product_items && Array.isArray(order.product_items) && order.product_items.length > 0) {
      itemsText = '\n' + order.product_items.map((item: any, i: number) => {
        const qty = item.quantity != null ? ' x' + item.quantity : '';
        const price = item.item_price ? ' @' + item.item_price : '';
        return (i + 1) + '. ' + (item.product_retailer_id || 'Product') + qty + price;
      }).join('\n');
    }
    text = ('Order: ' + (order.text || 'New order') + itemsText).trim();
    messageType = 'order';
    mediaUrl = JSON.stringify(payload);
  } else if (message.reaction) {
    text = message.reaction.emoji || '';
    payload.reacted_to = message.reaction.message_id;
    messageType = 'reaction';
    mediaUrl = message.reaction.message_id;
  } else if (message.image) {
    text = message.image.caption || '';
    mediaUrl = message.image.id;
    messageType = 'image';
  } else if (message.video) {
    text = message.video.caption || '';
    mediaUrl = message.video.id;
    messageType = 'video';
  } else if (message.document) {
    text = message.document.caption || message.document.filename || '';
    mediaUrl = message.document.id;
    messageType = 'document';
  } else if (message.audio) {
    text = message.audio.voice ? 'Voice Note' : 'Audio Message';
    mediaUrl = message.audio.id;
    messageType = 'audio';
  } else if (message.sticker) {
    text = 'Sticker';
    mediaUrl = message.sticker.id;
    messageType = 'sticker';
  } else if (message.button) {
    // Legacy button reply (distinct from interactive.button_reply)
    payload.button = message.button;
    text = 'Button reply: ' + (message.button.text || '') + (message.button.payload ? ' (' + message.button.payload + ')' : '');
    text = text.trim();
    messageType = 'button';
    mediaUrl = JSON.stringify(payload);
  } else if (message.template) {
    text = 'Template Message: ' + (message.template.name || 'Unknown');
    payload.template = message.template;
    messageType = 'template';
    mediaUrl = JSON.stringify(payload);
  } else if (message.location) {
    const loc = message.location;
    payload.latitude = loc.latitude;
    payload.longitude = loc.longitude;
    payload.name = loc.name;
    payload.address = loc.address;
    text = loc.name
      ? loc.name + (loc.address ? ' - ' + loc.address : '')
      : 'Location: ' + loc.latitude + ', ' + loc.longitude;
    messageType = 'location';
    mediaUrl = JSON.stringify(payload);
  } else if (message.contacts) {
    const contacts = message.contacts;
    payload.contacts = contacts;
    const first = contacts[0] || {};
    const name = (first.name && (first.name.formatted_name || first.name.first_name)) || 'Contact';
    const phone = (first.phones && first.phones[0] && first.phones[0].phone) || '';
    text = 'Contact: ' + name + (phone ? ' - ' + phone : '');
    messageType = 'contacts';
    mediaUrl = JSON.stringify(payload);
  } else if (type === 'system') {
    if (message.system && message.system.type === 'user_initiated_call') {
      text = 'Incoming Voice Call';
      messageType = 'system_call';
    } else {
      text = message.system?.body || 'System Message';
      payload.system = message.system;
      messageType = 'system';
      mediaUrl = JSON.stringify(payload);
    }
  } else if (message.errors || type === 'unsupported') {
    const err = (message.errors && message.errors[0]) || {};
    let details = (err.error_data && err.error_data.details) || err.message || '';
    text = ('Unsupported message' + (err.title ? ': ' + err.title : '') + (err.code ? ' (code ' + err.code + ')' : '') + (details ? ' - ' + details : '')).trim();
    payload.errors = message.errors;
    payload.unsupported = message.unsupported;
    messageType = 'unsupported';
    mediaUrl = JSON.stringify(payload);
  } else {
    text = 'Unsupported message type: ' + type;
    payload.raw = message;
    messageType = type || 'unknown';
    mediaUrl = JSON.stringify(payload);
  }

  return { type: messageType, text, mediaUrl };
}
const worker = {
  async fetch(request: any, env: any, ctx: any) {
    // Enterprise-style automatic migration: before serving the first request
    // after a deploy, synchronize the D1 schema with schema.sql (idempotent).
    // If the migration cannot be applied, fail fast with 503 instead of
    // routing a request against a schema that is known to be out of sync.
    if (env.DB) {
      try {
        await autoMigrate(env.DB);
      } catch (err: any) {
        console.error('[AutoMigrate] Schema migration failed:', err?.message || err);
        // Do not echo err details to the client (CodeQL: information exposure
        // through stack traces). Full error is logged server-side above.
        return new Response(JSON.stringify({
          error: 'Service temporarily unavailable (database schema update in progress)',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return app.fetch(request, env, ctx);
  },

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
    const { expireSubscriptions, expireAddonSubscriptions } = await import('./services/subscriptionService');
    const expired = await expireSubscriptions(env);
    const expiredAddons = await expireAddonSubscriptions(env);
    if (expired > 0) {
      console.log(`[Billing] Expired ${expired} subscription(s) and downgraded workspaces to free plan`);
    if (expiredAddons > 0) {
      console.log(`[Billing] Expired ${expiredAddons} add-on subscription(s)`);
    }
    }
  },

  // Queue consumer (Broadcast deliveries: sends WhatsApp template messages
  // via Meta API and updates campaign counters - see workers/broadcast-queue.ts)
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
