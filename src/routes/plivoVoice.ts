import { Hono, Context } from 'hono';
import { Env } from '../types';
import { sqliteNow, requireRole } from '../shared';
import { normalizeE164 } from '../utils/phoneUtils';

// ---------------------------------------------------------------------------
// Plivo voice provider (PSTN bridge). Mirrors twilioVoice.ts but talks to the
// Plivo Voice API with raw fetch (no Plivo SDK).
//
// MVP call model:
//   * Outbound: fire the customer leg and the agent's PSTN phone leg together
//     into the SAME Plivo conference (fallback bridge). The authenticated
//     agent's phone is read from users.phone.
//   * Inbound:  the caller is placed in a conference waiting room with hold
//     music; if a "live" agent exists, their PSTN phone is dialed into the
//     same conference. When the caller hangs up, the conference is deleted and
//     a "busy" agent is restored to "live".
// ---------------------------------------------------------------------------


function maskAuthToken(token: string): string {
  if (!token || token.length <= 4) return '****';
  return '****' + token.slice(-4);
}

function conferenceNameFromCallId(callId: string): string {
  return 'conf_' + callId.replace(/-/g, '');
}

function plivoApiBase(authId: string): string {
  return 'https://api.plivo.com/v1/Account/' + encodeURIComponent(authId) + '/';
}

function plivoAuthHeader(authId: string, authToken: string): string {
  return 'Basic ' + btoa(authId + ':' + authToken);
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
const HOLD_MUSIC_URL = 'https://s3.amazonaws.com/plivocloud/music.mp3';

async function parseWebhookBody(c: any): Promise<Record<string, string>> {
  const parsed = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = Array.isArray(v) ? v[0] : String(v ?? '');
  }
  return out;
}


function getBaseUrl(c: Context): string {
  const env = c.env as any;
  return (env.APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));
}

function plivoXmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

// Plivo V3 signature validation (matches plivo-node SDK's validateV3Signature).
// X-Plivo-Signature-V3 is HMAC-SHA256(auth_token, assembledUrl + '.' + nonce),
// base64-encoded. For POST the assembled string is: scheme://host:port/path
// + '?' + sorted query params (key=value&...) + '.' + sorted body params
// (key+value concatenated), then '.' + nonce.
async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function plivoSortedQueryString(params: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const key of Object.keys(params).sort()) {
    const values = (params[key] || []).slice().sort();
    for (const value of values) parts.push(key + '=' + value);
  }
  return parts.join('&');
}

function plivoSortedParamsString(params: Record<string, string[]>): string {
  let out = '';
  for (const key of Object.keys(params).sort()) {
    const values = (params[key] || []).slice().sort();
    for (const value of values) out += key + value;
  }
  return out;
}

function plivoConstructGetUrl(uri: string, params: Record<string, string[]>, emptyPostParams = true): string {
  const u = new URL(uri);
  const base = u.protocol + '//' + u.host + u.pathname;
  const merged: Record<string, string[]> = {};
  for (const [k, v] of u.searchParams.entries()) {
    if (!merged[k]) merged[k] = [];
    merged[k].push(v);
  }
  for (const [k, values] of Object.entries(params)) {
    if (!merged[k]) merged[k] = [];
    merged[k].push(...values);
  }
  const q = plivoSortedQueryString(merged);
  let out = base;
  if (q.length > 0 || !emptyPostParams) out += '?' + q;
  if (q.length > 0 && !emptyPostParams) out += '.';
  return out;
}

function plivoConstructPostUrl(uri: string, params: Record<string, string[]>): string {
  const empty = Object.keys(params).length === 0;
  const base = plivoConstructGetUrl(uri, {}, empty);
  return base + plivoSortedParamsString(params);
}

function plivoBodyToParams(body: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = [v];
  }
  return out;
}

async function verifyPlivoSignature(c: any, authToken: string | undefined, body: Record<string, string>): Promise<boolean> {
  if (!authToken) return false;
  const signature: string = c.req.header('X-Plivo-Signature-V3') || '';
  const nonce: string = c.req.header('X-Plivo-Signature-V3-Nonce') || '';
  if (!signature || !nonce) return false;
  const method: string = c.req.method;
  const uri: string = c.req.url;
  let baseUrl: string = uri;
  if (method === 'GET') {
    baseUrl = plivoConstructGetUrl(uri, {});
  } else if (method === 'POST') {
    baseUrl = plivoConstructPostUrl(uri, plivoBodyToParams(body));
  } else {
    return false;
  }
  const expected = await hmacSha256Base64(authToken, baseUrl + '.' + nonce);
  return signature.split(',').some((s) => s === expected);
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

function dialedNumberCandidates(to: string): string[] {
  const trimmed = (to || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidates = Array.from(new Set([trimmed, '+' + digits, digits])).filter(Boolean);
  // The inbound lookup uses `IN (?, ?, ?)`. Always return exactly 3 values so we
  // never bind `undefined` (D1 throws on undefined, which 500s the webhook and
  // causes Plivo to hang up the caller). The trailing '' sentinel cannot match any
  // stored E.164 number.
  while (candidates.length < 3) candidates.push('');
  return candidates;
}

async function pickAvailableAgent(db: D1Database, workspaceId: string) {
  return db.prepare(
    "SELECT wm.user_id, u.phone FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ? AND wm.voice_status = 'live' AND u.phone IS NOT NULL AND TRIM(u.phone) != '' ORDER BY wm.voice_status_updated_at ASC LIMIT 1"
  ).bind(workspaceId).first<{ user_id: string; phone: string }>();
}

async function createPlivoCall(config: { auth_id: string; auth_token: string }, payload: Record<string, string>): Promise<{ ok: boolean; requestUuid?: string; message?: string; error?: string; status?: number }> {
  const url = plivoApiBase(config.auth_id) + 'Call/';
  const headers = {
    Authorization: plivoAuthHeader(config.auth_id, config.auth_token),
    'Content-Type': 'application/json',
  };
  let lastError = 'Plivo call request failed';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      if (res.status === 429) {
        // Plivo's rate limit is 300 requests per 5 seconds per account.
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      const data: any = await res.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
      if (!res.ok) {
        console.error('[Plivo] create call failed', res.status, JSON.stringify(data));
        return { ok: false, error: (data && (data.error || data.message)) || ('Plivo HTTP ' + res.status), status: res.status };
      }
      return { ok: true, requestUuid: data.request_uuid, message: data.message };
    } catch (e: any) {
      lastError = e?.message || 'Plivo call request exception';
      console.error('[Plivo] create call exception', e);
    }
  }
  return { ok: false, error: lastError, status: 429 };
}

async function hangupPlivoConference(config: { auth_id: string; auth_token: string }, conferenceName: string): Promise<boolean> {
  try {
    const url = plivoApiBase(config.auth_id) + 'Conference/' + encodeURIComponent(conferenceName) + '/';
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: plivoAuthHeader(config.auth_id, config.auth_token) },
    });
    if (res.status === 204 || res.ok || res.status === 404) return true;
    const data: any = await res.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
    console.warn('[Plivo] conference hangup returned', res.status, JSON.stringify(data));
    return false;
  } catch (e) {
    console.error('[Plivo] conference hangup exception', e);
    return false;
  }
}

async function hangupPlivoCallLeg(config: { auth_id: string; auth_token: string }, callUuid: string): Promise<void> {
  try {
    const url = plivoApiBase(config.auth_id) + 'Call/' + encodeURIComponent(callUuid) + '/';
    await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: plivoAuthHeader(config.auth_id, config.auth_token) },
    });
  } catch (e) {
    console.warn('[Plivo] call leg hangup exception (ignored):', e);
  }
}

