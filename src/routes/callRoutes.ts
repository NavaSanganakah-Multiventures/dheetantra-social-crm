import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, pagination, sqliteNow } from '../shared';
import { formatForWhatsApp } from '../utils/phoneUtils';
import { teardownPlivoCall } from './plivoVoice';
import { teardownTwilioCall } from './twilioVoice';

const router = new Hono<{ Bindings: Env }>();

router.get('/api/whatsapp/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 100);
  const { results } = await c.env.DB.prepare(`
    SELECT cl.*, ct.name as contact_name, ct.platform_contact_id as phone
    FROM calls cl
    LEFT JOIN contacts ct ON cl.contact_id = ct.id
    WHERE cl.workspace_id = ?
    ORDER BY cl.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(workspaceId, limit, offset).all();

  return c.json({ calls: results || [] });
});

// CREATE a manual or outgoing call log
router.post('/api/whatsapp/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { contactId, type, direction, status, duration } = await c.req.json();
  if (!contactId) return c.json({ error: 'Contact ID required' }, 400);

  const callId = crypto.randomUUID();
  const callCreatedAt = sqliteNow();
  await c.env.DB.prepare(`
    INSERT INTO calls (id, workspace_id, contact_id, type, direction, status, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(callId, workspaceId, contactId, type || 'voice', direction || 'outgoing', status || 'ringing', duration || 0, callCreatedAt).run();

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
      created_at: callCreatedAt
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
  } catch (e) { }

  return c.json({ success: true, callId });
});

// UPDATE call status (answered, ended, duration, etc.)
// INITIATE an outbound WhatsApp WebRTC call (Official Meta Graph API)
router.post('/api/whatsapp/calls/outbound', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const user = (c as any).get('user') as any;
  const body = await c.req.json();
  const { phoneNumberId, contactId, to, recipient, sdp, sdpType } = body as any;

  if (!sdp || typeof sdp !== 'string') {
    return c.json({ error: 'SDP offer required' }, 400);
  }

  let targetPhone = '';
  let finalContactId = contactId || '';
  if (finalContactId) {
    const contact = await c.env.DB.prepare(
      'SELECT platform_contact_id FROM contacts WHERE id = ? AND workspace_id = ?'
    ).bind(finalContactId, workspaceId).first<{ platform_contact_id: string }>();
    if (!contact) return c.json({ error: 'Contact not found' }, 400);
    targetPhone = contact.platform_contact_id || '';
  } else if (to && typeof to === 'string') {
    targetPhone = to;
  }
  if (!targetPhone) return c.json({ error: 'contactId or to required' }, 400);

  const normalizedPhone = formatForWhatsApp(targetPhone);
  if (!normalizedPhone) return c.json({ error: 'Invalid phone number' }, 400);

  let config = await c.env.DB.prepare(
    'SELECT phone_number_id, access_token, calling_enabled FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
  ).bind(workspaceId, phoneNumberId).first<{ phone_number_id: string; access_token: string; calling_enabled: number }>();
  if (!config) {
    config = await c.env.DB.prepare(
      'SELECT phone_number_id, access_token, calling_enabled FROM whatsapp_configs WHERE workspace_id = ?'
    ).bind(workspaceId).first<{ phone_number_id: string; access_token: string; calling_enabled: number }>();
  }
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);
  if (config.calling_enabled === 0) return c.json({ error: 'WhatsApp calling disabled' }, 400);

  const finalPhoneNumberId = phoneNumberId || config.phone_number_id;

  // Busy guard: only one active WhatsApp call per workspace at a time
  const activeCall = await c.env.DB.prepare(
    "SELECT id FROM calls WHERE workspace_id = ? AND source = 'whatsapp' AND status IN ('dialing','ringing','in_progress') LIMIT 1"
  ).bind(workspaceId).first<{ id: string }>();
  if (activeCall) {
    return c.json({ error: 'Another WhatsApp call is already active in this workspace' }, 409);
  }

  const callId = crypto.randomUUID();
  const callCreatedAt = sqliteNow();
  await c.env.DB.prepare(`
    INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, source, assigned_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    callId, workspaceId, finalContactId || null, finalPhoneNumberId, normalizedPhone,
    'voice', 'outgoing', 'dialing', 'whatsapp', user?.id || null, callCreatedAt
  ).run();

  const url = `https://graph.facebook.com/v20.0/${finalPhoneNumberId}/calls`;

  const metaPayload: Record<string, any> = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    action: 'connect',
    session: { sdp, sdp_type: sdpType || 'offer' }
  };
  if (recipient) metaPayload.recipient = recipient;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload)
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      await c.env.DB.prepare('UPDATE calls SET status = ?, hangup_cause = ? WHERE id = ? AND workspace_id = ?')
        .bind('failed', (data?.error?.message || `Meta HTTP ${res.status}`), callId, workspaceId).run();
      return c.json({ success: false, error: data?.error?.message || `Meta HTTP ${res.status}`, meta: data }, 502);
    }

    const externalCallId = data.call_id || data.id || callId;
    await c.env.DB.prepare('UPDATE calls SET external_call_id = ?, status = ? WHERE id = ? AND workspace_id = ?')
      .bind(externalCallId, 'ringing', callId, workspaceId).run();

    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const globalStub = c.env.CHAT_DO.get(globalDoId);
      await globalStub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'call_status_updated',
          call_id: callId,
          status: 'ringing',
          direction: 'outgoing',
          source: 'whatsapp'
        })
      }));
    } catch (e) { }

    return c.json({ success: true, callId, externalCallId, status: 'ringing' });
  } catch (e: any) {
    await c.env.DB.prepare('UPDATE calls SET status = ?, hangup_cause = ? WHERE id = ? AND workspace_id = ?')
      .bind('failed', e.message || 'Network error', callId, workspaceId).run();
    return c.json({ success: false, error: e.message || 'Failed to initiate WhatsApp call' }, 502);
  }
});

