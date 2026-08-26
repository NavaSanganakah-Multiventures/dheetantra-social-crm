import { Hono } from 'hono';
import { Env } from '../types';
import { sqliteNow, requireRole } from '../shared';

function normalizeE164(raw: string, defaultCountryCode = '91'): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!trimmed.startsWith('+') && digits.length === 10) {
    digits = defaultCountryCode + digits;
  }

  return '+' + digits;
}

function maskAuthToken(token: string): string {
  if (!token || token.length <= 4) return '****';
  return '****' + token.slice(-4);
}

function sanitizeClientId(raw: string): string {
  // Twilio client identities may only contain alphanumeric and underscore.
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function conferenceNameFromCallId(callId: string): string {
  return 'conf_' + callId.replace(/-/g, '');
}

function base64Url(input: string): string {
  const binary = new TextEncoder().encode(input);
  let str = '';
  for (let i = 0; i < binary.length; i++) {
    str += String.fromCharCode(binary[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256(secret: string, input: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
}

async function generateTwilioAccessToken(
  accountSid: string,
  apiKeySid: string,
  apiKeySecret: string,
  identity: string,
  outgoingApplicationSid: string,
  pushCredentialSid?: string | null,
  ttl = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jti = apiKeySid + '-' + now + '-' + Math.random().toString(36).slice(2, 10);

  const voiceGrant: any = {
    outgoing: { application_sid: outgoingApplicationSid },
    incoming: { allow: true },
  };
  if (pushCredentialSid) {
    voiceGrant.push_credential_sid = pushCredentialSid;
  }

  const header = base64Url(JSON.stringify({ typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' }));
  const payload = base64Url(
    JSON.stringify({
      jti,
      iss: apiKeySid,
      sub: accountSid,
      iat: now,
      nbf: now,
      exp: now + ttl,
      grants: {
        identity,
        voice: voiceGrant,
      },
    })
  );
  const signingInput = header + '.' + payload;
  const signature = await hmacSha256(apiKeySecret, signingInput);
  return signingInput + '.' + base64UrlBuffer(signature);
}

// Helper to read a JSON or form body and return uniform Record<string, string>
async function parseWebhookBody(c: any): Promise<Record<string, string>> {
  const ct = c.req.header('content-type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const parsed = await c.req.parseBody();
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = String(v ?? '');
    }
    return out;
  }
  // Assume form by default for Twilio
  const parsed = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = Array.isArray(v) ? v[0] : String(v ?? '');
  }
  return out;
}

function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

async function findOrCreateGsmContact(db: D1Database, workspaceId: string, phone: string, name?: string) {
  const normalizedPhone = phone.replace(/[^0-9+]/g, '');
  const existing = await db.prepare(
    'SELECT id FROM contacts WHERE workspace_id = ? AND platform = ? AND platform_contact_id = ?'
  ).bind(workspaceId, 'gsm', normalizedPhone).first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, workspaceId, 'gsm', normalizedPhone, name || normalizedPhone).run();
  return id;
}

const router = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------
// Workspace Twilio account management
// ---------------------------------------------------------------

router.get('/api/twilio/configs', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, account_sid, auth_token, is_active, voice_application_sid, api_key_sid, api_key_secret, push_credential_sid_android, push_credential_sid_ios, created_at, updated_at FROM twilio_configs WHERE workspace_id = ? ORDER BY created_at ASC'
  ).bind(workspaceId).all<{ id: string; name: string; account_sid: string; auth_token: string; is_active: number; voice_application_sid?: string; api_key_sid?: string; api_key_secret?: string; push_credential_sid_android?: string; push_credential_sid_ios?: string; created_at: string; updated_at: string }>();

  const configs: any[] = [];
  for (const cfg of results || []) {
    const nums = await c.env.DB.prepare(
      'SELECT id, from_number, is_default, is_active FROM twilio_from_numbers WHERE twilio_config_id = ? ORDER BY is_default DESC, created_at ASC'
    ).bind(cfg.id).all<{ id: string; from_number: string; is_default: number; is_active: number }>();

    configs.push({
      id: cfg.id,
      name: cfg.name,
      accountSid: cfg.account_sid,
      authTokenMasked: maskAuthToken(cfg.auth_token),
      isActive: cfg.is_active === 1,
      voiceApplicationSid: cfg.voice_application_sid || '',
      apiKeySid: cfg.api_key_sid || '',
      apiKeySecretMasked: maskAuthToken(cfg.api_key_secret || ''),
      pushCredentialSidAndroid: cfg.push_credential_sid_android || '',
      pushCredentialSidIos: cfg.push_credential_sid_ios || '',
      fromNumbers: (nums.results || []).map((n) => ({
        id: n.id,
        fromNumber: n.from_number,
        isDefault: n.is_default === 1,
        isActive: n.is_active === 1,
      })),
    });
  }

  return c.json({ configs });
});

router.post('/api/twilio/configs', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { name, accountSid, authToken, fromNumbers, voiceApplicationSid, apiKeySid, apiKeySecret, pushCredentialSidAndroid, pushCredentialSidIos } = await c.req.json() as any;
  if (!accountSid || !authToken) {
    return c.json({ error: 'accountSid and authToken are required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO twilio_configs (id, workspace_id, name, account_sid, auth_token, is_active, voice_application_sid, api_key_sid, api_key_secret, push_credential_sid_android, push_credential_sid_ios, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    workspaceId,
    name || 'My Twilio Account',
    accountSid,
    authToken,
    voiceApplicationSid || null,
    apiKeySid || null,
    apiKeySecret || null,
    pushCredentialSidAndroid || null,
    pushCredentialSidIos || null,
    sqliteNow(),
    sqliteNow()
  ).run();

  const nums = Array.isArray(fromNumbers) ? fromNumbers.filter((n: any) => typeof n === 'string' && n.trim()) : [];
  for (let i = 0; i < nums.length; i++) {
    const from = normalizeE164(String(nums[i]).trim());
    await c.env.DB.prepare(
      'INSERT INTO twilio_from_numbers (id, twilio_config_id, from_number, is_default, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    ).bind(crypto.randomUUID(), id, from, i === 0 ? 1 : 0, sqliteNow()).run();
  }

  return c.json({ success: true, configId: id });
});

router.put('/api/twilio/configs/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM twilio_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
  if (!existing) return c.json({ error: 'Twilio config not found' }, 404);

  const body = await c.req.json() as any;
  const updates: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.accountSid !== undefined) { updates.push('account_sid = ?'); params.push(body.accountSid); }
  if (body.authToken !== undefined && body.authToken) { updates.push('auth_token = ?'); params.push(body.authToken); }
  if (body.isActive !== undefined) { updates.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (body.voiceApplicationSid !== undefined) { updates.push('voice_application_sid = ?'); params.push(body.voiceApplicationSid || null); }
  if (body.apiKeySid !== undefined) { updates.push('api_key_sid = ?'); params.push(body.apiKeySid || null); }
  if (body.apiKeySecret !== undefined && body.apiKeySecret) { updates.push('api_key_secret = ?'); params.push(body.apiKeySecret); }
  if (body.pushCredentialSidAndroid !== undefined) { updates.push('push_credential_sid_android = ?'); params.push(body.pushCredentialSidAndroid || null); }
  if (body.pushCredentialSidIos !== undefined) { updates.push('push_credential_sid_ios = ?'); params.push(body.pushCredentialSidIos || null); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  updates.push('updated_at = ?');
  params.push(sqliteNow());
  params.push(id, workspaceId);

  await c.env.DB.prepare('UPDATE twilio_configs SET ' + updates.join(', ') + ' WHERE id = ? AND workspace_id = ?').bind(...params).run();
  return c.json({ success: true });
});

router.delete('/api/twilio/configs/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM twilio_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
  if (!existing) return c.json({ error: 'Twilio config not found' }, 404);

  await c.env.DB.prepare('DELETE FROM twilio_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
  return c.json({ success: true });
});

router.post('/api/twilio/configs/:id/from-numbers', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const configId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const config = await c.env.DB.prepare('SELECT id FROM twilio_configs WHERE id = ? AND workspace_id = ?').bind(configId, workspaceId).first();
  if (!config) return c.json({ error: 'Twilio config not found' }, 404);

  const { fromNumber, isDefault } = await c.req.json() as any;
  if (!fromNumber) return c.json({ error: 'fromNumber is required' }, 400);

  const normalized = normalizeE164(String(fromNumber).trim());
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return c.json({ error: 'Invalid from number. Use a valid E.164 number like +919669509952' }, 400);
  }

  const existingNum = await c.env.DB.prepare('SELECT id FROM twilio_from_numbers WHERE twilio_config_id = ? AND from_number = ?').bind(configId, normalized).first();
  if (existingNum) return c.json({ error: 'This from number is already added' }, 409);

  if (isDefault) {
    await c.env.DB.prepare('UPDATE twilio_from_numbers SET is_default = 0 WHERE twilio_config_id = ?').bind(configId).run();
  }

  const numId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO twilio_from_numbers (id, twilio_config_id, from_number, is_default, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).bind(numId, configId, normalized, isDefault ? 1 : 0, sqliteNow()).run();

  return c.json({ success: true, fromNumberId: numId, fromNumber: normalized });
});

router.delete('/api/twilio/from-numbers/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT fn.id FROM twilio_from_numbers fn JOIN twilio_configs tc ON fn.twilio_config_id = tc.id WHERE fn.id = ? AND tc.workspace_id = ?'
  ).bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'From number not found' }, 404);

  await c.env.DB.prepare('DELETE FROM twilio_from_numbers WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

router.post('/api/twilio/from-numbers/:id/default', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT fn.id, fn.twilio_config_id FROM twilio_from_numbers fn JOIN twilio_configs tc ON fn.twilio_config_id = tc.id WHERE fn.id = ? AND tc.workspace_id = ?'
  ).bind(id, workspaceId).first<{ id: string; twilio_config_id: string }>();
  if (!row) return c.json({ error: 'From number not found' }, 404);

  await c.env.DB.prepare('UPDATE twilio_from_numbers SET is_default = 0 WHERE twilio_config_id = ?').bind(row.twilio_config_id).run();
  await c.env.DB.prepare('UPDATE twilio_from_numbers SET is_default = 1 WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ---------------------------------------------------------------
// Voice SDK access token (for Flutter / Web Twilio Voice SDK)
// ---------------------------------------------------------------

router.get('/api/twilio/token', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const user = c.get('user' as any) as any;
  if (!user || !user.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const platform = c.req.query('platform'); // 'android' | 'ios'
  const ttl = Math.min(parseInt(c.req.query('ttl') || '3600', 10) || 3600, 86400);

  // Per-workspace identity so any agent in the workspace can answer incoming calls.
  const identity = sanitizeClientId('ws_' + workspaceId);

  let config: any = await c.env.DB.prepare(
    'SELECT account_sid, api_key_sid, api_key_secret, voice_application_sid, push_credential_sid_android, push_credential_sid_ios FROM twilio_configs WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at ASC LIMIT 1'
  ).bind(workspaceId).first();

  if (!config) {
    return c.json({ error: 'Twilio account not configured for this workspace' }, 400);
  }
  if (!config.api_key_sid || !config.api_key_secret || !config.voice_application_sid) {
    return c.json({
      error: 'Twilio Voice SDK not configured',
      detail: 'Add the Twilio API Key SID, API Key Secret and Voice Application SID in Twilio settings to enable in-app calls.',
    }, 400);
  }

  const pushCredentialSid = platform === 'android'
    ? config.push_credential_sid_android
    : (platform === 'ios' ? config.push_credential_sid_ios : null);

  try {
    const token = await generateTwilioAccessToken(
      config.account_sid,
      config.api_key_sid,
      config.api_key_secret,
      identity,
      config.voice_application_sid,
      pushCredentialSid,
      ttl
    );
    return c.json({ token, identity, expiresIn: ttl });
  } catch (e: any) {
    console.error('[Twilio] access token generation error:', e);
    return c.json({ error: 'Failed to generate Twilio access token' }, 500);
  }
});

// ---------------------------------------------------------------
// Outbound Twilio voice call (agent in app -> customer phone)
// Now creates a conference room for two-way in-app conversation.
// ---------------------------------------------------------------

router.post('/api/twilio/call', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, contactId, twilioConfigId, fromNumber } = await c.req.json() as any;
  if (!to || typeof to !== 'string') {
    return c.json({ error: 'To number is required' }, 400);
  }

  const normalizedTo = normalizeE164(to);
  if (!/^\+\d{7,15}$/.test(normalizedTo)) {
    return c.json({ error: 'Invalid phone number. Expected a valid mobile/landline number.' }, 400);
  }

  let config: any = null;
  if (twilioConfigId) {
    config = await c.env.DB.prepare(
      'SELECT id, account_sid, auth_token FROM twilio_configs WHERE id = ? AND workspace_id = ? AND is_active = 1'
    ).bind(twilioConfigId, workspaceId).first();
  } else {
    config = await c.env.DB.prepare(
      'SELECT id, account_sid, auth_token FROM twilio_configs WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at ASC LIMIT 1'
    ).bind(workspaceId).first();
  }

  if (!config) {
    return c.json({ error: 'Twilio account not configured for this workspace' }, 400);
  }

  let fromRow: any = null;
  if (fromNumber) {
    const wanted = normalizeE164(String(fromNumber).trim());
    fromRow = await c.env.DB.prepare(
      'SELECT id, from_number FROM twilio_from_numbers WHERE twilio_config_id = ? AND from_number = ? AND is_active = 1'
    ).bind(config.id, wanted).first();
    if (!fromRow) return c.json({ error: 'Selected from number is not configured for this account' }, 400);
  } else {
    fromRow = await c.env.DB.prepare(
      'SELECT id, from_number FROM twilio_from_numbers WHERE twilio_config_id = ? AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1'
    ).bind(config.id).first();
    if (!fromRow) return c.json({ error: 'No active from number configured for this Twilio account' }, 400);
  }

  const from = normalizeE164(fromRow.from_number);
  if (!/^\+\d{7,15}$/.test(from)) {
    return c.json({ error: 'Invalid from number configured for this workspace' }, 400);
  }

  let resolvedContactId = contactId;
  if (!resolvedContactId) {
    resolvedContactId = await findOrCreateGsmContact(c.env.DB, workspaceId, normalizedTo, normalizedTo);
  }

  const callId = crypto.randomUUID();
  const conferenceName = conferenceNameFromCallId(callId);
  const createdAt = sqliteNow();

  await c.env.DB.prepare(
    "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, twilio_config_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'twilio', 'voice', 'outgoing', 'queued', 0, ?, ?, ?)"
  ).bind(callId, workspaceId, resolvedContactId, fromRow.id, normalizedTo, config.id, createdAt).run();

  const baseUrl = ((c.env as any).APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));
  const twimlUrl = baseUrl + '/api/twilio/webhook/outbound?conferenceName=' + encodeURIComponent(conferenceName);
  const statusCallback = baseUrl + '/api/twilio/webhook/status';

  const formData = new URLSearchParams();
  formData.append('To', normalizedTo);
  formData.append('From', from);
  formData.append('Url', twimlUrl);
  formData.append('StatusCallback', statusCallback);
  for (const ev of ['initiated', 'ringing', 'answered', 'completed']) {
    formData.append('StatusCallbackEvent', ev);
  }
  formData.append('StatusCallbackMethod', 'POST');
  formData.append('Method', 'POST');

  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.account_sid + '/Calls.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(config.account_sid + ':' + config.auth_token),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data: any = await res.json();

    if (!res.ok) {
      console.error('[Twilio] create call failed', data);
      await c.env.DB.prepare("UPDATE calls SET status = 'failed' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
      return c.json({ success: false, error: data.message || 'Twilio error' }, 500);
    }

    await c.env.DB.prepare(
      "UPDATE calls SET status = ?, external_call_id = ? WHERE id = ? AND workspace_id = ?"
    ).bind(data.status || 'queued', data.sid, callId, workspaceId).run();

    return c.json({ success: true, callId, callSid: data.sid, conferenceName, status: data.status, to: normalizedTo, from });
  } catch (e: any) {
    console.error('[Twilio] exception while creating call', e);
    return c.json({ success: false, error: e.message || 'Unknown error' }, 500);
  }
});