function randomAlnum(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function softphoneAppPayload(baseUrl: string) {
  return {
    answer_url: baseUrl + '/api/plivo/webhook/app',
    answer_method: 'POST',
    fallback_answer_url: baseUrl + '/api/plivo/webhook/app?fallback=1',
    fallback_method: 'POST',
    hangup_url: baseUrl + '/api/plivo/webhook/status?leg=softphone',
    hangup_method: 'POST',
  } as const;
}

function incomingAppPayload(baseUrl: string) {
  return {
    answer_url: baseUrl + '/api/plivo/webhook/voice',
    answer_method: 'POST',
    fallback_answer_url: baseUrl + '/api/plivo/webhook/fallback',
    fallback_method: 'POST',
    hangup_url: baseUrl + '/api/plivo/webhook/status?leg=inbound',
    hangup_method: 'POST',
  } as const;
}

function shouldUpdateApp(app: any, payload: any) {
  return !app.answer_url ||
    app.answer_url !== payload.answer_url ||
    app.fallback_answer_url !== payload.fallback_answer_url ||
    app.hangup_url !== payload.hangup_url ||
    app.answer_method !== payload.answer_method;
}

async function findOrCreateIncomingApp(config: { auth_id: string; auth_token: string }, appName: string, baseUrl: string): Promise<{ ok: boolean; appId?: string; error?: string; status?: number }> {
  const base = plivoApiBase(config.auth_id);
  const headers = {
    Authorization: plivoAuthHeader(config.auth_id, config.auth_token),
    'Content-Type': 'application/json',
  };
  const payload = incomingAppPayload(baseUrl);

  try {
    const listRes = await fetch(base + 'Application/?limit=20', { headers });
    if (listRes.ok) {
      const data: any = await listRes.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
      const apps = (data && Array.isArray(data.objects)) ? data.objects : [];
      for (const app of apps) {
        if (app && app.app_id && app.app_name === appName) {
          if (shouldUpdateApp(app, payload)) {
            await fetch(base + 'Application/' + encodeURIComponent(app.app_id) + '/', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            }).catch(() => {});
          }
          return { ok: true, appId: app.app_id };
        }
      }
    }
  } catch (e) {
    console.warn('[Plivo] list incoming applications failed (will create new):', e);
  }

  try {
    const res = await fetch(base + 'Application/', {
      method: 'POST',
      headers,
      body: JSON.stringify({ app_name: appName, ...payload }),
    });
    const data: any = await res.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
    if (!res.ok) {
      console.error('[Plivo] create incoming application failed', res.status, JSON.stringify(data));
      return { ok: false, error: data.error || 'Failed to create incoming application', status: res.status };
    }
    return { ok: true, appId: data.app_id };
  } catch (e: any) {
    console.error('[Plivo] create incoming application exception', e);
    return { ok: false, error: e?.message || 'Plivo incoming application request exception' };
  }
}

async function findOrCreateSoftphoneApp(config: { auth_id: string; auth_token: string }, appName: string, baseUrl: string): Promise<{ ok: boolean; appId?: string; error?: string; status?: number }> {
  const base = plivoApiBase(config.auth_id);
  const headers = {
    Authorization: plivoAuthHeader(config.auth_id, config.auth_token),
    'Content-Type': 'application/json',
  };

  try {
    const listRes = await fetch(base + 'Application/?limit=20', { headers });
    if (listRes.ok) {
      const data: any = await listRes.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
      const apps = (data && Array.isArray(data.objects)) ? data.objects : [];
      for (const app of apps) {
        if (app && app.app_id && app.app_name === appName) {
          const payload = softphoneAppPayload(baseUrl);
          if (shouldUpdateApp(app, payload)) {
            await fetch(base + 'Application/' + encodeURIComponent(app.app_id) + '/', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            }).catch(() => {});
          }
          return { ok: true, appId: app.app_id };
        }
      }
    }
  } catch (e) {
    console.warn('[Plivo] list applications failed (will create new):', e);
  }

  try {
    const payload = softphoneAppPayload(baseUrl);
    const res = await fetch(base + 'Application/', {
      method: 'POST',
      headers,
      body: JSON.stringify({ app_name: appName, ...payload }),
    });
    const data: any = await res.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
    if (!res.ok) {
      console.error('[Plivo] create application failed', res.status, JSON.stringify(data));
      return { ok: false, error: (data && (data.error || data.message)) || ('Plivo HTTP ' + res.status), status: res.status };
    }
    return { ok: true, appId: data.app_id };
  } catch (e: any) {
    console.error('[Plivo] create application exception', e);
    return { ok: false, error: e?.message || 'Plivo application request exception' };
  }
}

async function createPlivoEndpoint(config: { auth_id: string; auth_token: string }, payload: { username: string; password: string; alias: string; app_id?: string }): Promise<{ ok: boolean; username?: string; endpointId?: string; error?: string; status?: number }> {
  const url = plivoApiBase(config.auth_id) + 'Endpoint/';
  const headers = {
    Authorization: plivoAuthHeader(config.auth_id, config.auth_token),
    'Content-Type': 'application/json',
  };
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data: any = await res.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
    if (!res.ok) {
      console.error('[Plivo] create endpoint failed', res.status, JSON.stringify(data));
      return { ok: false, error: (data && (data.error || data.message)) || ('Plivo HTTP ' + res.status), status: res.status };
    }
    return { ok: true, username: data.username, endpointId: data.endpoint_id };
  } catch (e: any) {
    console.error('[Plivo] create endpoint exception', e);
    return { ok: false, error: e?.message || 'Plivo endpoint request exception' };
  }
}

async function deletePlivoEndpoint(config: { auth_id: string; auth_token: string }, endpointId: string): Promise<void> {
  try {
    const url = plivoApiBase(config.auth_id) + 'Endpoint/' + encodeURIComponent(endpointId) + '/';
    await fetch(url, { method: 'DELETE', headers: { Authorization: plivoAuthHeader(config.auth_id, config.auth_token) } });
  } catch (e) {
    console.warn('[Plivo] endpoint delete exception (ignored):', e);
  }
}