router.post('/api/whatsapp/calls/:id/status', async (c) => {
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
  } catch (e) { }

  return c.json({ success: true });
});

// ANSWER a WhatsApp WebRTC call (Official Meta Graph API)
router.post('/api/whatsapp/calls/:id/answer', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { sdp, phoneNumberId } = await c.req.json();

  // Find config by phoneNumberId first, then fallback to workspace
  let config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
    .bind(workspaceId, phoneNumberId).first<{ access_token: string }>();
  if (!config) {
    config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?')
      .bind(workspaceId).first<{ access_token: string }>();
  }
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;
  const headers = { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' };

  // Step 1: pre_accept — signal readiness and establish media connection
  const preAcceptRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'pre_accept'
    })
  });
  const preAcceptData: any = await preAcceptRes.json();
  console.log('[Calling] pre_accept response:', JSON.stringify(preAcceptData));

  // Step 2: accept — formally answer the call
  const acceptRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'accept',
      session: { sdp: sdp, sdp_type: 'answer' }
    })
  });
  const acceptData: any = await acceptRes.json();
  console.log('[Calling] accept response:', JSON.stringify(acceptData));

  await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ? AND workspace_id = ?')
    .bind('in_progress', callId, workspaceId).run();

  return c.json({ success: true, preAccept: preAcceptData, accept: acceptData });
});

// Fetch the stored Meta SDP offer for an incoming call. The FCM push omits
// the (potentially large) SDP, so the app retrieves it here right before
// answering. SDP is persisted by the webhook handler in src/index.ts.
router.get('/api/whatsapp/calls/:id/sdp', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare(
    'SELECT sdp, sdp_type, phone_number_id FROM calls WHERE id = ? AND workspace_id = ?'
  ).bind(callId, workspaceId).first<{ sdp: string | null; sdp_type: string | null; phone_number_id: string | null }>();

  if (!call || !call.sdp) {
    return c.json({ success: false, error: 'SDP not available for this call' }, 404);
  }

  return c.json({
    success: true,
    callId,
    sdp: call.sdp,
    sdpType: call.sdp_type || 'offer',
    phoneNumberId: call.phone_number_id,
  });
});

