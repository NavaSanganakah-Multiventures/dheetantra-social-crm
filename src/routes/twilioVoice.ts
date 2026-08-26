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

const router = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------
// Workspace Twilio account management
// ---------------------------------------------------------------

router.get('/api/twilio/configs', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, account_sid, auth_token, is_active, created_at, updated_at FROM twilio_configs WHERE workspace_id = ? ORDER BY created_at ASC'
  ).bind(workspaceId).all<{ id: string; name: string; account_sid: string; auth_token: string; is_active: number; created_at: string; updated_at: string }>();

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

  const { name, accountSid, authToken, fromNumbers } = await c.req.json() as any;
  if (!accountSid || !authToken) {
    return c.json({ error: 'accountSid and authToken are required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO twilio_configs (id, workspace_id, name, account_sid, auth_token, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(id, workspaceId, name || 'My Twilio Account', accountSid, authToken, sqliteNow(), sqliteNow()).run();

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
// Outbound Twilio voice call
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
    const rawTo = to.trim();
    const variants = Array.from(new Set([normalizedTo, rawTo]));
    const placeholders = variants.map(() => '?').join(',');
    const contact = await c.env.DB.prepare(
      'SELECT id FROM contacts WHERE workspace_id = ? AND (phone IN (' + placeholders + ') OR platform_contact_id IN (' + placeholders + ')) LIMIT 1'
    ).bind(workspaceId, ...variants, ...variants).first<{ id: string }>();
    if (contact) resolvedContactId = contact.id;
  }

  if (!resolvedContactId) {
    resolvedContactId = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, 'gsm', ?, ?)"
    ).bind(resolvedContactId, workspaceId, normalizedTo, normalizedTo).run();
  }

  const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Aditi" language="hi-IN">नमस्ते, धी तंत्र की ओर से आपसे संपर्क किया जा रहा है।</Say></Response>';

  const formData = new URLSearchParams();
  formData.append('To', normalizedTo);
  formData.append('From', from);
  formData.append('Twiml', twiml);

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
      return c.json({ success: false, error: data.message || 'Twilio error' }, 500);
    }

    const callId = crypto.randomUUID();
    const createdAt = sqliteNow();

    await c.env.DB.prepare(
      "INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, source, type, direction, status, duration, twilio_config_id, external_call_id, created_at) VALUES (?, ?, ?, ?, ?, 'twilio', 'voice', 'outgoing', ?, 0, ?, ?, ?)"
    ).bind(
      callId,
      workspaceId,
      resolvedContactId,
      fromRow.id,
      normalizedTo,
      data.status || 'queued',
      config.id,
      data.sid,
      createdAt
    ).run();

    return c.json({ success: true, callId, callSid: data.sid, status: data.status, to: normalizedTo, from });
  } catch (e: any) {
    console.error('[Twilio] exception while creating call', e);
    return c.json({ success: false, error: e.message || 'Unknown error' }, 500);
  }
});

export default router;