// ---------------------------------------------------------------
// Twilio webhooks
// ---------------------------------------------------------------

// Incoming PSTN call -> put caller in a conference room and invite agents.
router.post('/api/twilio/webhook/voice', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const from = body.From || '';
    const to = body.To || '';
    const callSid = body.CallSid || '';
    const direction = body.Direction || 'inbound';

    console.log('[Twilio Webhook] incoming voice call', { from, to, callSid, direction });

    if (!to || !callSid) {
      return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>', 200);
    }

    const config = await c.env.DB.prepare(
      'SELECT tc.id AS twilio_config_id, tc.workspace_id, tc.account_sid, tfn.id AS from_number_id FROM twilio_configs tc JOIN twilio_from_numbers tfn ON tc.id = tfn.twilio_config_id WHERE tfn.from_number = ? AND tc.is_active = 1 LIMIT 1'
    ).bind(to).first<{ twilio_config_id: string; workspace_id: string; account_sid: string; from_number_id: string }>();

    if (!config) {
      console.warn('[Twilio Webhook] no workspace config for dialed number', to);
      return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>', 200);
    }

    const callId = crypto.randomUUID();
    const conferenceName = conferenceNameFromCallId(callId);
    const timestamp = sqliteNow();

    const contactId = await findOrCreateGsmContact(c.env.DB, config.workspace_id, from, from);

    await c.env.DB.prepare(
      "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, twilio_config_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'twilio', 'voice', 'incoming', 'ringing', 0, ?, ?, ?)"
    ).bind(callId, config.workspace_id, contactId, config.from_number_id, from, config.twilio_config_id, callSid, timestamp).run();

    const contact = await c.env.DB.prepare('SELECT name FROM contacts WHERE id = ?').bind(contactId).first<{ name: string }>();
    const callerName = contact?.name || from;

    // Notify all online dashboard/web clients via the workspace Durable Object.
    try {
      const globalDoId = c.env.CHAT_DO.idFromName('global-' + config.workspace_id);
      const globalDo = c.env.CHAT_DO.get(globalDoId);
      await globalDo.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'twilio_incoming_call',
          callId,
          from,
          callerName,
          conferenceName,
          workspaceId: config.workspace_id,
        })
      }));
    } catch (e) {
      console.error('[Twilio Webhook] DO broadcast error:', e);
    }

    // Push notification to agents (app killed/background wake-up).
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const members = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?')
            .bind(config.workspace_id).all<{ user_id: string }>();
          if (!members.results || members.results.length === 0) return;
          const userIds = members.results.map((m) => m.user_id);
          const placeholders = userIds.map(() => '?').join(',');
          const tokens = await c.env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id IN (' + placeholders + ')')
            .bind(...userIds).all<{ token: string }>();

          const { sendPushNotification } = await import('../../lib/fcm');
          if (!tokens.results || tokens.results.length === 0) return;

          const MAX_TOTAL = 45;
          const CHUNK = 25;
          const targets = tokens.results.slice(-MAX_TOTAL);
          console.log('[Twilio Webhook] sending incoming-call push to ' + targets.length + ' token(s)');

          for (let start = 0; start < targets.length; start += CHUNK) {
            const chunk = targets.slice(start, start + CHUNK);
            const sends = await Promise.allSettled(
              chunk.map((row) =>
                sendPushNotification(
                  c.env,
                  row.token,
                  'Incoming Twilio call',
                  'Call from ' + callerName,
                  {
                    workspaceId: config.workspace_id,
                    type: 'incoming_call',
                    source: 'twilio',
                    id: callId,
                    callerNumber: from,
                    callerName,
                    conferenceName,
                    twilioConfigId: config.twilio_config_id,
                  },
                  { ttlSeconds: 0, category: 'call', sound: 'default' }
                )
              )
            );
            for (let i = 0; i < sends.length; i++) {
              const s = sends[i];
              if (s.status === 'fulfilled' && (s.value as any).unregistered) {
                await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
              }
            }
          }
        } catch (e) {
          console.error('[Twilio Webhook] push notification error:', e);
        }
      })()
    );

    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Dial>' +
      '<Conference startConferenceOnEnter="false" endConferenceOnExit="false" beep="false">' + conferenceName + '</Conference>' +
      '</Dial>' +
      '</Response>';
    return twimlResponse(xml, 200);
  } catch (e: any) {
    console.error('[Twilio Webhook] voice error:', e);
    return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>', 500);
  }
});