async function broadcastToWorkspace(env: Env, workspaceId: string, payload: any) {
  try {
    const globalDoId = env.CHAT_DO.idFromName('global-' + workspaceId);
    const globalDo = env.CHAT_DO.get(globalDoId);
    await globalDo.fetch(new Request('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  } catch (e) {
    console.error('[Plivo] DO broadcast error:', e);
  }
}

// Restore a busy agent to live and tear down the Plivo conference (the
// conference DELETE disconnects every remaining member, e.g. the agent leg).
async function cleanupPlivoCall(env: Env, call: { id: string; workspace_id: string; plivo_config_id?: string | null; assigned_user_id?: string | null }) {
  if (call.assigned_user_id) {
    await env.DB.prepare(
      "UPDATE workspace_members SET voice_status = 'live', voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ? AND voice_status = 'busy'"
    ).bind(sqliteNow(), call.workspace_id, call.assigned_user_id).run();
  }
  if (call.plivo_config_id) {
    const cfg = await env.DB.prepare('SELECT auth_id, auth_token FROM plivo_configs WHERE id = ?')
      .bind(call.plivo_config_id).first<{ auth_id: string; auth_token: string }>();
    if (cfg) {
      await hangupPlivoConference(cfg, conferenceNameFromCallId(call.id));
    }
  }
}

async function pushIncomingCallToAgents(env: Env, c: any, workspaceId: string, callId: string, from: string, callerName: string, conferenceName: string, plivoConfigId: string, answerInApp: boolean) {
  c.executionCtx.waitUntil(
    (async () => {
      try {
        // Only available (live) agents should receive an in-app CallKit ring.
        // For the informational PSTN-forward notification (auto-dial ON) we keep
        // the existing all-members behavior (the dialed agent is already busy).
        const liveOnly = answerInApp ? " AND voice_status = 'live'" : '';
        const members = await env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?' + liveOnly)
          .bind(workspaceId).all<{ user_id: string }>();
        if (!members.results || members.results.length === 0) return;

        // Notify the Web Dashboard via WebSocket so the agent can answer
        if (answerInApp) {
          await broadcastToWorkspace(env, workspaceId, {
            type: 'plivo_incoming_call',
            callId,
            from,
            callerName,
            conferenceName,
            workspaceId,
          });
        }

        const userIds = members.results.map((m) => m.user_id);
        const placeholders = userIds.map(() => '?').join(',');
        const tokens = await env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id IN (' + placeholders + ')')
          .bind(...userIds).all<{ token: string }>();

        const { sendPushNotification } = await import('../../lib/fcm');
        if (!tokens.results || tokens.results.length === 0) return;

        const MAX_TOTAL = 45;
        const CHUNK = 25;
        const targets = tokens.results.slice(-MAX_TOTAL);
        for (let start = 0; start < targets.length; start += CHUNK) {
          const chunk = targets.slice(start, start + CHUNK);
          const sends = await Promise.allSettled(
            chunk.map((row) =>
              sendPushNotification(
                env,
                row.token,
                'Incoming Plivo call',
                'Call from ' + callerName,
                {
                  workspaceId,
                  type: answerInApp ? 'incoming_call' : 'plivo_incoming_call',
                  source: 'plivo',
                  id: callId,
                  callerNumber: from,
                  callerName,
                  conferenceName,
                  plivoConfigId,
                },
                { ttlSeconds: 0, category: 'call', sound: 'default', dataOnly: true }
              )
            )
          );
          for (let i = 0; i < sends.length; i++) {
            const s = sends[i];
            if (s.status === 'fulfilled' && (s.value as any).unregistered) {
              await env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(chunk[i].token).run();
            }
          }
        }
      } catch (e) {
        console.error('[Plivo Webhook] push notification error:', e);
      }
    })()
  );
}

const router = new Hono<{ Bindings: Env; Variables: { user: any; workspaceRole?: string } }>();

// ---------------------------------------------------------------
// Workspace Plivo account management
// ---------------------------------------------------------------

router.get('/api/plivo/configs', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, auth_id, auth_token, is_active, auto_dial_agents, endpoint_username, endpoint_password, voice_bot_enabled, office_hours_start, office_hours_end, created_at, updated_at FROM plivo_configs WHERE workspace_id = ? ORDER BY created_at ASC'
  ).bind(workspaceId).all<{ id: string; name: string; auth_id: string; auth_token: string; is_active: number; auto_dial_agents: number; endpoint_username: string | null; endpoint_password: string | null; voice_bot_enabled: number; office_hours_start: string; office_hours_end: string; created_at: string; updated_at: string }>();

  const configs: any[] = [];
  for (const cfg of results || []) {
    const nums = await c.env.DB.prepare(
      'SELECT id, from_number, is_default, is_active FROM plivo_from_numbers WHERE plivo_config_id = ? ORDER BY is_default DESC, created_at ASC'
    ).bind(cfg.id).all<{ id: string; from_number: string; is_default: number; is_active: number }>();

    configs.push({
      id: cfg.id,
      name: cfg.name,
      authId: cfg.auth_id,
      authTokenMasked: maskAuthToken(cfg.auth_token),
      isActive: cfg.is_active === 1,
      autoDialAgents: cfg.auto_dial_agents === 1,
      endpointUsername: cfg.endpoint_username ?? '',
      endpointPasswordMasked: cfg.endpoint_password ? maskAuthToken(cfg.endpoint_password) : '',
      endpointConfigured: !!(cfg.endpoint_username && cfg.endpoint_password),
      voiceBotEnabled: cfg.voice_bot_enabled === 1,
      officeHoursStart: cfg.office_hours_start || '09:00',
      officeHoursEnd: cfg.office_hours_end || '16:00',
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

router.post('/api/plivo/configs', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { name, authId, authToken, fromNumbers, autoDialAgents, endpointUsername, endpointPassword, voiceBotEnabled, officeHoursStart, officeHoursEnd } = await c.req.json() as any;
  if (!authId || !authToken) {
    return c.json({ error: 'authId and authToken are required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO plivo_configs (id, workspace_id, name, auth_id, auth_token, is_active, auto_dial_agents, endpoint_username, endpoint_password, voice_bot_enabled, office_hours_start, office_hours_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, workspaceId, name || 'My Plivo Account', authId, authToken, autoDialAgents === false ? 0 : 1, 
    endpointUsername || null, endpointPassword || null, 
    voiceBotEnabled === false ? 0 : 1, officeHoursStart || '09:00', officeHoursEnd || '16:00', 
    sqliteNow(), sqliteNow()
  ).run();

  const nums = Array.isArray(fromNumbers) ? fromNumbers.filter((n: any) => typeof n === 'string' && n.trim()) : [];

  // Incoming PSTN numbers must be linked to a Plivo voice application, otherwise
  // incoming calls on those numbers never reach /api/plivo/webhook/voice. Link them
  // here (same flow as POST /api/plivo/configs/:id/from-numbers) so numbers added
  // while creating a config are immediately usable.
  const linkedNumbers: string[] = [];
  const failedNumbers: { from: string; error: string }[] = [];
  if (nums.length > 0) {
    const baseUrl = getBaseUrl(c as Context);
    const incomingAppName = 'DheeTantra-Incoming-Voice-' + workspaceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
    const incomingApp = await findOrCreateIncomingApp({ auth_id: authId, auth_token: authToken }, incomingAppName, baseUrl);

    if (incomingApp.ok && incomingApp.appId) {
      for (let i = 0; i < nums.length; i++) {
        const from = normalizeE164(String(nums[i]).trim());
        if (!/^\+\d{7,15}$/.test(from)) {
          failedNumbers.push({ from, error: 'Invalid from number. Use a valid E.164 number like +919669509952' });
          continue;
        }
        const numberUpdateUrl = plivoApiBase(authId) + 'Number/' + encodeURIComponent(from.replace(/^\+/, '')) + '/';
        const numUpdateRes = await fetch(numberUpdateUrl, {
          method: 'POST',
          headers: {
            Authorization: plivoAuthHeader(authId, authToken),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ app_id: incomingApp.appId }),
        });
        if (!numUpdateRes.ok) {
          const numErr: any = await numUpdateRes.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
          console.error('[Plivo] config-create number app link failed', numUpdateRes.status, JSON.stringify(numErr));
          failedNumbers.push({ from, error: numErr.error || ('Plivo HTTP ' + numUpdateRes.status) });
          continue;
        }
        await c.env.DB.prepare(
          'INSERT INTO plivo_from_numbers (id, plivo_config_id, from_number, is_default, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
        ).bind(crypto.randomUUID(), id, from, linkedNumbers.length === 0 ? 1 : 0, sqliteNow()).run();
        linkedNumbers.push(from);
      }
    } else {
      for (let i = 0; i < nums.length; i++) {
        failedNumbers.push({ from: normalizeE164(String(nums[i]).trim()), error: incomingApp.error || 'Failed to create incoming voice application' });
      }
    }
  }

  return c.json({ success: true, configId: id, linkedNumbers, failedNumbers });
});

router.put('/api/plivo/configs/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM plivo_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
  if (!existing) return c.json({ error: 'Plivo config not found' }, 404);

  const body = await c.req.json() as any;
  const updates: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.authId !== undefined) { updates.push('auth_id = ?'); params.push(body.authId); }
  if (body.authToken !== undefined && body.authToken) { updates.push('auth_token = ?'); params.push(body.authToken); }
  if (body.isActive !== undefined) { updates.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (body.autoDialAgents !== undefined) { updates.push('auto_dial_agents = ?'); params.push(body.autoDialAgents ? 1 : 0); }
  if (body.endpointUsername !== undefined) { updates.push('endpoint_username = ?'); params.push(body.endpointUsername || null); }
  if (body.endpointPassword !== undefined && body.endpointPassword) { updates.push('endpoint_password = ?'); params.push(body.endpointPassword); }
  if (body.voiceBotEnabled !== undefined) { updates.push('voice_bot_enabled = ?'); params.push(body.voiceBotEnabled ? 1 : 0); }
  if (body.officeHoursStart !== undefined) { updates.push('office_hours_start = ?'); params.push(body.officeHoursStart); }
  if (body.officeHoursEnd !== undefined) { updates.push('office_hours_end = ?'); params.push(body.officeHoursEnd); }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  updates.push('updated_at = ?');
  params.push(sqliteNow());
  params.push(id, workspaceId);

  await c.env.DB.prepare('UPDATE plivo_configs SET ' + updates.join(', ') + ' WHERE id = ? AND workspace_id = ?').bind(...params).run();
  return c.json({ success: true });
});

router.post('/api/plivo/configs/:id/link', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const config = await c.env.DB.prepare(
    'SELECT id, auth_id, auth_token, endpoint_username, endpoint_password, endpoint_id, endpoint_app_id FROM plivo_configs WHERE id = ? AND workspace_id = ?'
  ).bind(id, workspaceId).first<{ id: string; auth_id: string; auth_token: string; endpoint_username: string | null; endpoint_password: string | null; endpoint_id: string | null; endpoint_app_id: string | null }>();
  if (!config) return c.json({ error: 'Plivo config not found' }, 404);

  const body = (await c.req.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; })) as any;
  const force = body?.force === true;

  const baseUrl = getBaseUrl(c as Context);
  const answerUrl = baseUrl + '/api/plivo/webhook/app';
  const appName = 'DheeTantra-Softphone-' + workspaceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);

  // Already linked -> idempotent; force=true re-creates the endpoint.
  if (!force && config.endpoint_username && config.endpoint_password) {
    let appId = config.endpoint_app_id;
    if (!appId) {
      const existingApp = await findOrCreateSoftphoneApp({ auth_id: config.auth_id, auth_token: config.auth_token }, appName, baseUrl);
      if (existingApp.ok && existingApp.appId) {
        appId = existingApp.appId;
        await c.env.DB.prepare('UPDATE plivo_configs SET endpoint_app_id = ?, updated_at = ? WHERE id = ?').bind(appId, sqliteNow(), id).run();
      }
    }
    return c.json({
      success: true,
      endpointUsername: config.endpoint_username,
      sipUri: 'sip:' + config.endpoint_username + '@phone.plivo.com',
      applicationSipUri: appId ? 'sip:' + appId + '@app.plivo.com' : null,
      alreadyLinked: true,
    });
  }

  const app = await findOrCreateSoftphoneApp({ auth_id: config.auth_id, auth_token: config.auth_token }, appName, baseUrl);
  if (!app.ok) {
    return c.json({ error: app.error || 'Failed to create Plivo softphone application' }, 502);
  }

  if (force && config.endpoint_id) {
    await deletePlivoEndpoint({ auth_id: config.auth_id, auth_token: config.auth_token }, config.endpoint_id);
  }

  const username = 'dhee' + randomAlnum(8);
  const password = randomAlnum(20);
  const endpointRes = await createPlivoEndpoint(
    { auth_id: config.auth_id, auth_token: config.auth_token },
    { username, password, alias: 'DheeTantra-Softphone', app_id: app.appId }
  );
  if (!endpointRes.ok) {
    return c.json({ error: endpointRes.error || 'Failed to create Plivo SIP endpoint' }, 502);
  }

  const endpointUsername = endpointRes.username || username;
  const appId = app.appId || null;
  await c.env.DB.prepare(
    'UPDATE plivo_configs SET endpoint_username = ?, endpoint_password = ?, endpoint_id = ?, endpoint_app_id = ?, updated_at = ? WHERE id = ?'
  ).bind(endpointUsername, password, endpointRes.endpointId || null, appId, sqliteNow(), id).run();

  return c.json({
    success: true,
    endpointUsername,
    sipUri: 'sip:' + endpointUsername + '@phone.plivo.com',
    applicationSipUri: appId ? 'sip:' + appId + '@app.plivo.com' : null,
    alreadyLinked: false,
  });
});

