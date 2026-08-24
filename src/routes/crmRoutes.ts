import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';
import { requireRole, pagination } from '../shared';

const router = new Hono<{ Bindings: Env }>();

async function resolveUserId(c: any): Promise<string | null> {
  const user = c.get('user');
  if (user?.id) return user.id;

  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId || !c.env.SECRETS_KV) return null;
  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (userDataStr) {
    const parsed = JSON.parse(userDataStr);
    return parsed.id || null;
  }
  return null;
}

router.get('/api/crm/api-domains', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  if (c.env.DB) {
    try {
      const { limit, offset } = pagination(c, 200);
      const { results } = await c.env.DB.prepare('SELECT * FROM api_domains WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .bind(workspaceId, limit, offset).all();
      return c.json({ domains: results });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  }
  return c.json({ error: 'DB not configured' }, 500);
});

router.post('/api/crm/api-domains', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { domain } = await c.req.json();
  if (!domain) return c.json({ error: 'Domain is required' }, 400);

  // Clean domain (e.g. https://example.com -> example.com)
  let cleanDomain = domain.toLowerCase().trim();
  try {
    if (cleanDomain.startsWith('http')) {
      const url = new URL(cleanDomain);
      cleanDomain = url.hostname;
    }
  } catch (e) {
    // If not a valid URL, just use the string
  }

  if (c.env.DB) {
    try {
      const id = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO api_domains (id, workspace_id, domain, status) VALUES (?, ?, ?, ?)')
        .bind(id, workspaceId, cleanDomain, 'pending').run();
      return c.json({ success: true, message: 'Domain submitted for verification' });
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return c.json({ error: 'Domain is already registered' }, 400);
      }
      return c.json({ error: e.message }, 500);
    }
  }
  return c.json({ error: 'DB not configured' }, 500);
});


// ==========================================
// FCM NOTIFICATIONS
// ==========================================