// Status callbacks for created calls (outbound) and inbound legs.
router.post('/api/twilio/webhook/status', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const callSid = body.CallSid || '';
    const rawStatus = body.CallStatus || '';
    const duration = parseInt(body.CallDuration || '0', 10) || 0;

    if (!callSid) {
      return c.text('OK', 200);
    }

    const statusMap: Record<string, string> = {
      initiated: 'initiated',
      ringing: 'ringing',
      'in-progress': 'in_progress',
      completed: 'ended',
      busy: 'busy',
      failed: 'failed',
      'no-answer': 'no_answer',
      canceled: 'canceled',
    };
    const status = statusMap[rawStatus] || rawStatus;

    const call = await c.env.DB.prepare('SELECT id, workspace_id FROM calls WHERE external_call_id = ?').bind(callSid).first<{ id: string; workspace_id: string }>();
    if (!call) {
      return c.text('OK', 200);
    }

    if (rawStatus === 'completed') {
      await c.env.DB.prepare(
        "UPDATE calls SET status = ?, duration = ?, ended_at = ? WHERE id = ? AND workspace_id = ?"
      ).bind(status, duration, sqliteNow(), call.id, call.workspace_id).run();
    } else {
      await c.env.DB.prepare(
        'UPDATE calls SET status = COALESCE(?, status) WHERE id = ? AND workspace_id = ?'
      ).bind(status, call.id, call.workspace_id).run();
    }

    try {
      const globalDoId = c.env.CHAT_DO.idFromName('global-' + call.workspace_id);
      const globalDo = c.env.CHAT_DO.get(globalDoId);
      await globalDo.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'call_status_updated',
          call_id: call.id,
          status,
          duration,
          source: 'twilio',
        })
      }));
    } catch (e) {
      console.error('[Twilio Webhook] status broadcast error:', e);
    }

    return c.text('OK', 200);
  } catch (e: any) {
    console.error('[Twilio Webhook] status error:', e);
    return c.text('OK', 200);
  }
});

// TwiML App voice URL used when the Flutter app places an outgoing SDK call.
router.post('/api/twilio/webhook/app', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const conferenceName = body.To || 'default_room';
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Dial>' +
      '<Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">' + conferenceName + '</Conference>' +
      '</Dial>' +
      '</Response>';
    return twimlResponse(xml, 200);
  } catch (e: any) {
    console.error('[Twilio Webhook] app error:', e);
    return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', 500);
  }
});

// Outbound answer URL: when Twilio connects to the customer's phone, put
// them in the same conference room that the agent app is joining.
router.post('/api/twilio/webhook/outbound', async (c) => {
  try {
    const conferenceName = c.req.query('conferenceName') || 'default_room';
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Dial>' +
      '<Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">' + conferenceName + '</Conference>' +
      '</Dial>' +
      '</Response>';
    return twimlResponse(xml, 200);
  } catch (e: any) {
    console.error('[Twilio Webhook] outbound error:', e);
    return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', 500);
  }
});

export default router;