// TERMINATE a WhatsApp WebRTC call (Official Meta Graph API)
router.post('/api/whatsapp/calls/:id/terminate', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phoneNumberId } = await c.req.json();
  let config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
    .bind(workspaceId, phoneNumberId).first<{ access_token: string }>();
  if (!config) {
    config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?')
      .bind(workspaceId).first<{ access_token: string }>();
  }
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);

  // For outbound calls the local id is different from Meta's call_id.
  const callRow = await c.env.DB.prepare('SELECT external_call_id FROM calls WHERE id = ? AND workspace_id = ?')
    .bind(callId, workspaceId).first<{ external_call_id: string | null }>();
  const externalCallId = callRow?.external_call_id || callId;

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: externalCallId,
      action: 'terminate'
    })
  });

  const data: any = await res.json();
  console.log('[Calling] terminate response:', JSON.stringify(data));

  await c.env.DB.prepare('UPDATE calls SET status = ? WHERE id = ? AND workspace_id = ?')
    .bind('ended', callId, workspaceId).run();

  return c.json({ success: true, data });
});

// REJECT an incoming WhatsApp call (Official Meta Graph API)
router.post('/api/whatsapp/calls/:id/reject', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phoneNumberId } = await c.req.json();
  let config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
    .bind(workspaceId, phoneNumberId).first<{ access_token: string }>();
  if (!config) {
    config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?')
      .bind(workspaceId).first<{ access_token: string }>();
  }
  if (!config) return c.json({ error: 'WhatsApp not configured' }, 400);

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'reject'
    })
  });

  const data: any = await res.json();
  console.log('[Calling] reject response:', JSON.stringify(data));

  // Busy-rejected calls ka status preserve karo (app-side busy guard bhi isi
  // route par aata hai) — warna 'busy' record 'declined' se overwrite ho jayega.
  await c.env.DB.prepare("UPDATE calls SET status = 'declined' WHERE id = ? AND workspace_id = ? AND status != 'busy'")
    .bind(callId, workspaceId).run();

  return c.json({ success: true, data });
});

// UPLOAD call recording
router.post('/api/whatsapp/calls/recordings', async (c) => {
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

// TOGGLE calling configuration — syncs with Meta Graph API
router.post('/api/whatsapp/calls/toggle', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { calling_enabled } = await c.req.json();
  const enabledValue = calling_enabled ? 1 : 0;

  await c.env.DB.prepare('UPDATE whatsapp_configs SET calling_enabled = ? WHERE workspace_id = ?')
    .bind(enabledValue, workspaceId).run();

  // Sync with Meta Graph API for all phone numbers in this workspace
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const configs = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?')
          .bind(workspaceId).all<{ phone_number_id: string, access_token: string }>();
        if (configs.results) {
          for (const cfg of configs.results) {
            await fetch(`https://graph.facebook.com/v20.0/${cfg.phone_number_id}/settings`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${cfg.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                calling: { status: calling_enabled ? 'ENABLED' : 'DISABLED' }
              })
            });
          }
        }
      } catch (e) {
        console.error('[Calling] Failed to sync calling toggle with Meta:', e);
      }
    })()
  );

  return c.json({ success: true, calling_enabled: enabledValue === 1 });
});

// ==========================================
// CLOUDFLARE REALTIME TURN CREDENTIALS
// ==========================================
router.get('/api/webrtc/ice-servers', async (c) => {
  try {
    // Try KV first, then env variables
    const turnKeyId = await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID') || await c.env.SECRETS_KV.get('TURN_KEY_ID');
    const turnToken = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN') || await c.env.SECRETS_KV.get('TURN_KEY_API_TOKEN');

    if (!turnKeyId || !turnToken) {
      // Fallback to free STUN only if TURN not configured
      return c.json({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });
    }

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${turnKeyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${turnToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: 86400 }) // 24 hours
      }
    );

    const data: any = await res.json();

    // Add Cloudflare STUN as fallback
    const iceServers = data.iceServers || [];
    iceServers.unshift({ urls: 'stun:stun.cloudflare.com:3478' });

    return c.json({ iceServers });
  } catch (err: any) {
    console.error('[TURN] Failed to generate ICE servers:', err);
    // Fallback to STUN only
    return c.json({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
  }
});

