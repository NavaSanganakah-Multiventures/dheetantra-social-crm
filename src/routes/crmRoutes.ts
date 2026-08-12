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
    const results = await Promise.all(
      tokens.results.map(async (row) => {
        const result = await sendPushNotification(
          c.env,
          row.token,
          'Test push - DheeTantra',
          'Agar yeh notification dikhta hai toh FCM push sahi kaam kar raha hai.',
          { type: 'test_push' }
        );
        return { tokenPreview: row.token.slice(0, 20) + '...', ...result };
      })
    );

    return c.json({ success: true, count: results.length, results });
  } catch (e: any) {
    console.error('[FCM Test] Failed:', e);
    return c.json({ error: e.message || 'Failed to send test push' }, 500);
  }
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
    for (const contact of contacts) {
      if (!contact.phone && !contact.Phone) continue;

      let rawPhone = contact.phone || contact.Phone || "";
      rawPhone = rawPhone.toString().replace(/\D/g, ''); // Remove non-numeric
      if (!rawPhone) continue;

      const contactId = crypto.randomUUID();
      const name = contact.name || contact.Name || `Contact ${rawPhone}`;
      const email = contact.email || contact.Email || null;
      const platformContactId = rawPhone;

      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO contacts (id, workspace_id, platform, platform_contact_id, name, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(contactId, workspaceId, 'whatsapp', platformContactId, name, rawPhone, email).run();

      imported++;
    }

    return c.json({ success: true, imported });
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

export default router;