router.delete('/api/plivo/configs/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare('SELECT id, auth_id, auth_token, endpoint_id FROM plivo_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first<{ id: string; auth_id: string; auth_token: string; endpoint_id: string | null }>();
  if (!existing) return c.json({ error: 'Plivo config not found' }, 404);

  if (existing.endpoint_id) {
    await deletePlivoEndpoint({ auth_id: existing.auth_id, auth_token: existing.auth_token }, existing.endpoint_id);
  }

  await c.env.DB.prepare('DELETE FROM plivo_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
  return c.json({ success: true });
});

router.post('/api/plivo/configs/:id/from-numbers', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const configId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const config = await c.env.DB.prepare('SELECT id, auth_id, auth_token FROM plivo_configs WHERE id = ? AND workspace_id = ?').bind(configId, workspaceId).first<{ id: string; auth_id: string; auth_token: string }>();
  if (!config) return c.json({ error: 'Plivo config not found' }, 404);

  const { fromNumber, isDefault } = await c.req.json() as any;
  if (!fromNumber) return c.json({ error: 'fromNumber is required' }, 400);

  const normalized = normalizeE164(String(fromNumber).trim());
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return c.json({ error: 'Invalid from number. Use a valid E.164 number like +919669509952' }, 400);
  }

  const existingNum = await c.env.DB.prepare('SELECT id FROM plivo_from_numbers WHERE plivo_config_id = ? AND from_number = ?').bind(configId, normalized).first();
  if (existingNum) return c.json({ error: 'This from number is already added' }, 409);

  // Plivo ke official docs ke anusaar: number ko incoming application se link karna padta hai.
  // https://www.plivo.com/docs/numbers/account-phone-numbers#update-an-account-phone-number
  const baseUrl = getBaseUrl(c as Context);
  const incomingAppName = 'DheeTantra-Incoming-Voice-' + workspaceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
  const incomingApp = await findOrCreateIncomingApp({ auth_id: config.auth_id, auth_token: config.auth_token }, incomingAppName, baseUrl);
  if (!incomingApp.ok || !incomingApp.appId) {
    return c.json({ error: incomingApp.error || 'Failed to create incoming voice application' }, 502);
  }

  const numberUpdateUrl = plivoApiBase(config.auth_id) + 'Number/' + encodeURIComponent(normalized.replace(/^\+/, '')) + '/';
  const numUpdateRes = await fetch(numberUpdateUrl, {
    method: 'POST',
    headers: {
      Authorization: plivoAuthHeader(config.auth_id, config.auth_token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ app_id: incomingApp.appId }),
  });
  if (!numUpdateRes.ok) {
    const numErr: any = await numUpdateRes.json().catch((err) => { console.error('[Plivo] fetch error:', err); return {}; });
    console.error('[Plivo] number app link failed', numUpdateRes.status, JSON.stringify(numErr));
    return c.json({ error: numErr.error || 'Failed to link Plivo number to incoming application' }, 502);
  }

  if (isDefault) {
    await c.env.DB.prepare('UPDATE plivo_from_numbers SET is_default = 0 WHERE plivo_config_id = ?').bind(configId).run();
  }

  const numId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO plivo_from_numbers (id, plivo_config_id, from_number, is_default, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).bind(numId, configId, normalized, isDefault ? 1 : 0, sqliteNow()).run();

  return c.json({ success: true, fromNumberId: numId, fromNumber: normalized });
});