// POST re-enable calling for a phone number (in case auto-enable failed during config save)
router.post('/api/whatsapp/calls/re-enable', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phoneNumberId } = await c.req.json();
  if (!phoneNumberId) return c.json({ error: 'phoneNumberId required' }, 400);

  const config = await c.env.DB.prepare(
    'SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ? AND workspace_id = ?'
  ).bind(phoneNumberId, workspaceId).first<{ access_token: string }>();

  if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/settings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        calling: {
          status: 'ENABLED',
          call_icon_visibility: 'DEFAULT',
          callback_permission_status: 'ENABLED'
        }
      })
    });
    const data = await res.json();
    console.log(`[Calling] Re-enabled calling for ${phoneNumberId}:`, data);

    await c.env.DB.prepare(
      'UPDATE whatsapp_configs SET calling_enabled = 1 WHERE phone_number_id = ? AND workspace_id = ?'
    ).bind(phoneNumberId, workspaceId).run();

    return c.json({ success: true, meta_response: data });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET calling configuration
router.get('/api/whatsapp/calls/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const config = await c.env.DB.prepare('SELECT calling_enabled FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first<{ calling_enabled: number }>();

  return c.json({ calling_enabled: config ? config.calling_enabled === 1 : true });
});

// GET calling status from Meta API — verify calling is actually enabled on Meta's side
router.get('/api/whatsapp/calls/status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const configs = await c.env.DB.prepare(
    'SELECT phone_number_id, access_token, calling_enabled FROM whatsapp_configs WHERE workspace_id = ?'
  ).bind(workspaceId).all<{ phone_number_id: string; access_token: string; calling_enabled: number }>();

  const phoneResults: any[] = [];

  for (const cfg of configs.results || []) {
    let metaStatus: any = null;
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${cfg.phone_number_id}/settings`, {
        headers: { 'Authorization': `Bearer ${cfg.access_token}` }
      });
      metaStatus = await res.json();
    } catch (e) {
      metaStatus = { error: 'Failed to query Meta API' };
    }

    phoneResults.push({
      phone_number_id: cfg.phone_number_id,
      db_calling_enabled: cfg.calling_enabled === 1,
      meta_settings: metaStatus
    });
  }

  // Check webhook subscription and auto-fix if needed
  let webhookCallsFieldHint = false;
  let autoFixed = false;
  const firstConfig = configs.results?.[0];
  if (firstConfig) {
    try {
      const wabaRow = await c.env.DB.prepare(
        'SELECT waba_id FROM whatsapp_configs WHERE workspace_id = ? AND waba_id IS NOT NULL LIMIT 1'
      ).bind(workspaceId).first<{ waba_id: string }>();

      if (wabaRow && wabaRow.waba_id) {
        const subsRes = await fetch(`https://graph.facebook.com/v20.0/${wabaRow.waba_id}/subscribed_apps`, {
          headers: { 'Authorization': `Bearer ${firstConfig.access_token}` }
        });
        const subsData: any = await subsRes.json();
        // Check if 'calls' is in the subscribed fields list
        let appAttached = false;
        if (subsData.data && subsData.data.length > 0) {
          appAttached = true;
          const fields = subsData.data[0].subscribed_fields || subsData.data[0].whatsapp_business_api_data?.subscribed_fields || [];
          webhookCallsFieldHint = Array.isArray(fields) && fields.includes('calls');
        }

        // AUTO-FIX: If calls field is NOT subscribed, subscribe it now
        if (!webhookCallsFieldHint) {
          try {
            const fixRes = await fetch(`https://graph.facebook.com/v20.0/${wabaRow.waba_id}/subscribed_apps`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firstConfig.access_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: 'subscribed_fields=messages,calls'
            });
            const fixData: any = await fixRes.json();
            console.log(`[Calling Status] Auto-fix webhook subscription for WABA ${wabaRow.waba_id}:`, fixData);
            if (fixData.success === true) {
              webhookCallsFieldHint = true;
              autoFixed = true;
            } else if (appAttached) {
              // Meta API often omits the fields array, and auto-fix can fail due to token permissions.
              // If an app is attached to the WABA, we assume the user configured the webhook manually
              // in the Meta Dashboard to prevent a false-negative UI error.
              webhookCallsFieldHint = true;
            }
          } catch (fixErr) {
            console.error('[Calling Status] Auto-fix webhook subscription failed:', fixErr);
            if (appAttached) webhookCallsFieldHint = true;
          }
        }
      }
    } catch (e) {
      console.error('[Calling Status] Failed to check webhook subscription:', e);
    }
  }

  // Check TURN/ICE configuration
  let turnKeyId: string | null = null;
  let turnToken: string | null = null;
  try {
    turnKeyId = await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID');
  } catch (e) {
    console.error('[TURN] Failed to get CLOUDFLARE_CALLS_APP_ID from KV:', e);
  }
  try {
    turnToken = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN');
  } catch (e) {
    console.error('[TURN] Failed to get CLOUDFLARE_API_TOKEN from KV:', e);
  }

  return c.json({
    phone_numbers: phoneResults,
    webhook_subscribed: webhookCallsFieldHint,
    webhook_auto_fixed: autoFixed,
    turn_configured: !!(turnKeyId && turnToken),
    all_ready: phoneResults.every(p => p.db_calling_enabled) && webhookCallsFieldHint
  });
});