router.post('/api/fcm/register', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const { token, device_type, old_token } = await c.req.json();
  if (!token) return c.json({ error: 'Token is required' }, 400);

  if (c.env.DB) {
    try {
      if (old_token && old_token !== token) {
        await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(old_token).run();
      }
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


// Unregister FCM token (logout / notifications disabled)
router.delete('/api/fcm/register', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const { token } = await c.req.json();
  if (c.env.DB) {
    try {
      if (token) {
        await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ? AND user_id = ?').bind(token, userId).run();
      } else {
        await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE user_id = ?').bind(userId).run();
      }
      return c.json({ success: true, message: 'FCM token unregistered' });
    } catch (e: any) {
      console.error('Failed to unregister FCM token', e);
      return c.json({ error: 'Failed to unregister token' }, 500);
    }
  }
  return c.json({ error: 'DB not configured' }, 500);
});

// Public Firebase web config used by the web dashboard service worker.
// Store the JSON string under SECRETS_KV key `FIREBASE_WEB_CONFIG`.
router.get('/api/fcm/config', async (c) => {
  try {
    const raw = c.env.SECRETS_KV ? await c.env.SECRETS_KV.get('FIREBASE_WEB_CONFIG') : null;
    if (!raw) {
      return c.json({ error: 'Firebase web config not configured' }, 500);
    }
    const config = JSON.parse(raw);
    return c.json(config);
  } catch (e: any) {
    console.error('[FCM Config] Failed to load:', e);
    return c.json({ error: 'Invalid Firebase web config' }, 500);
  }
});

// Diagnostic endpoint: send a test push to the current user's FCM tokens.
router.post('/api/fcm/test', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  if (!c.env.DB) return c.json({ error: 'DB not configured' }, 500);

  try {
    const tokens = await c.env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id = ?').bind(userId).all<{ token: string }>();
    if (!tokens.results || tokens.results.length === 0) {
      return c.json({ error: 'No FCM tokens registered for this user' }, 400);
    }

    const { sendPushNotification } = await import('../../lib/fcm');
    const settled = await Promise.allSettled(
      tokens.results.map(async (row) => {
        const result = await sendPushNotification(
          c.env,
          row.token,
          'Test push - DheeTantra',
          'Agar yeh notification dikhta hai toh FCM push sahi kaam kar raha hai.',
          { type: 'test_push' }
        );
        // Clean stale tokens so future sends do not waste attempts on them.
        if (result.unregistered) {
          try { await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(row.token).run(); } catch (e) {}
        }
        return { tokenPreview: row.token.slice(0, 20) + '...', ...result };
      })
    );
    const results = settled.map((s) => s.status === 'fulfilled' ? s.value : { success: false, error: String(s.reason) });
    // Aggregate: success only if at least one token actually received the push.
    // Previously this was always true, so the app's "test push" snackbar said
    // success even when every send failed (e.g. all stale tokens).
    const anySuccess = results.some((r) => r.success);
    return c.json({ success: anySuccess, count: results.length, results });
  } catch (e: any) {
    console.error('[FCM Test] Failed:', e);
    return c.json({ error: e.message || 'Failed to send test push' }, 500);
  }
});


// Diagnostic: replicate the WhatsApp/email webhook's exact FCM fan-out for
// the caller's workspace and report every step, so a missing push can be
// pinpointed from the app in one call (no wrangler tail needed).
const diagnoseHandler = async (c: any) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  if (!c.env.DB) return c.json({ error: 'DB not configured' }, 500);

  const workspaceId = c.req.header('x-workspace-id');
  const out: any = {
    userId,
    workspaceId: workspaceId || null,
    fcmServiceAccountConfigured: false,
    fcmProjectId: null,
    fcmConfigError: null,
    myTokenCount: 0,
    workspaceMemberCount: 0,
    workspaceTokenCount: 0,
    memberUserIdsPreview: [] as string[],
    iAmWorkspaceMember: false,
    testSend: null,
  };

  // 1. FCM server-side config presence + project id (mirrors lib/fcm.ts).
  try {
    if (c.env.SECRETS_KV) {
      const raw = await c.env.SECRETS_KV.get('FCM_SERVICE_ACCOUNT_JSON');
      if (raw) {
        out.fcmServiceAccountConfigured = true;
        let json = raw;
        if (!raw.trim().startsWith('{')) json = atob(raw.trim());
        const sa = JSON.parse(json);
        const pid = await c.env.SECRETS_KV.get('FCM_PROJECT_ID');
        out.fcmProjectId = pid || sa.project_id || null;
      } else {
        out.fcmConfigError = 'FCM_SERVICE_ACCOUNT_JSON not set in SECRETS_KV';
      }
    } else {
      out.fcmConfigError = 'SECRETS_KV binding missing on the Worker';
    }
  } catch (e: any) {
    out.fcmConfigError = 'config parse error: ' + (e.message || String(e));
  }

  // 2. The caller's own registered tokens (same lookup as /api/fcm/test).
  try {
    const mine = await c.env.DB.prepare('SELECT COUNT(*) as n FROM fcm_tokens WHERE user_id = ?').bind(userId).first();
    out.myTokenCount = mine?.n ?? 0;
  } catch (e: any) {
    out.myTokenCount = -1;
  }

  // 3. The EXACT fan-out the WhatsApp/email webhook runs for this workspace.
  if (workspaceId) {
    try {
      const members: any = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(workspaceId).all();
      const userIds = (members.results || []).map((m: any) => m.user_id);
      out.workspaceMemberCount = userIds.length;
      out.memberUserIdsPreview = userIds.slice(0, 15);
      out.iAmWorkspaceMember = userIds.includes(userId);
      if (userIds.length) {
        const placeholders = userIds.map(() => '?').join(',');
        const tokens: any = await c.env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id IN (' + placeholders + ')').bind(...userIds).all();
        out.workspaceTokenCount = (tokens.results || []).length;
        if (tokens.results && tokens.results.length > 0) {
          const { sendPushNotification } = await import('../../lib/fcm');
          const perToken: any[] = [];
          let validCount = 0;
          for (const row of tokens.results) {
            const r = await sendPushNotification(
              c.env,
              row.token,
              'DheeTantra push diagnose',
              'Fan-out token pe real send test',
              { type: 'diagnostics' }
            );
            perToken.push({ tokenPreview: row.token.slice(0, 20) + '...', success: r.success, unregistered: r.unregistered, error: r.error || null });
            if (r.success) validCount++;
            // Clean stale tokens in-place so the next real webhook send is not
            // wasted on dead tokens (mirrors the webhook's own cleanup).
            if (r.unregistered) {
              try { await c.env.DB.prepare('DELETE FROM fcm_tokens WHERE token = ?').bind(row.token).run(); } catch (e) {}
            }
          }
          out.testSend = { validTokenCount: validCount, totalTested: perToken.length, perToken };
        } else {
          out.testSend = { validTokenCount: 0, totalTested: 0, perToken: [], error: 'No FCM tokens for this workspace members - webhook will log No FCM tokens push skipped' };
        }
      } else {
        out.testSend = { success: false, error: 'Workspace has no rows in workspace_members' };
      }
    } catch (e: any) {
      out.testSend = { success: false, error: 'fan-out query error: ' + (e.message || String(e)) };
    }
  } else {
    out.testSend = { success: false, error: 'x-workspace-id header missing - app not tied to a workspace; webhook fan-out cannot be simulated' };
  }


  // Optional: verify the calling device's own token. This catches the case where
  // a valid token exists in the DB but belongs to some other device/install.
  try {
    let body: any = {};
    if (c.req.method === 'POST') {
      body = await c.req.json().catch(() => ({}));
    }
    const deviceToken = c.req.query('deviceToken') ?? body.deviceToken ?? null;
    if (deviceToken) {
      const row: any = await c.env.DB.prepare('SELECT token, user_id FROM fcm_tokens WHERE token = ?').bind(deviceToken).first();
      out.currentDeviceTokenPreview = deviceToken.toString().slice(0, 30) + '...';
      out.currentDeviceTokenFound = !!row;
      out.currentDeviceTokenUserIdMatch = row ? row.user_id === userId : false;
      if (row && row.user_id === userId) {
        const { sendPushNotification } = await import('../../lib/fcm');
        const r = await sendPushNotification(
          c.env,
          deviceToken,
          'DheeTantra current device diag',
          'Verify current device token',
          { type: 'diagnostics' }
        );
        out.currentDeviceTokenSendSuccess = r.success;
        out.currentDeviceTokenSendError = r.error || (r.unregistered ? 'UNREGISTERED' : null);
      } else {
        out.currentDeviceTokenSendSuccess = false;
        out.currentDeviceTokenSendError = row ? 'Token belongs to a different user' : 'Token not registered in fcm_tokens';
      }
    }
  } catch (e: any) {
    out.currentDeviceTokenSendError = 'device-token check error: ' + (e.message || String(e));
  }

  return c.json(out);
};