router.delete('/api/plivo/from-numbers/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT fn.id FROM plivo_from_numbers fn JOIN plivo_configs tc ON fn.plivo_config_id = tc.id WHERE fn.id = ? AND tc.workspace_id = ?'
  ).bind(id, workspaceId).first();
  if (!row) return c.json({ error: 'From number not found' }, 404);

  await c.env.DB.prepare('DELETE FROM plivo_from_numbers WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

router.post('/api/plivo/from-numbers/:id/default', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT fn.id, fn.plivo_config_id FROM plivo_from_numbers fn JOIN plivo_configs tc ON fn.plivo_config_id = tc.id WHERE fn.id = ? AND tc.workspace_id = ?'
  ).bind(id, workspaceId).first<{ id: string; plivo_config_id: string }>();
  if (!row) return c.json({ error: 'From number not found' }, 404);

  await c.env.DB.prepare('UPDATE plivo_from_numbers SET is_default = 0 WHERE plivo_config_id = ?').bind(row.plivo_config_id).run();
  await c.env.DB.prepare('UPDATE plivo_from_numbers SET is_default = 1 WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ---------------------------------------------------------------
// Softphone (SIP) credentials for in-app Plivo answering. The Flutter
// app registers a SIP endpoint against phone.plivo.com using these and
// then joins the inbound caller's conference via a SIP outbound call.
// ---------------------------------------------------------------
router.get('/api/plivo/sip-credentials', async (c) => {
  const user = c.get('user') as any;
  if (!user || !user.id) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const cfg = await c.env.DB.prepare(
    "SELECT endpoint_username, endpoint_password, endpoint_app_id FROM plivo_configs WHERE workspace_id = ? AND is_active = 1 AND endpoint_username IS NOT NULL AND endpoint_username != '' AND endpoint_password IS NOT NULL AND endpoint_password != '' ORDER BY created_at ASC LIMIT 1"
  ).bind(workspaceId).first<{ endpoint_username: string; endpoint_password: string; endpoint_app_id: string | null } | null>();

  if (!cfg || !cfg.endpoint_username || !cfg.endpoint_password) {
    return c.json({ error: 'Plivo softphone endpoint not configured' }, 400);
  }

  return c.json({
    username: cfg.endpoint_username,
    password: cfg.endpoint_password,
    server: 'phone.plivo.com',
    domain: 'phone.plivo.com',
    port: 5060,
    transport: 'UDP/TCP',
    sipUri: `sip:${cfg.endpoint_username}@phone.plivo.com`,
    applicationSipUri: cfg.endpoint_app_id ? `sip:${cfg.endpoint_app_id}@app.plivo.com` : null,
  });
});

// ---------------------------------------------------------------
// Outbound Plivo voice call (fallback bridge: customer + agent legs
// are fired together into the same Plivo conference).
// ---------------------------------------------------------------

router.post('/api/plivo/call', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const user = c.get('user') as any;
  if (!user || !user.id) return c.json({ error: 'Authentication required' }, 401);

  const { to, contactId, plivoConfigId, fromNumber, mode, inApp } = await c.req.json() as any;
  if (!to || typeof to !== 'string') {
    return c.json({ error: 'To number is required' }, 400);
  }

  const normalizedTo = normalizeE164(to);
  if (!/^\+\d{7,15}$/.test(normalizedTo)) {
    return c.json({ error: 'Invalid phone number. Expected a valid mobile/landline number.' }, 400);
  }

  let config: any = null;
  if (plivoConfigId) {
    config = await c.env.DB.prepare(
      'SELECT id, auth_id, auth_token, auto_dial_agents FROM plivo_configs WHERE id = ? AND workspace_id = ? AND is_active = 1'
    ).bind(plivoConfigId, workspaceId).first();
  } else {
    config = await c.env.DB.prepare(
      'SELECT id, auth_id, auth_token, auto_dial_agents FROM plivo_configs WHERE workspace_id = ? AND is_active = 1 ORDER BY created_at ASC LIMIT 1'
    ).bind(workspaceId).first();
  }

  if (!config) {
    return c.json({ error: 'Plivo account not configured for this workspace' }, 400);
  }

  let fromRow: any = null;
  if (fromNumber) {
    const wanted = normalizeE164(String(fromNumber).trim());
    fromRow = await c.env.DB.prepare(
      'SELECT id, from_number FROM plivo_from_numbers WHERE plivo_config_id = ? AND from_number = ? AND is_active = 1'
    ).bind(config.id, wanted).first();
    if (!fromRow) return c.json({ error: 'Selected from number is not configured for this account' }, 400);
  } else {
    fromRow = await c.env.DB.prepare(
      'SELECT id, from_number FROM plivo_from_numbers WHERE plivo_config_id = ? AND is_active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1'
    ).bind(config.id).first();
    if (!fromRow) return c.json({ error: 'No active from number configured for this Plivo account' }, 400);
  }

  const from = normalizeE164(fromRow.from_number);
  if (!/^\+\d{7,15}$/.test(from)) {
    return c.json({ error: 'Invalid from number configured for this workspace' }, 400);
  }

  const autoDialAgents = config.auto_dial_agents === 1;

  let resolvedContactId = contactId;
  if (!resolvedContactId) {
    resolvedContactId = await findOrCreateGsmContact(c.env.DB, workspaceId, normalizedTo, normalizedTo);
  }

  const callId = crypto.randomUUID();
  const conferenceName = conferenceNameFromCallId(callId);
  const createdAt = sqliteNow();
  const baseUrl = getBaseUrl(c as Context);
  const statusUrl = baseUrl + '/api/plivo/webhook/status?callId=' + callId;
  const fallbackUrl = baseUrl + '/api/plivo/webhook/fallback';

  // In-app (softphone) answering mode: fire only the customer leg into a
  // conference waiting room. The agent's app answers via the Plivo softphone
  // endpoint (same flow as inbound with auto-forward OFF).
  if (mode === 'in_app' || inApp === true || !autoDialAgents) {
    await c.env.DB.prepare(
      "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, plivo_config_id, assigned_user_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'plivo', 'voice', 'outgoing', 'ringing', 0, ?, ?, ?, ?)"
    ).bind(callId, workspaceId, resolvedContactId, fromRow.id, normalizedTo, config.id, user.id, null, createdAt).run();

    const answerUrl = baseUrl + '/api/plivo/webhook/outbound?callId=' + callId + '&conferenceName=' + encodeURIComponent(conferenceName) + '&leg=customer&waiting=1';

    const customerRes = await createPlivoCall(config, {
      to: normalizedTo,
      from: from,
      answer_url: answerUrl,
      answer_method: 'POST',
      ring_url: statusUrl + '&leg=customer',
      ring_method: 'POST',
      hangup_url: statusUrl + '&leg=customer',
      hangup_method: 'POST',
      fallback_url: fallbackUrl,
      fallback_method: 'POST',
    });

    if (!customerRes.ok) {
      console.error('[Plivo] outbound customer leg failed', customerRes);
      await c.env.DB.prepare("UPDATE calls SET status = 'failed' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
      return c.json({ success: false, error: customerRes.error || 'Failed to fire Plivo call leg' }, 502);
    }

    const customerRequestUuid = customerRes.requestUuid || null;
    await c.env.DB.prepare(
      'UPDATE calls SET external_call_id = ? WHERE id = ? AND workspace_id = ?'
    ).bind(customerRequestUuid, callId, workspaceId).run();

    return c.json({
      success: true,
      callId,
      requestUuid: customerRequestUuid,
      conferenceName,
      to: normalizedTo,
      from,
      inApp: true,
    });
  }

  // Auto-dial ON: bridge the customer leg and the agent's PSTN phone leg
  // together into the same conference (legacy fallback bridge).
  const userRow = await c.env.DB.prepare('SELECT phone FROM users WHERE id = ?').bind(user.id).first<{ phone?: string | null }>();
  const agentPhone = (userRow?.phone || '').trim();
  if (!agentPhone) {
    return c.json({ error: 'Your agent phone is not set. Add it in Plivo Voice settings before making calls.' }, 400);
  }
  const normalizedAgent = normalizeE164(agentPhone);
  if (!/^\+\d{7,15}$/.test(normalizedAgent)) {
    return c.json({ error: 'Your agent phone is invalid. Set a valid E.164 number in Plivo Voice settings.' }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, plivo_config_id, assigned_user_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'plivo', 'voice', 'outgoing', 'queued', 0, ?, ?, ?, ?)"
  ).bind(callId, workspaceId, resolvedContactId, fromRow.id, normalizedTo, config.id, user.id, null, createdAt).run();

  const answerUrl = baseUrl + '/api/plivo/webhook/outbound?callId=' + callId + '&conferenceName=' + encodeURIComponent(conferenceName);

  const [customerRes, agentRes] = await Promise.allSettled([
    createPlivoCall(config, {
      to: normalizedTo,
      from: from,
      answer_url: answerUrl + '&leg=customer',
      answer_method: 'POST',
      ring_url: statusUrl + '&leg=customer',
      ring_method: 'POST',
      hangup_url: statusUrl + '&leg=customer',
      hangup_method: 'POST',
      fallback_url: fallbackUrl,
      fallback_method: 'POST',
    }),
    createPlivoCall(config, {
      to: normalizedAgent,
      from: from,
      answer_url: answerUrl + '&leg=agent',
      answer_method: 'POST',
      hangup_url: statusUrl + '&leg=agent',
      hangup_method: 'POST',
      fallback_url: fallbackUrl,
      fallback_method: 'POST',
    }),
  ]);

  const customerOk = customerRes.status === 'fulfilled' && customerRes.value.ok;
  const agentOk = agentRes.status === 'fulfilled' && agentRes.value.ok;

  if (!customerOk || !agentOk) {
    const reason = !customerOk
      ? (customerRes.status === 'rejected' ? String((customerRes as any).reason) : (customerRes as any).value?.error)
      : (agentRes.status === 'rejected' ? String((agentRes as any).reason) : (agentRes as any).value?.error);
    console.error('[Plivo] outbound bridge leg failed', { customerOk, agentOk, reason });
    await c.env.DB.prepare("UPDATE calls SET status = 'failed' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
    // Tear down whatever did get created so a half-open bridge is not left behind.
    await hangupPlivoConference(config, conferenceName);
    return c.json({ success: false, error: reason || 'Failed to fire Plivo call legs' }, 502);
  }

  // Store the customer leg's request_uuid as the initial external_call_id.
  // The outbound answer webhook replaces it with the customer CallUUID once
  // the customer answers.
  const customerRequestUuid = (customerRes as any).value.requestUuid || null;
  await c.env.DB.prepare(
    'UPDATE calls SET external_call_id = ? WHERE id = ? AND workspace_id = ?'
  ).bind(customerRequestUuid, callId, workspaceId).run();

  return c.json({
    success: true,
    callId,
    requestUuid: customerRequestUuid,
    conferenceName,
    to: normalizedTo,
    from,
  });
});

// ---------------------------------------------------------------
// App-side hangup/decline for Plivo calls.
// ---------------------------------------------------------------

export async function teardownPlivoCall(
  env: Env,
  call: { id: string; workspace_id: string; plivo_config_id?: string | null; external_call_id?: string | null; assigned_user_id?: string | null },
  finalStatus: 'ended' | 'declined'
) {
  if (call.plivo_config_id) {
    const cfg = await env.DB.prepare('SELECT auth_id, auth_token FROM plivo_configs WHERE id = ?')
      .bind(call.plivo_config_id).first<{ auth_id: string; auth_token: string }>();
    if (cfg) {
      // Primary cleanup: delete the conference (drops every member).
      await hangupPlivoConference(cfg, conferenceNameFromCallId(call.id));
      // Best-effort leg hangup (external_call_id may be a request_uuid, not a
      // CallUUID, so a 404 here is expected and ignored).
      if (call.external_call_id) {
        await hangupPlivoCallLeg(cfg, call.external_call_id);
      }
    }
  }

  await env.DB.prepare('UPDATE calls SET status = ?, ended_at = ? WHERE id = ?')
    .bind(finalStatus, sqliteNow(), call.id).run();

  if (call.assigned_user_id) {
    await env.DB.prepare(
      "UPDATE workspace_members SET voice_status = 'live', voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ? AND voice_status = 'busy'"
    ).bind(sqliteNow(), call.workspace_id, call.assigned_user_id).run();
  }

  await broadcastToWorkspace(env, call.workspace_id, {
    type: 'call_status_updated',
    call_id: call.id,
    status: finalStatus,
    duration: 0,
    source: 'plivo',
  });
}

router.post('/api/plivo/call/:id/hangup', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare(
    "SELECT id, workspace_id, plivo_config_id, external_call_id, assigned_user_id FROM calls WHERE id = ? AND workspace_id = ? AND source = 'plivo'"
  ).bind(id, workspaceId).first<{ id: string; workspace_id: string; plivo_config_id?: string | null; external_call_id?: string | null; assigned_user_id?: string | null }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  await teardownPlivoCall(c.env, call, 'ended');
  return c.json({ success: true });
});

router.post('/api/plivo/call/:id/decline', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const id = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare(
    "SELECT id, workspace_id, plivo_config_id, external_call_id, assigned_user_id FROM calls WHERE id = ? AND workspace_id = ? AND source = 'plivo'"
  ).bind(id, workspaceId).first<{ id: string; workspace_id: string; plivo_config_id?: string | null; external_call_id?: string | null; assigned_user_id?: string | null }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  await teardownPlivoCall(c.env, call, 'declined');
  return c.json({ success: true });
});

// ---------------------------------------------------------------
// Plivo webhooks
// ---------------------------------------------------------------

// Incoming PSTN call -> conference waiting room + dial an available agent.
router.post('/api/plivo/webhook/voice', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const from = body.From || '';
    const to = body.To || '';
    const callUuid = body.CallUUID || '';
    const requestUuid = body.RequestUUID || '';
    const direction = body.Direction || 'inbound';


    if (!to || !callUuid) {
      return plivoXmlResponse(XML_DECL + '<Response><Hangup/></Response>', 200);
    }

    const candidates = dialedNumberCandidates(to);
    const config = await c.env.DB.prepare(
      'SELECT tc.id AS plivo_config_id, tc.workspace_id, tc.auth_id, tc.auth_token, tc.auto_dial_agents, tc.voice_bot_enabled, tc.office_hours_start, tc.office_hours_end, tfn.id AS from_number_id, tfn.from_number FROM plivo_configs tc JOIN plivo_from_numbers tfn ON tc.id = tfn.plivo_config_id WHERE tfn.from_number IN (?, ?, ?) AND tfn.is_active = 1 AND tc.is_active = 1 LIMIT 1'
    ).bind(candidates[0], candidates[1], candidates[2]).first<{ plivo_config_id: string; workspace_id: string; auth_id: string; auth_token: string; auto_dial_agents: number; voice_bot_enabled: number; office_hours_start: string; office_hours_end: string; from_number_id: string; from_number: string }>();

    if (!config) {
      console.warn('[Plivo Webhook] no workspace config for dialed number', to);
      return plivoXmlResponse(XML_DECL + '<Response><Hangup/></Response>', 200);
    }

    if (!(await verifyPlivoSignature(c, config.auth_token, body))) {
      console.warn('[Plivo Webhook] invalid signature for voice call', to);
      return c.text('Forbidden', 403);
    }

    const callId = crypto.randomUUID();
    const conferenceName = conferenceNameFromCallId(callId);
    const timestamp = sqliteNow();

    const contactId = await findOrCreateGsmContact(c.env.DB, config.workspace_id, from, from);

    await c.env.DB.prepare(
      "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, plivo_config_id, assigned_user_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'plivo', 'voice', 'incoming', 'ringing', 0, ?, ?, ?, ?)"
    ).bind(callId, config.workspace_id, contactId, config.from_number_id, from, config.plivo_config_id, null, callUuid, timestamp).run();

    const contact = await c.env.DB.prepare('SELECT name FROM contacts WHERE id = ?').bind(contactId).first<{ name: string }>();
    const callerName = contact?.name || from;

    if (config.voice_bot_enabled === 1) {
      // Dynamic office hours check using config
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      const istMinutesTotal = utcHours * 60 + utcMinutes + 330; // IST is UTC+5:30
      
      const [startH, startM] = (config.office_hours_start || '09:00').split(':').map(Number);
      const [endH, endM] = (config.office_hours_end || '16:00').split(':').map(Number);
      const startMinutes = (startH * 60) + (startM || 0);
      const endMinutes = (endH * 60) + (endM || 0);
      
      // Calculate current IST minutes from midnight
      const currentIstMinutes = ((Math.floor(istMinutesTotal / 60) % 24) * 60) + (istMinutesTotal % 60);

      if (currentIstMinutes < startMinutes || currentIstMinutes >= endMinutes) {
        const startAMPM = startH >= 12 ? 'sham' : 'subah';
        const startDisplay = startH > 12 ? (startH === 12 ? 12 : startH - 12) : (startH === 0 ? 12 : startH);
        const endAMPM = endH >= 12 ? 'sham' : 'subah';
        const endDisplay = endH > 12 ? (endH === 12 ? 12 : endH - 12) : (endH === 0 ? 12 : endH);
        const officeTimeText = `Hamara office time ${startAMPM} ${startDisplay} baje se ${endAMPM} ${endDisplay} baje tak hai. Kripya us samay call karein.`;

        const xml = XML_DECL + `<Response><PreAnswer><Speak language="hi-IN" voice="Polly.Aditi">Namaste, main Arya hoon. ${officeTimeText}</Speak></PreAnswer><Hangup/></Response>`;
        return plivoXmlResponse(xml, 200);
      }

      // Agent availability check
      const liveCountRes = await c.env.DB.prepare("SELECT count(*) as cnt FROM workspace_members WHERE workspace_id = ? AND voice_status = 'live'").bind(config.workspace_id).first<{ cnt: number }>();
      if (!liveCountRes || liveCountRes.cnt === 0) {
        const xml = XML_DECL + '<Response><PreAnswer><Speak language="hi-IN" voice="Polly.Aditi">Namaste, main Arya hoon. Abhi hamari team vyast hai. Kripya thodi der baad call karein.</Speak></PreAnswer><Hangup/></Response>';
        return plivoXmlResponse(xml, 200);
      }
    }

    // Assign an available (live) agent, if any. Fire the agent leg first and
    // only mark them busy once the leg was accepted by Plivo.
    let assignedAgentId: string | null = null;
    // Honor the per-account "auto-forward to live agent" toggle. When OFF, no
    // outbound PSTN leg is dialed (no Plivo forwarding charge); the caller waits
    // in the conference and agents can answer in the app (Phase 2).
    const agent = config.auto_dial_agents === 1 ? await pickAvailableAgent(c.env.DB, config.workspace_id) : null;
    if (agent) {
      const baseUrl = getBaseUrl(c as Context);
      const agentAnswerUrl = baseUrl + '/api/plivo/webhook/outbound?callId=' + callId + '&conferenceName=' + encodeURIComponent(conferenceName) + '&leg=agent';
      const agentFallbackUrl = baseUrl + '/api/plivo/webhook/fallback';
      const agentHangupUrl = baseUrl + '/api/plivo/webhook/status?callId=' + callId + '&leg=agent';

      const res = await createPlivoCall(
        { auth_id: config.auth_id, auth_token: config.auth_token },
        {
          to: normalizeE164(agent.phone),
          from: normalizeE164(config.from_number),
          answer_url: agentAnswerUrl,
          answer_method: 'POST',
          hangup_url: agentHangupUrl,
          hangup_method: 'POST',
          fallback_url: agentFallbackUrl,
          fallback_method: 'POST',
        }
      );

      if (res.ok) {
        assignedAgentId = agent.user_id;
        await c.env.DB.prepare(
          "UPDATE workspace_members SET voice_status = 'busy', voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ? AND voice_status = 'live'"
        ).bind(sqliteNow(), config.workspace_id, agent.user_id).run();
        await c.env.DB.prepare('UPDATE calls SET assigned_user_id = ? WHERE id = ?').bind(agent.user_id, callId).run();
      } else {
        console.error('[Plivo Webhook] failed to dial agent leg, leaving caller on hold:', res.error);
      }
    }

    // App answering (auto-forward toggle OFF) vs PSTN forward (toggle ON).
    const answerInApp = config.auto_dial_agents !== 1;

    // Notify all online dashboard/web clients via the workspace Durable Object.
    await broadcastToWorkspace(c.env, config.workspace_id, {
      type: 'plivo_incoming_call',
      callId,
      from,
      callerName,
      conferenceName,
      workspaceId: config.workspace_id,
      assignedAgentId,
      answerInApp,
    });

    // Push to the agents' apps. When the auto-forward toggle is OFF, the push
    // is routed as an in-app CallKit ring (type 'incoming_call'); when ON, the
    // agent answers on PSTN and the push stays a local-only notification.
    await pushIncomingCallToAgents(c.env, c, config.workspace_id, callId, from, callerName, conferenceName, config.plivo_config_id, answerInApp);

    const baseUrl = getBaseUrl(c as Context);
    const statusCallbackUrl = baseUrl + '/api/plivo/webhook/status?callId=' + callId + '&leg=inbound';

    // Caller waits in the conference waiting room. If an agent was dialed, the
    // agent leg (startConferenceOnEnter="true") starts the conference when they
    // answer. If no agent, the caller simply hears hold music until they hang up.
    const xml = XML_DECL +
      '<Response>' +
      '<Conference startConferenceOnEnter="false" endConferenceOnExit="true" waitSound="' + escXml(HOLD_MUSIC_URL) + '" callbackUrl="' + escXml(statusCallbackUrl) + '" callbackMethod="POST">' + escXml(conferenceName) + '</Conference>' +
      '</Response>';
    return plivoXmlResponse(xml, 200);
  } catch (e: any) {
    console.error('[Plivo Webhook] voice error:', e);
    return plivoXmlResponse(XML_DECL + '<Response><Hangup/></Response>', 500);
  }
});