// Manually subscribe webhook fields (messages + calls) for a workspace's WABA


// ==========================================
// GSM CALLER APP / DEFAULT DIALER SUPPORT
// ==========================================

// List calls (all sources). Pass ?source=gsm or ?source=whatsapp to filter.
router.get('/api/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { limit, offset } = pagination(c, 100);
  const source = c.req.query('source');
  const phone = c.req.query('phone');

  let sql = `
    SELECT cl.*, ct.name as contact_name, ct.platform_contact_id as phone
    FROM calls cl
    LEFT JOIN contacts ct ON cl.contact_id = ct.id
    WHERE cl.workspace_id = ?
  `;
  const params: any[] = [workspaceId];
  if (source) {
    sql += ' AND cl.source = ?';
    params.push(source);
  }
  if (phone) {
    sql += ' AND (ct.platform_contact_id LIKE ? OR ct.phone LIKE ?)';
    params.push(`%${phone}%`, `%${phone}%`);
  }
  sql += ' ORDER BY cl.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ calls: results || [] });
});

// Upsert a contact for a phone number inside this workspace (GSM/e164 format).
async function findOrCreateGsmContact(db: any, workspaceId: string, phone: string, name?: string) {
  const normalizedPhone = phone.replace(/[^0-9+]/g, '');
  const existing = await db.prepare(
    'SELECT id, name FROM contacts WHERE workspace_id = ? AND platform = ? AND platform_contact_id = ?'
  ).bind(workspaceId, 'gsm', normalizedPhone).first() as { id: string; name: string } | null;
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, workspaceId, 'gsm', normalizedPhone, name || normalizedPhone).run();
  return id;
}

