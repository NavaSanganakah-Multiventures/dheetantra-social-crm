import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, pagination } from '../shared';

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
  const callCreatedAt = new Date().toISOString();
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

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: callId,
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
        if (subsData.data && subsData.data.length > 0) {
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
            }
          } catch (fixErr) {
            console.error('[Calling Status] Auto-fix webhook subscription failed:', fixErr);
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

export default router;