// Status callbacks for the customer leg (ring_url/hangup_url on outbound) and
// conference callbacks (callbackUrl on the inbound caller leg).
router.post('/api/plivo/webhook/status', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const callId = c.req.query('callId') || '';
    const callUuid = body.CallUUID || '';
    const requestUuid = body.RequestUUID || '';
    const rawStatus = body.CallStatus || '';
    const conferenceAction = body.ConferenceAction || '';
    const duration = parseInt(body.BillDuration || '0', 10) || 0;

    let call: any = null;
    if (callId) {
      call = await c.env.DB.prepare('SELECT id, workspace_id, plivo_config_id, external_call_id, assigned_user_id, status FROM calls WHERE id = ?').bind(callId).first();
    } else if (callUuid) {
      call = await c.env.DB.prepare('SELECT id, workspace_id, plivo_config_id, external_call_id, assigned_user_id, status FROM calls WHERE external_call_id = ?').bind(callUuid).first();
    } else if (requestUuid) {
      call = await c.env.DB.prepare('SELECT id, workspace_id, plivo_config_id, external_call_id, assigned_user_id, status FROM calls WHERE external_call_id = ?').bind(requestUuid).first();
    }

    if (!call) return c.text('OK', 200);

    const plivoConfig = await c.env.DB.prepare('SELECT auth_token FROM plivo_configs WHERE id = ?').bind(call.plivo_config_id).first<{ auth_token: string }>();
    if (!(await verifyPlivoSignature(c, plivoConfig?.auth_token, body))) {
      console.warn('[Plivo Webhook] invalid signature on status webhook', callId || callUuid);
      return c.text('Forbidden', 403);
    }

    // Conference callbackUrl events (inbound caller leg).
    if (conferenceAction) {
      if (conferenceAction === 'enter' && call.status !== 'in_progress' && call.status !== 'ended') {
        await c.env.DB.prepare("UPDATE calls SET status = 'in_progress', external_call_id = COALESCE(?, external_call_id) WHERE id = ?")
          .bind(callUuid || null, call.id).run();
        await broadcastToWorkspace(c.env, call.workspace_id, { type: 'call_status_updated', call_id: call.id, status: 'in_progress', duration: 0, source: 'plivo' });
      } else if (conferenceAction === 'exit' && callUuid && call.external_call_id === callUuid) {
        // The inbound caller left the conference -> call over.
        await c.env.DB.prepare("UPDATE calls SET status = 'ended', duration = ?, ended_at = ? WHERE id = ?")
          .bind(duration, sqliteNow(), call.id).run();
        await cleanupPlivoCall(c.env, call);
        await broadcastToWorkspace(c.env, call.workspace_id, { type: 'call_status_updated', call_id: call.id, status: 'ended', duration, source: 'plivo' });
      }
      return c.text('OK', 200);
    }

    if (!rawStatus) return c.text('OK', 200);

    const statusMap: Record<string, string> = {
      ringing: 'ringing',
      'in-progress': 'in_progress',
      completed: 'ended',
      busy: 'busy',
      failed: 'failed',
      'no-answer': 'no_answer',
      canceled: 'canceled',
      timeout: 'no_answer',
    };
    const status = statusMap[rawStatus] || rawStatus;

    // Tear down the conference on every terminal state so a leftover agent or
    // softphone leg cannot stay connected in silence (no-answer/busy/failed).
    // Plivo can also deliver 'timeout' for unanswered outbound legs.
    const terminalStatuses = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled', 'timeout']);

    if (terminalStatuses.has(rawStatus)) {
      await c.env.DB.prepare("UPDATE calls SET status = ?, duration = ?, ended_at = ? WHERE id = ?")
        .bind(status, duration, sqliteNow(), call.id).run();
      await cleanupPlivoCall(c.env, call);
      await broadcastToWorkspace(c.env, call.workspace_id, { type: 'call_status_updated', call_id: call.id, status, duration, source: 'plivo' });
    } else {
      // Guarded update: never downgrade an in_progress/ended call to ringing
      // (Plivo can deliver ring callbacks after answer in rare cases). Also
      // suppress the broadcast when the update did not apply, so clients never
      // see a downgrade (e.g. 'ringing' after 'in_progress').
      const applies = !(call.status === 'in_progress' || call.status === 'ended');
      await c.env.DB.prepare("UPDATE calls SET status = CASE WHEN status IN ('in_progress','ended') THEN status ELSE ? END WHERE id = ?")
        .bind(status, call.id).run();
      if (applies) {
        await broadcastToWorkspace(c.env, call.workspace_id, { type: 'call_status_updated', call_id: call.id, status, duration, source: 'plivo' });
      }
    }

    return c.text('OK', 200);
  } catch (e: any) {
    console.error('[Plivo Webhook] status error:', e);
    return c.text('OK', 200);
  }
});