// Create a GSM call log. Provide phone *or* contactId.
router.post('/api/calls', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const body = await c.req.json();
  const { phone, contactId, direction, status, duration, startedAt, endedAt, notes } = body;
  if (!phone && !contactId) {
    return c.json({ error: 'phone or contactId required' }, 400);
  }
  if (!['incoming', 'outgoing'].includes(direction)) {
    return c.json({ error: 'direction must be incoming or outgoing' }, 400);
  }

  let finalContactId: string | null = contactId || null;
  let finalPhone = phone || '';
  if (!finalContactId && finalPhone) {
    finalContactId = await findOrCreateGsmContact(c.env.DB, workspaceId, finalPhone, body.contactName);
  }
  if (!finalContactId) {
    return c.json({ error: 'Could not resolve contact' }, 400);
  }
  if (!finalPhone) {
    const ct = await c.env.DB.prepare('SELECT platform_contact_id FROM contacts WHERE id = ? AND workspace_id = ?').bind(finalContactId, workspaceId).first<{ platform_contact_id: string }>();
    finalPhone = ct?.platform_contact_id || '';
  }

  const callId = crypto.randomUUID();
  const callCreatedAt = sqliteNow();
  const started = startedAt || callCreatedAt;
  const ended = endedAt || null;
  const dur = typeof duration === 'number' ? duration : 0;

  await c.env.DB.prepare(`
    INSERT INTO calls (id, workspace_id, contact_id, caller_number, type, direction, status, source, duration, notes, started_at, ended_at, created_at)
    VALUES (?, ?, ?, ?, 'voice', ?, ?, 'gsm', ?, ?, ?, ?, ?)
  `).bind(callId, workspaceId, finalContactId, finalPhone, direction, status || 'ringing', dur, notes || null, started, ended, callCreatedAt).run();

  const contact = await c.env.DB.prepare('SELECT name, platform_contact_id FROM contacts WHERE id = ?').bind(finalContactId).first<{ name: string; platform_contact_id: string }>();

  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const globalStub = c.env.CHAT_DO.get(globalDoId);
    await globalStub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'call_updated',
        call: {
          id: callId,
          workspace_id: workspaceId,
          contact_id: finalContactId,
          contact_name: contact?.name || 'Unknown',
          phone: contact?.platform_contact_id || finalPhone,
          type: 'voice',
          direction,
          status: status || 'ringing',
          source: 'gsm',
          duration: dur,
          notes: notes || null,
          created_at: callCreatedAt
        }
      })
    }));
  } catch (e) {
    console.error('[GSM Calls] broadcast error:', e);
  }

  return c.json({ success: true, callId });
});


// Get a single call by ID
router.get('/api/calls/:id', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare(`
    SELECT cl.*, ct.name as contact_name, ct.platform_contact_id as phone, ct.lead_status, ct.email
    FROM calls cl
    LEFT JOIN contacts ct ON cl.contact_id = ct.id
    WHERE cl.id = ? AND cl.workspace_id = ?
  `).bind(callId, workspaceId).first();
  if (!call) return c.json({ error: 'Call not found' }, 404);
  return c.json({ call });
});

// Update a GSM call (status, duration, ended_at, notes).
router.post('/api/calls/:id/status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const body = await c.req.json();
  const { status, duration, endedAt, notes, recordingUrl } = body;

  const updates: string[] = [];
  const params: any[] = [];
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
  if (endedAt !== undefined) { updates.push('ended_at = ?'); params.push(endedAt); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (recordingUrl !== undefined) { updates.push('recording_url = ?'); params.push(recordingUrl); }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  params.push(callId, workspaceId);
  await c.env.DB.prepare(`UPDATE calls SET ${updates.join(', ')} WHERE id = ? AND workspace_id = ?`).bind(...params).run();

  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const globalStub = c.env.CHAT_DO.get(globalDoId);
    await globalStub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'call_status_updated', call_id: callId, status, duration, source: 'gsm' })
    }));
  } catch (e) { }

  return c.json({ success: true });
});

// Upload call recording for a GSM call.
router.post('/api/calls/:id/recording', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare('SELECT id, contact_id FROM calls WHERE id = ? AND workspace_id = ? AND source = ?')
    .bind(callId, workspaceId, 'gsm').first<{ id: string; contact_id: string }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  try {
    const body = await c.req.parseBody();
    const file = body['recording'];
    if (!file || typeof (file as any).arrayBuffer !== 'function') {
      return c.json({ error: 'No audio file provided' }, 400);
    }
    const f = file as File;
    const ext = (f.name?.split('.').pop() || 'm4a').toLowerCase();
    const key = `recordings/${workspaceId}/${callId}/${Date.now()}.${ext}`;

    await c.env.MEDIA_BUCKET.put(key, await f.arrayBuffer(), {
      httpMetadata: { contentType: f.type || 'audio/mpeg' }
    });

    await c.env.DB.prepare('UPDATE calls SET recording_url = ? WHERE id = ? AND workspace_id = ?')
      .bind(key, callId, workspaceId).run();

    return c.json({ success: true, recordingUrl: key });
  } catch (err: any) {
    console.error('[GSM Calls] recording upload error:', err);
    return c.json({ error: 'Failed to upload recording' }, 500);
  }
});