// Support both GET (curl/browser) and POST (app sends deviceToken in body).
router.get('/api/fcm/diagnose', diagnoseHandler);
router.post('/api/fcm/diagnose', diagnoseHandler);


// Simulate the exact WhatsApp webhook push path for the caller's workspace.
// This endpoint is synchronous (unlike the async waitUntil in the real webhook),
// so its result is visible to the app without needing wrangler tail.
router.get('/api/fcm/simulate-whatsapp-push', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  if (!c.env.DB) return c.json({ error: 'DB not configured' }, 500);

  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'x-workspace-id required' }, 400);

  const out: any = {
    userId,
    appWorkspaceId: workspaceId,
    configFound: false,
    phoneNumberId: null,
    configWorkspaceId: null,
    workspaceIdMatches: false,
    memberCount: 0,
    tokenCount: 0,
    sendResults: [],
    error: null,
  };

  try {
    const config: any = await c.env.DB.prepare('SELECT workspace_id, phone_number_id FROM whatsapp_configs WHERE workspace_id = ? LIMIT 1').bind(workspaceId).first();
    out.configFound = !!config;
    if (!config) {
      out.error = 'No whatsapp_configs row found for x-workspace-id';
      return c.json(out);
    }
    out.phoneNumberId = config.phone_number_id;
    out.configWorkspaceId = config.workspace_id;
    out.workspaceIdMatches = config.workspace_id === workspaceId;

    const members: any = await c.env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?').bind(config.workspace_id).all();
    const userIds = (members.results || []).map((m: any) => m.user_id);
    out.memberCount = userIds.length;
    if (userIds.length === 0) {
      out.error = 'No workspace members for this WhatsApp config workspace';
      return c.json(out);
    }

    const placeholders = userIds.map(() => '?').join(',');
    const tokens: any = await c.env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id IN (' + placeholders + ')').bind(...userIds).all();
    out.tokenCount = (tokens.results || []).length;

    if (tokens.results && tokens.results.length > 0) {
      const { sendPushNotification } = await import('../../lib/fcm');
      for (const row of tokens.results) {
        const r = await sendPushNotification(
          c.env,
          row.token,
          'DheeTantra simulate WhatsApp push',
          'Webhook push simulation test',
          {
            workspaceId: config.workspace_id,
            contactName: 'Simulation',
            type: 'new_message',
            from: '',
            messageId: '',
            conversation_id: '',
          }
        );
        out.sendResults.push({ tokenPreview: row.token.slice(0, 20) + '...', success: r.success, unregistered: r.unregistered, error: r.error || null });
      }
    } else {
      out.error = 'No FCM tokens for workspace members';
    }
  } catch (e: any) {
    out.error = 'simulation exception: ' + (e.message || String(e));
  }

  return c.json(out);
});


