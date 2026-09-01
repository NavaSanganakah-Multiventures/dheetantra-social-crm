import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';
import { authMiddleware, requireRole, pagination } from '../shared';

const router = new Hono<{ Bindings: Env; Variables: { user: any; workspaceRole?: string } }>();

router.get('/api/ai/gemini-stream/:workspaceId', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  // 1. Authenticate the request using standard cookie auth
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  let user = null;
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) user = JSON.parse(userDataStr);
  }
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const workspaceId = c.req.param('workspaceId');

  // 1.5 Authorize Workspace Access
  if (c.env.DB) {
    const member = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(workspaceId, user.id).first();
    if (!member) {
      return c.json({ error: 'Forbidden: You do not have access to this workspace' }, 403);
    }
  } else {
    return c.json({ error: 'Database unavailable' }, 500);
  }

  // 2. Fetch Secure API Key from KV
  const geminiKey = await c.env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return c.text('Gemini API key not configured', 500);
  }

  // 3. Connect to Gemini Live API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiKey}`;

  try {
    // Cloudflare Workers Native fetch supports WebSockets!
    const geminiResponse = await fetch(geminiUrl, {
      headers: {
        'Upgrade': 'websocket'
      }
    });

    if (geminiResponse.status !== 101) {
      console.error(`[Gemini Proxy] Failed to connect to Gemini: ${geminiResponse.status}`);
      return c.text('Failed to bridge to Gemini', 502);
    }

    const geminiWebSocket = geminiResponse.webSocket;
    if (!geminiWebSocket) {
      return c.text('Failed to get WebSocket from Gemini', 502);
    }

    // 4. Accept client connection and pipe data
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    geminiWebSocket.accept();

    // From Client -> Gemini
    server.addEventListener('message', (event) => {
      if (geminiWebSocket.readyState === WebSocket.OPEN) {
        geminiWebSocket.send(event.data);
      }
    });

    // From Gemini -> Client
    geminiWebSocket.addEventListener('message', (event) => {
      if (server.readyState === WebSocket.OPEN) {
        server.send(event.data);
      }
    });

    server.addEventListener('close', () => geminiWebSocket.close());
    geminiWebSocket.addEventListener('close', () => server.close());

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  } catch (err: any) {
    console.error("[Gemini Proxy] Error:", err);
    return c.text('Internal Server Error', 500);
  }
});