// Play/download a call recording.
router.get('/api/calls/:id/recording', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare('SELECT recording_url FROM calls WHERE id = ? AND workspace_id = ?')
    .bind(callId, workspaceId).first<{ recording_url: string | null }>();
  if (!call || !call.recording_url) return c.json({ error: 'Recording not found' }, 404);

  const obj = await c.env.MEDIA_BUCKET.get(call.recording_url);
  if (!obj || !obj.body) return c.json({ error: 'Recording missing in storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'audio/mpeg',
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=86400'
    }
  });
});

// ==========================================
// AI SUMMARY FOR CALL RECORDINGS
// Primary: Google AI Studio (Gemini)
// Fallback: Cloudflare Workers AI (whisper + llama)
// ==========================================
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function summarizeWithGemini(audioBytes: ArrayBuffer, mimeType: string, env: Env): Promise<string | null> {
  const key = await env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!key) return null;

  const prompt = `You are a CRM assistant. Summarize this phone call in the same language as the audio.
Include:
- Caller intent
- Key discussion points
- Action items / follow-ups
- Sentiment (positive/neutral/negative)
Keep it concise.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: arrayBufferToBase64(audioBytes) } }
        ]
      }
    ],
    generationConfig: { maxOutputTokens: 2048, temperature: 0.3 }
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Gemini request failed');
    console.error('[AI Summary] Gemini error:', err);
    return null;
  }
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function summarizeWithWorkersAI(audioBytes: ArrayBuffer, env: Env): Promise<string | null> {
  try {
    const transcriptResult: any = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: audioBytes });
    const transcript = transcriptResult?.text || transcriptResult?.transcription || '';
    if (!transcript) return null;

    const summaryResult: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a CRM assistant. Summarize the following call transcript in the same language. Include intent, key points, action items, and sentiment.' },
        { role: 'user', content: transcript }
      ]
    });
    return summaryResult?.response || summaryResult?.summary || null;
  } catch (e: any) {
    console.error('[AI Summary] Workers AI error:', e);
    return null;
  }
}

router.post('/api/calls/:id/summarize', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare(
    'SELECT id, recording_url, transcript FROM calls WHERE id = ? AND workspace_id = ?'
  ).bind(callId, workspaceId).first<{ id: string; recording_url: string | null; transcript: string | null }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);
  if (!call.recording_url) return c.json({ error: 'No recording attached to this call' }, 400);

  const obj = await c.env.MEDIA_BUCKET.get(call.recording_url);
  if (!obj || !obj.body) return c.json({ error: 'Recording missing in storage' }, 404);
  const audioBytes = await obj.arrayBuffer();
  const mimeType = obj.httpMetadata?.contentType || 'audio/mpeg';

  let summary: string | null = null;
  let provider: string | null = null;
  let transcript: string | null = call.transcript || null;

  // Try Gemini first
  summary = await summarizeWithGemini(audioBytes, mimeType, c.env);
  if (summary) {
    provider = 'gemini';
  } else {
    // Fallback to Workers AI transcription + summarization
    summary = await summarizeWithWorkersAI(audioBytes, c.env);
    if (summary) provider = 'workers_ai';
  }

  if (!summary) {
    return c.json({ error: 'AI summary generation failed for this recording' }, 500);
  }

  await c.env.DB.prepare(
    'UPDATE calls SET summary = ?, ai_summary_generated_at = ?, transcript = COALESCE(?, transcript) WHERE id = ? AND workspace_id = ?'
  ).bind(summary, sqliteNow(), transcript || null, callId, workspaceId).run();

  return c.json({ success: true, summary, provider });
});

// ==========================================
// UNIFIED DECLINE / HANGUP FOR ALL PLATFORMS
// ==========================================
router.post('/api/calls/:id/decline', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare('SELECT * FROM calls WHERE id = ? AND workspace_id = ?')
    .bind(callId, workspaceId).first<{ source: string; id: string; workspace_id: string; plivo_config_id?: string; external_call_id?: string; assigned_user_id?: string }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  try {
    if (call.source === 'plivo') {
      await teardownPlivoCall(c.env, call, 'declined');
      return c.json({ success: true, message: 'Plivo call declined' });
    } else if (call.source === 'twilio') {
      await teardownTwilioCall(c.env, call, 'declined');
      return c.json({ success: true, message: 'Twilio call declined' });
    } else if (call.source === 'whatsapp') {
      // For WhatsApp, we ideally use the existing logic from /api/whatsapp/calls/:id/reject.
      // But since we may not have phoneNumberId in the body here (frontend unified api), 
      // we can fetch it from the DB.
      const wCall = await c.env.DB.prepare('SELECT phone_number_id FROM calls WHERE id = ?').bind(callId).first<{phone_number_id: string}>();
      if (wCall && wCall.phone_number_id) {
        let config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
          .bind(workspaceId, wCall.phone_number_id).first<{ access_token: string }>();
        if (!config) {
          config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?')
            .bind(workspaceId).first<{ access_token: string }>();
        }
        if (config) {
          await fetch(`https://graph.facebook.com/v20.0/${wCall.phone_number_id}/calls`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              call_id: callId,
              action: 'reject'
            })
          });
        }
      }
      await c.env.DB.prepare("UPDATE calls SET status = 'declined' WHERE id = ? AND workspace_id = ? AND status != 'busy'").bind(callId, workspaceId).run();
      return c.json({ success: true, message: 'WhatsApp call declined' });
    }
  } catch (e: any) {
    console.error('[Unified Decline] Error:', e);
  }

  // Fallback
  await c.env.DB.prepare("UPDATE calls SET status = 'declined' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
  return c.json({ success: true, message: 'Call marked as declined' });
});