// 2. CRM & Social Media Data (D1 Database)
router.get('/api/crm/contacts', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Fetch from D1 (Relational Data) â paginated; frontend already sends limit=
  const { limit, offset } = pagination(c, 500);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM contacts WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(workspaceId, limit, offset).all();

  return c.json({ contacts: results });
});


// Import Contacts
router.post('/api/crm/contacts/import', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { contacts } = await c.req.json();
  if (!contacts || !Array.isArray(contacts)) return c.json({ error: 'Invalid data format' }, 400);

  try {
    let imported = 0;
    let skipped = 0;
    let errored = 0;
    for (const contact of contacts) {
      try {
        if (!contact.phone && !contact.Phone) { skipped++; continue; }

        let rawPhone = contact.phone || contact.Phone || "";
        rawPhone = rawPhone.toString().replace(/\D/g, ''); // Remove non-numeric
        if (!rawPhone) { skipped++; continue; }

        const contactId = crypto.randomUUID();
        const name = contact.name || contact.Name || `Contact ${rawPhone}`;
        const email = contact.email || contact.Email || null;
        const platformContactId = rawPhone;

        const ins = await c.env.DB.prepare(
          'INSERT OR IGNORE INTO contacts (id, workspace_id, platform, platform_contact_id, name, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(contactId, workspaceId, 'whatsapp', platformContactId, name, rawPhone, email).run();

        // Only count rows that were actually inserted. INSERT OR IGNORE leaves
        // duplicates in place (meta.changes === 0); previously we counted every
        // iteration as imported, inflating the reported number. A single bad
        // row no longer aborts the whole import (per-row try/catch).
        if (ins?.meta?.changes && ins.meta.changes > 0) {
          imported++;
        } else {
          skipped++;
        }
      } catch (rowErr) {
        errored++;
        console.error('Contact import row failed:', rowErr);
      }
    }

    return c.json({ success: true, imported, skipped, errored });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
// Create contact
router.post('/api/crm/contacts', async (c) => {
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

  if (!name) return c.json({ error: 'à¤¨à¤¾à¤® à¤à¤µà¤¶à¥à¤¯à¤ à¤¹à¥ (Name is required)' }, 400);
  if (!phone) return c.json({ error: 'à¤«à¤¼à¥à¤¨ à¤¨à¤à¤¬à¤° à¤à¤µà¤¶à¥à¤¯à¤ à¤¹à¥ (Phone is required)' }, 400);
  if (String(name).length > 200) return c.json({ error: 'Name is too long (max 200 characters)' }, 400);
  if (notes && String(notes).length > 5000) return c.json({ error: 'Notes are too long (max 5000 characters)' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return c.json({ error: 'Invalid email address' }, 400);
  }

  const platformContactId = phone.replace(/[^0-9]/g, '');

  // Check if contact already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE workspace_id = ? AND platform = \'whatsapp\' AND platform_contact_id = ?'
  ).bind(workspaceId, platformContactId).first();

  if (existing) {
    return c.json({ error: 'à¤à¤¸ à¤«à¤¼à¥à¤¨ à¤¨à¤à¤¬à¤° à¤µà¤¾à¤²à¤¾ à¤¸à¤à¤ªà¤°à¥à¤ à¤ªà¤¹à¤²à¥ à¤¸à¥ à¤®à¥à¤à¥à¤¦ à¤¹à¥à¥¤' }, 400);
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
router.put('/api/crm/contacts/:contactId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const contactId = c.req.param('contactId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const body = await c.req.json();
  console.log('Updating contact:', JSON.stringify(body, null, 2));
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

  if (!name) return c.json({ error: 'à¤¨à¤¾à¤® à¤à¤µà¤¶à¥à¤¯à¤ à¤¹à¥' }, 400);
  if (!phone) return c.json({ error: 'à¤«à¤¼à¥à¤¨ à¤¨à¤à¤¬à¤° à¤à¤µà¤¶à¥à¤¯à¤ à¤¹à¥' }, 400);

  const platformContactId = phone.replace(/[^0-9]/g, '');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND workspace_id = ?'
  ).bind(contactId, workspaceId).first();
  if (!existing) return c.json({ error: 'à¤¸à¤à¤ªà¤°à¥à¤ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾' }, 404);

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
router.delete('/api/crm/contacts/:contactId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const contactId = c.req.param('contactId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM contacts WHERE id = ? AND workspace_id = ?'
  ).bind(contactId, workspaceId).first();
  if (!existing) return c.json({ error: 'à¤¸à¤à¤ªà¤°à¥à¤ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾' }, 404);

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


// ==========================================
// USER DEFAULT-DIALER SETTING
// ==========================================
router.get('/api/crm/user/settings', async (c) => {
  const user = c.get('user');
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT default_dialer_enabled FROM users WHERE id = ?').bind(user.id).first<{ default_dialer_enabled: number }>();
  return c.json({ default_dialer_enabled: row ? row.default_dialer_enabled === 1 : false });
});

router.patch('/api/crm/user/settings', async (c) => {
  const user = c.get('user');
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const { default_dialer_enabled } = await c.req.json();
  await c.env.DB.prepare('UPDATE users SET default_dialer_enabled = ? WHERE id = ?')
    .bind(default_dialer_enabled ? 1 : 0, user.id).run();
  return c.json({ success: true, default_dialer_enabled: !!default_dialer_enabled });
});

// ==========================================
// FIND OR CREATE GSM CONTACT BY PHONE
// ==========================================
router.post('/api/crm/contacts/find-or-create', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const { phone, name } = await c.req.json();
  if (!phone) return c.json({ error: 'phone required' }, 400);
  const normalizedPhone = phone.replace(/[^0-9+]/g, '');
  const existing = await c.env.DB.prepare(
    'SELECT id, name FROM contacts WHERE workspace_id = ? AND platform = ? AND platform_contact_id = ?'
  ).bind(workspaceId, 'gsm', normalizedPhone).first<{ id: string; name: string }>();
  if (existing) return c.json({ contactId: existing.id, created: false });
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, workspaceId, 'gsm', normalizedPhone, name || normalizedPhone).run();
  return c.json({ contactId: id, created: true });
});
export default router;