// Outbound answer URL: put the answered leg into the bridge conference.
// leg=customer stores the customer CallUUID; leg=agent just joins the room.
router.post('/api/plivo/webhook/outbound', async (c) => {
  try {
    const body = await parseWebhookBody(c);
    const callId = c.req.query('callId') || '';
    const leg = c.req.query('leg') || 'customer';
    const waiting = c.req.query('waiting') === '1';
    const callUuid = body.CallUUID || '';
    const conferenceName = c.req.query('conferenceName') || (callId ? conferenceNameFromCallId(callId) : 'default_room');

    if (callId) {
      const callConfig = await c.env.DB.prepare('SELECT pc.auth_token FROM calls c JOIN plivo_configs pc ON pc.id = c.plivo_config_id WHERE c.id = ?').bind(callId).first<{ auth_token: string }>();
      if (!(await verifyPlivoSignature(c, callConfig?.auth_token, body))) {
        console.warn('[Plivo Webhook] invalid signature on outbound webhook', callId);
        return c.text('Forbidden', 403);
      }
    }

    if (callId && leg === 'customer' && callUuid) {
      const call = await c.env.DB.prepare('SELECT id, workspace_id FROM calls WHERE id = ?').bind(callId).first<{ id: string; workspace_id: string }>();
      if (call) {
        await c.env.DB.prepare("UPDATE calls SET external_call_id = ?, status = CASE WHEN status = 'ended' THEN status ELSE 'in_progress' END WHERE id = ?")
          .bind(callUuid, callId).run();
        await broadcastToWorkspace(c.env, call.workspace_id, { type: 'call_status_updated', call_id: callId, status: 'in_progress', duration: 0, source: 'plivo' });
      }
    }

    // In-app answer mode: the customer waits with hold music until the agent
    // joins the conference via the softphone endpoint (/api/plivo/webhook/app).
    if (waiting) {
      const baseUrl = getBaseUrl(c as Context);
      const statusCallbackUrl = baseUrl + '/api/plivo/webhook/status?callId=' + callId + '&leg=customer';
      const xml = XML_DECL +
        '<Response>' +
        '<Conference startConferenceOnEnter="false" endConferenceOnExit="true" waitSound="' + escXml(HOLD_MUSIC_URL) + '" callbackUrl="' + escXml(statusCallbackUrl) + '" callbackMethod="POST">' + escXml(conferenceName) + '</Conference>' +
        '</Response>';
      return plivoXmlResponse(xml, 200);
    }

    // The customer leg ends the conference when it leaves; agent legs do not.
    const endConferenceOnExit = leg === 'customer' ? 'true' : 'false';
    const xml = XML_DECL +
      '<Response>' +
      '<Conference startConferenceOnEnter="true" endConferenceOnExit="' + endConferenceOnExit + '">' + escXml(conferenceName) + '</Conference>' +
      '</Response>';
    return plivoXmlResponse(xml, 200);
  } catch (e: any) {
    console.error('[Plivo Webhook] outbound error:', e);
    return plivoXmlResponse(XML_DECL + '<Response><Hangup/></Response>', 500);
  }
});

// Answer URL for outbound SIP calls placed by the app's softphone. The app
// dials sip:<conferenceName>@phone.plivo.com; Plivo's SIP endpoint routing
// sends that INVITE here, and we bridge the SIP leg into the matching
// conference (the one the inbound caller is already held in).
router.post('/api/plivo/webhook/app', async (c) => {
  const body = await parseWebhookBody(c);
  const to = (body.To || body.to || '').toString();
  const m = /^sip:([^@]+)@/i.exec(to);
  const conferenceName = m ? m[1] : 'default_room';
  return plivoXmlResponse(
    `<Response><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${escXml(conferenceName)}</Conference></Response>`
  );
});

// Fallback URL for all Plivo webhooks. When a primary handler fails, explicitly
// end the call instead of leaving the caller in silence; this also stops Plivo
// from retrying the failing handler indefinitely.
router.post('/api/plivo/webhook/fallback', async (c) => {
  return plivoXmlResponse(XML_DECL + '<Response><Hangup/></Response>', 200);
});

// Hold music route is no longer needed since Plivo expects direct MP3 URLs.

export default router;