router.post('/api/calls/:id/hangup', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const callId = c.req.param('id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const call = await c.env.DB.prepare('SELECT * FROM calls WHERE id = ? AND workspace_id = ?')
    .bind(callId, workspaceId).first<{ source: string; id: string; workspace_id: string; plivo_config_id?: string; external_call_id?: string; assigned_user_id?: string }>();
  if (!call) return c.json({ error: 'Call not found' }, 404);

  try {
    if (call.source === 'plivo') {
      await teardownPlivoCall(c.env, call, 'ended');
      return c.json({ success: true, message: 'Plivo call hung up' });
    } else if (call.source === 'twilio') {
      await teardownTwilioCall(c.env, call, 'ended');
      return c.json({ success: true, message: 'Twilio call hung up' });
    } else if (call.source === 'whatsapp') {
      const wCall = await c.env.DB.prepare('SELECT phone_number_id, external_call_id FROM calls WHERE id = ?').bind(callId).first<{phone_number_id: string, external_call_id: string}>();
      if (wCall && wCall.phone_number_id) {
        let config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
          .bind(workspaceId, wCall.phone_number_id).first<{ access_token: string }>();
        if (!config) {
          config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?')
            .bind(workspaceId).first<{ access_token: string }>();
        }
        if (config) {
          await fetch(`https://graph.facebook.com/v20.0/${wCall.phone_number_id}/calls`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              call_id: wCall.external_call_id || callId,
              action: 'terminate'
            })
          });
        }
      }
      await c.env.DB.prepare("UPDATE calls SET status = 'ended' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
      return c.json({ success: true, message: 'WhatsApp call hung up' });
    }
  } catch (e: any) {
    console.error('[Unified Hangup] Error:', e);
  }

  // Fallback
  await c.env.DB.prepare("UPDATE calls SET status = 'ended' WHERE id = ? AND workspace_id = ?").bind(callId, workspaceId).run();
  return c.json({ success: true, message: 'Call marked as ended' });
});

export default router;