// Meta Public Config
router.get('/api/config/meta', async (c) => {
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

router.post('/api/media/upload', async (c) => {
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
  } catch (e: any) {
    console.error("R2 upload error", e);
    return c.json({ error: 'Internal Server Error', details: e.message }, 500);
  }
});

// 5. Trigger Background Workflow (FCM Notifications / Scheduling)
router.post('/api/campaigns/schedule', requireRole('owner', 'admin'), async (c) => {
  const { campaignId, scheduledTime } = await c.req.json();
  // Dispatch to Cloudflare Workflows or Queues for async processing
  // await c.env.AUTOMATION_WORKFLOW.create({ id: campaignId, params: { scheduledTime } });
  return c.json({ success: true, status: 'scheduled' });
});

// ==========================================
// 6. B2B EMAIL SERVICE & CUSTOM DOMAINS
// ==========================================

// Add Custom Domain (creates Cloudflare zone + Email Routing onboarding)
router.post('/api/whatsapp/webhook/subscribe', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const config = await c.env.DB.prepare(
      'SELECT waba_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND waba_id IS NOT NULL ORDER BY created_at DESC LIMIT 1'
    ).bind(workspaceId).first<{ waba_id: string; access_token: string }>();

    if (!config || !config.waba_id) {
      return c.json({ error: 'WABA ID not found. Please save the WABA ID in WhatsApp Config first.' }, 400);
    }

    const subsRes = await fetch(`https://graph.facebook.com/v20.0/${config.waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'subscribed_fields=messages,calls'
    });
    const subsData: any = await subsRes.json();
    console.log(`[Webhook Subscribe] Manual subscription for WABA ${config.waba_id}:`, subsData);

    if (subsData.success === true) {
      return c.json({ success: true, message: 'Webhook fields (messages + calls) subscribed successfully!' });
    } else {
      return c.json({ error: 'Subscription failed', details: subsData }, 400);
    }
  } catch (err: any) {
    console.error('[Webhook Subscribe] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Broadcast Campaign — list campaigns for the workspace
router.get('/api/broadcast', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const { limit, offset } = pagination(c, 100);
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, status, total_recipients, successful_sends, failed_sends, created_at FROM broadcast_campaigns WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(workspaceId, limit, offset).all();
    return c.json({ broadcasts: results || [] });
  } catch (err: any) {
    console.error('Failed to list broadcast campaigns:', err);
    return c.json({ error: err.message || 'Failed to list broadcasts' }, 500);
  }
});

// Broadcast Campaign — Create campaign and queue messages.
// Supports two modes:
//   1. Template mode: { campaignName, templateName, languageCode, parameters, contactIds, phoneNumberId }
//   2. Text mode (free-form): { message, audience: 'all'|'leads'|'customers', contactIds?, phoneNumberId? }
router.post('/api/broadcast', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { campaignName, templateName, languageCode, parameters, contactIds, phoneNumberId, message, audience } = await c.req.json();

  // Resolve contact IDs for text mode when audience is given instead of explicit IDs
  let resolvedContactIds: string[] = Array.isArray(contactIds) ? contactIds : [];
  if (resolvedContactIds.length === 0 && !templateName && message) {
    // Text-mode broadcasts go out over WhatsApp only — email contacts have an
    // email address as platform_contact_id and would fail (or worse) at Meta.
    let where = 'workspace_id = ? AND platform = \'whatsapp\'';
    const binds: any[] = [workspaceId];
    if (audience === 'leads') {
      where += ' AND is_lead = 1';
    } else if (audience === 'customers') {
      where += ' AND (is_lead = 0 OR is_lead IS NULL)';
    }
    const { results } = await c.env.DB.prepare(
      `SELECT id FROM contacts WHERE ${where} LIMIT 5000`
    ).bind(...binds).all<{ id: string }>();
    resolvedContactIds = (results || []).map(r => r.id);
  }

  const finalCampaignName = campaignName || (message ? (message.length > 40 ? message.slice(0, 37) + '...' : message) : 'Broadcast');
  const isTextMode = !templateName;

  if (!finalCampaignName || (isTextMode ? !message : !templateName) || resolvedContactIds.length === 0) {
    return c.json({ error: 'Missing required fields: message/templateName and contacts' }, 400);
  }

  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    // Get WABA config
    let config: any = null;
    if (phoneNumberId) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phoneNumberId).first();
    }
    if (!config) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp not configured for this workspace' }, 400);

    // Create campaign record
    const campaignId = crypto.randomUUID();
    const broadcastNow = new Date().toISOString();
    await c.env.DB.prepare(
      'INSERT INTO broadcast_campaigns (id, workspace_id, name, status, total_recipients, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(campaignId, workspaceId, finalCampaignName, 'processing', resolvedContactIds.length, broadcastNow).run();

    // Fetch contact phone numbers.
    // D1 caps bound parameters at 100 per query, so chunk the IN clause.
    const contacts: { id: string; platform_contact_id: string; phone: string }[] = [];
    for (let i = 0; i < resolvedContactIds.length; i += 99) {
      const chunk = resolvedContactIds.slice(i, i + 99);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await c.env.DB.prepare(
        `SELECT id, platform_contact_id, phone FROM contacts WHERE id IN (${placeholders}) AND workspace_id = ?`
      ).bind(...chunk, workspaceId).all<{ id: string; platform_contact_id: string; phone: string }>();
      contacts.push(...(results || []));
    }

    // Queue each message to Cloudflare Queue (parallel batches of 25 so a
    // large audience doesn't hit the Worker's 30s wall-time limit).
    let queued = 0;
    const queueAvailable = !!c.env.BROADCAST_QUEUE;
    if (!queueAvailable) {
      console.error('[broadcast] BROADCAST_QUEUE binding not configured — skipping queue');
    }
    for (let i = 0; i < contacts.length; i += 25) {
      const batch = contacts.slice(i, i + 25);
      await Promise.all(batch.map(async (contact) => {
        const toPhone = contact.platform_contact_id || contact.phone;
        if (!toPhone || !queueAvailable) return;
        const queuePayload: any = {
          campaignId,
          workspaceId,
          contactId: contact.id,
          phoneId: config.phone_number_id,
          toPhone
        };
        if (isTextMode) {
          queuePayload.text = message;
        } else {
          queuePayload.templateName = templateName;
          queuePayload.languageCode = languageCode || 'en_US';
          queuePayload.parameters = parameters || [];
        }
        try {
          await c.env.BROADCAST_QUEUE.send(queuePayload);
          queued++;
        } catch (qErr) {
          console.error(`Failed to queue broadcast for contact ${contact.id}:`, qErr);
        }
      }));
    }

    // Update total_recipients to actual queued count
    if (queued !== resolvedContactIds.length) {
      await c.env.DB.prepare('UPDATE broadcast_campaigns SET total_recipients = ? WHERE id = ?').bind(queued, campaignId).run();
    }

    if (!queueAvailable) {
      await c.env.DB.prepare('UPDATE broadcast_campaigns SET status = ? WHERE id = ?').bind('failed', campaignId).run();
      return c.json({ success: false, error: 'Broadcast queue not configured. Run: wrangler queues create broadcast-queue-prod', campaignId, total: 0 }, 500);
    }

    return c.json({ success: true, campaignId, total: queued });
  } catch (err: any) {
    console.error('Broadcast creation error:', err);
    return c.json({ error: err.message || 'Failed to create broadcast' }, 500);
  }
});

// Broadcast progress tracking
router.get('/api/broadcast/:campaignId/progress', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const campaignId = c.req.param('campaignId');
  try {
    const campaign = await c.env.DB.prepare(
      'SELECT total_recipients, successful_sends, failed_sends, status FROM broadcast_campaigns WHERE id = ? AND workspace_id = ?'
    ).bind(campaignId, workspaceId).first<{ total_recipients: number; successful_sends: number; failed_sends: number; status: string }>();

    if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

    const sent = campaign.successful_sends || 0;
    const failed = campaign.failed_sends || 0;
    const total = campaign.total_recipients || 0;
    const pending = Math.max(0, total - sent - failed);

    // Auto-mark completed if all processed
    if (campaign.status === 'processing' && sent + failed >= total && total > 0) {
      await c.env.DB.prepare('UPDATE broadcast_campaigns SET status = ? WHERE id = ?').bind('completed', campaignId).run();
      return c.json({ total, sent, failed, pending: 0, status: 'completed' });
    }

    return c.json({ total, sent, failed, pending, status: campaign.status });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// 8. PLANS & PRICING
// ==========================================

// Fetch public plans
router.get('/api/plans', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM plans ORDER BY upfront_price ASC').all();

    // If no plans exist yet, seed some defaults
    if (results.length === 0) {
      const starterLimits = { email_monthly_limit: 100, max_domains: 1, max_mailboxes_per_domain: 3, allow_email_send: true };
      const proLimits = { email_monthly_limit: 1000, max_domains: 5, max_mailboxes_per_domain: 10, allow_email_send: true };
      const enterpriseLimits = { email_monthly_limit: 10000, max_domains: 100, max_mailboxes_per_domain: 100, allow_email_send: true };

      const defaultPlans = [
        {
          id: 'free',
          name: 'Free',
          description: 'Perfect for small businesses getting started.',
          upfront_price: 0,
          pay_as_you_go_rate: 0,
          features_json: JSON.stringify(['WhatsApp Integration', 'Basic Inbox', 'Email Service']),
          limits_json: JSON.stringify(starterLimits),
          billing_type: 'one_time',
          billing_period: 'monthly',
          billing_interval: 1,
          currency: 'INR',
          is_active: 1,
          is_free: 1,
          sort_order: 0,
        },
        {
          id: crypto.randomUUID(),
          name: 'Starter Pay-As-You-Go',
          description: 'Pay per message, no upfront cost.',
          upfront_price: 0,
          pay_as_you_go_rate: 0.05, // 5 cents per message
          features_json: JSON.stringify(['WhatsApp Integration', 'Basic Inbox', 'Pay per message']),
          limits_json: JSON.stringify(starterLimits),
          billing_type: 'one_time',
          billing_period: 'monthly',
          billing_interval: 1,
          currency: 'INR',
          is_active: 1,
          is_free: 0,
          sort_order: 1,
        },
        {
          id: crypto.randomUUID(),
          name: 'Pro Premium',
          description: 'For growing teams with advanced automation needs.',
          upfront_price: 99, // Upfront price for premium features
          pay_as_you_go_rate: 0.02, // Discounted rate
          features_json: JSON.stringify(['All Starter Features', 'Premium Broadcasts', 'Discounted message rates', 'Priority Support']),
          limits_json: JSON.stringify(proLimits),
          billing_type: 'recurring',
          billing_period: 'monthly',
          billing_interval: 1,
          currency: 'INR',
          is_active: 1,
          is_free: 0,
          sort_order: 2,
        },
        {
          id: crypto.randomUUID(),
          name: 'Enterprise Unlocked',
          description: 'Complete suite with full upfront access.',
          upfront_price: 499,
          pay_as_you_go_rate: 0.01,
          features_json: JSON.stringify(['All Pro Features', 'Dedicated Account Manager', 'Custom SLAs', 'Whitelabeling']),
          limits_json: JSON.stringify(enterpriseLimits),
          billing_type: 'recurring',
          billing_period: 'monthly',
          billing_interval: 1,
          currency: 'INR',
          is_active: 1,
          is_free: 0,
          sort_order: 3,
        }
      ];

      for (const p of defaultPlans) {
        await c.env.DB.prepare(
          `INSERT INTO plans (id, name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json,
            billing_type, billing_period, billing_interval, currency, is_active, is_free, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(p.id, p.name, p.description, p.upfront_price, p.pay_as_you_go_rate, p.features_json, p.limits_json,
          p.billing_type, p.billing_period, p.billing_interval, p.currency, p.is_active, p.is_free, p.sort_order).run();
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

// Get workspace analytics, details, and statistics
router.get('/api/workspace', authMiddleware, async (c) => {
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

    const workspaceRow: any = await c.env.DB.prepare(
      `SELECT w.id, w.name, w.plan_id, p.name AS plan_name
       FROM workspaces w
       LEFT JOIN plans p ON w.plan_id = p.id
       WHERE w.id = ?`
    ).bind(workspaceId).first();

    return c.json({
      workspace: workspaceRow || { id: workspaceId, name: 'Workspace', plan_id: null, plan_name: 'Free' },
      stats: {
        totalContacts: contactsCount?.count || 0,
        openConversations: openConversationsCount?.count || 0,
        broadcastsSent: broadcastsCount?.count || 0
      },
      // Authoritative role of the caller in THIS workspace, resolved from
      // workspace_members by authMiddleware (not a stale cached value).
      currentRole: c.get('workspaceRole') || null,
    });
  } catch (err: any) {
    console.error("Error fetching workspace stats:", err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==========================================
// MEDIA ROUTES (moved BEFORE export to ensure registration)
// ==========================================

// Proxy for downloading WhatsApp media
router.get('/api/whatsapp/media', async (c) => {
  const workspaceId = c.req.query('workspaceId');
  const mediaUrl = c.req.query('url');

  if (!workspaceId || !mediaUrl) {
    return c.text('Missing parameters', 400);
  }

  // IDOR guard: this route is behind authMiddleware, but workspaceId is taken
  // from the query string. Verify the authenticated user is actually a member
  // of that workspace before using its access token - otherwise any logged-in
  // user could download another workspace's media with that workspace's token.
  const user = c.get('user') as any;
  if (c.env.DB) {
    const member = await c.env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
    ).bind(workspaceId, user?.id).first();
    if (!member) return c.text('Forbidden: no access to this workspace', 403);
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
    const data = await res.json() as { url?: string };

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
router.post('/api/whatsapp/upload', async (c) => {
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
router.get('/api/public/media/:key', async (c) => {
  const key = c.req.param('key');
  try {
    const object = await c.env.MEDIA_BUCKET.get(key);
    if (!object) {
      return c.text('Not found', 404);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Block MIME sniffing: resources served here must not be reinterpreted
    // as HTML/script regardless of their stored content type
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body, {
      headers
    });
  } catch (e) {
    console.error("R2 get error", e);
    return c.text('Internal Server Error', 500);
  }
});

// Contact form submission
router.post('/api/contact', async (c) => {
  try {
    const { name, email: contactEmail, message } = await c.req.json();

    if (!name || !contactEmail || !message) {
      return c.json({ error: 'All fields are required.' }, 400);
    }
    if (typeof name !== 'string' || name.trim().length < 1) {
      return c.json({ error: 'Name is required.' }, 400);
    }
    if (typeof contactEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return c.json({ error: 'Invalid email address.' }, 400);
    }
    if (typeof message !== 'string' || message.trim().length < 10) {
      return c.json({ error: 'Message must be at least 10 characters.' }, 400);
    }

    // Store contact submission in D1 for admin review
    try {
      await c.env.DB.prepare(
        'INSERT INTO contact_submissions (name, email, message, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ).bind(name.trim(), contactEmail.trim(), message.trim()).run();
    } catch (dbErr) {
      console.error('Failed to store contact submission:', dbErr);
    }

    return c.json({ success: true, message: 'Message sent successfully!' });
  } catch (e) {
    console.error('Contact form error:', e);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});


// ==========================================
// WORKSPACE MEMBERS MANAGEMENT
// ==========================================

router.get('/api/workspace/members', authMiddleware, async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, wm.role, wm.joined_at
       FROM workspace_members wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = ?
       ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.name`
    ).bind(workspaceId).all();
    return c.json({ members: results || [] });
  } catch (err: any) {
    console.error('Failed to list workspace members:', err);
    return c.json({ error: err.message || 'Failed to list members' }, 500);
  }
});

router.post('/api/workspace/members', authMiddleware, requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const { email, role = 'member' } = await c.req.json();
  if (!email) return c.json({ error: 'Email is required' }, 400);
  if (!['owner', 'admin', 'member'].includes(role)) {
    return c.json({ error: 'Invalid role. Use owner, admin, or member' }, 400);
  }

  const currentRole = c.get('workspaceRole');
  if (role === 'owner' && currentRole !== 'owner') {
    return c.json({ error: 'Only workspace owners can assign owner role' }, 403);
  }

  try {
    const user = await c.env.DB.prepare('SELECT id, name FROM users WHERE email = ?').bind(email.toLowerCase().trim()).first<{ id: string; name: string }>();
    if (!user) {
      return c.json({ error: 'User not found. Ask them to register first.' }, 404);
    }

    const existing = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, user.id).first();
    if (existing) {
      return c.json({ error: 'User is already a member of this workspace' }, 400);
    }

    await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .bind(workspaceId, user.id, role).run();

    return c.json({ success: true, member: { id: user.id, email: email.toLowerCase().trim(), name: user.name, role } });
  } catch (err: any) {
    console.error('Failed to add workspace member:', err);
    return c.json({ error: err.message || 'Failed to add member' }, 500);
  }
});

router.put('/api/workspace/members/:userId', authMiddleware, requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const targetUserId = c.req.param('userId');
  const { role } = await c.req.json();
  if (!['owner', 'admin', 'member'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const currentRole = c.get('workspaceRole');

  try {
    const target = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).first<{ role: string }>();
    if (!target) return c.json({ error: 'Member not found' }, 404);

    if (target.role === 'owner' && currentRole !== 'owner') {
      return c.json({ error: 'Only workspace owners can modify owners' }, 403);
    }
    if (role === 'owner' && currentRole !== 'owner') {
      return c.json({ error: 'Only workspace owners can promote to owner' }, 403);
    }

    await c.env.DB.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?')
      .bind(role, workspaceId, targetUserId).run();

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Failed to update member role:', err);
    return c.json({ error: err.message || 'Failed to update role' }, 500);
  }
});

router.delete('/api/workspace/members/:userId', authMiddleware, requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  const targetUserId = c.req.param('userId');
  const currentRole = c.get('workspaceRole');

  try {
    const target = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).first<{ role: string }>();
    if (!target) return c.json({ error: 'Member not found' }, 404);

    if (target.role === 'owner' && currentRole !== 'owner') {
      return c.json({ error: 'Only workspace owners can remove owners' }, 403);
    }

    if (target.role === 'owner') {
      const ownerCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ? AND role = ?'
      ).bind(workspaceId, 'owner').first<{ count: number }>();
      if ((ownerCount?.count || 0) <= 1) {
        return c.json({ error: 'Cannot remove the last owner. Transfer ownership first.' }, 400);
      }
    }

    await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).run();

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Failed to remove workspace member:', err);
    return c.json({ error: err.message || 'Failed to remove member' }, 500);
  }
});

// ==========================================
// FALLBACK HANDLER
// ==========================================
// Since we are using "Workers with Assets", any request that doesn't match 
// `/api/*` will automatically be served from the `[assets]` directory (e.g., HTML/CSS/JS).
// If a static asset is not found, it falls through to this handler.
router.notFound((c) => {
  return c.json({ error: 'Not Found', message: 'API route or static asset does not exist.' }, 404);
});


export default router;
