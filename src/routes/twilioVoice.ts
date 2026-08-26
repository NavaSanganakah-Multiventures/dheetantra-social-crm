import { Hono } from 'hono';
import { Env } from '../types';
import { sqliteNow } from '../shared';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/twilio/call', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) {
    return c.json({ error: 'Workspace ID required' }, 400);
  }

  const { to, contactId } = await c.req.json() as { to?: string; contactId?: string };
  if (!to || typeof to !== 'string') {
    return c.json({ error: 'To number is required' }, 400);
  }
  if (!to.startsWith('+')) {
    return c.json({ error: 'Phone number must be in E.164 format, e.g. +9198XXXXXXXX' }, 400);
  }

  const accountSid = await c.env.SECRETS_KV.get('TWILIO_ACCOUNT_SID');
  const authToken = await c.env.SECRETS_KV.get('TWILIO_AUTH_TOKEN');
  const fromNumber = (await c.env.SECRETS_KV.get('TWILIO_FROM_NUMBER')) || '+919669509952';

  if (!accountSid || !authToken) {
    console.error('[Twilio] Credentials missing in SECRETS_KV');
    return c.json({ error: 'Twilio not configured' }, 500);
  }

  let resolvedContactId = contactId;
  if (!resolvedContactId && c.env.DB) {
    const contact = await c.env.DB
      .prepare('SELECT id FROM contacts WHERE workspace_id = ? AND (phone = ? OR platform_contact_id = ?) LIMIT 1')
      .bind(workspaceId, to, to)
      .first<{ id: string }>();
    if (contact) resolvedContactId = contact.id;
  }
  if (!resolvedContactId) {
    return c.json({ error: 'contactId is required when no matching contact is found' }, 400);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">नमस्ते, धी तंत्र की ओर से आपसे संपर्क किया जा रहा है।</Say>
</Response>`;

  const formData = new URLSearchParams();
  formData.append('To', to);
  formData.append('From', fromNumber);
  formData.append('Twiml', twiml);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
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

    await c.env.DB.prepare(`
      INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, duration, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      callId,
      workspaceId,
      resolvedContactId,
      null,
      fromNumber,
      'voice',
      'outgoing',
      data.status || 'queued',
      0,
      createdAt
    ).run();

    return c.json({ success: true, callId, callSid: data.sid, status: data.status });
  } catch (e: any) {
    console.error('[Twilio] exception while creating call', e);
    return c.json({ success: false, error: e.message || 'Unknown error' }, 500);
  }
});

export default router;
