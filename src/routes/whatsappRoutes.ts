import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, pagination } from '../shared';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/whatsapp/config', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const {
    id, phone_number_id, waba_id, access_token, verify_token, reply_mode, ai_provider, ai_voice_instructions,
    about, description, website, email, address, username, calling_enabled, call_schedule
  } = await c.req.json();
  const newId = id || crypto.randomUUID();

  try {

    let existing: any = null;
    if (id) {
      existing = await c.env.DB.prepare('SELECT id, waba_id, access_token, verify_token, reply_mode, ai_provider, ai_voice_instructions, about, description, website, email, address, username, calling_enabled, call_schedule FROM whatsapp_configs WHERE id = ?').bind(id).first();
    } else {
      existing = await c.env.DB.prepare('SELECT id, waba_id, access_token, verify_token, reply_mode, ai_provider, ai_voice_instructions, about, description, website, email, address, username, calling_enabled, call_schedule FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phone_number_id).first();
    }

    const finalId = id || existing?.id || newId;
    const finalToken = access_token !== undefined ? access_token : (existing?.access_token || '');
    const finalReplyMode = reply_mode !== undefined ? reply_mode : (existing?.reply_mode || 'manual');
    const finalAiProvider = ai_provider !== undefined ? ai_provider : (existing?.ai_provider || 'gemini');
    const finalAiVoiceInstructions = ai_voice_instructions !== undefined ? ai_voice_instructions : (existing?.ai_voice_instructions || null);
    const finalWabaId = waba_id !== undefined ? waba_id : (existing?.waba_id || null);
    const finalVerifyToken = verify_token !== undefined ? verify_token : (existing?.verify_token || null);
    const finalAbout = about !== undefined ? about : (existing?.about || '');
    const finalDescription = description !== undefined ? description : (existing?.description || '');
    const finalWebsite = website !== undefined ? website : (existing?.website || '');
    const finalEmail = email !== undefined ? email : (existing?.email || '');
    const finalAddress = address !== undefined ? address : (existing?.address || '');
    const finalUsername = username !== undefined ? username : (existing?.username || '');
    const finalCallingEnabled = calling_enabled !== undefined ? calling_enabled : (existing?.calling_enabled ?? 1);
    const finalCallSchedule = call_schedule !== undefined ? call_schedule : (existing?.call_schedule || '{"enabled":false,"start_time":"09:00","end_time":"17:00","days":[1,2,3,4,5,6,7]}');

    if (existing || id) {
      await c.env.DB.prepare(
        `UPDATE whatsapp_configs SET 
          phone_number_id = ?, waba_id = ?, access_token = ?, verify_token = ?, reply_mode = ?, 
          ai_provider = ?, ai_voice_instructions = ?,
          about = ?, description = ?, website = ?, email = ?, address = ?, username = ?,
          calling_enabled = ?, call_schedule = ?
        WHERE id = ?`
      ).bind(
        phone_number_id, finalWabaId, finalToken, finalVerifyToken, finalReplyMode,
        finalAiProvider, finalAiVoiceInstructions,
        finalAbout, finalDescription, finalWebsite, finalEmail, finalAddress, finalUsername,
        finalCallingEnabled, finalCallSchedule,
        finalId
      ).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO whatsapp_configs (
          id, workspace_id, phone_number_id, waba_id, access_token, verify_token, reply_mode, 
          ai_provider, ai_voice_instructions,
          about, description, website, email, address, username, calling_enabled, call_schedule
        ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        finalId, workspaceId, phone_number_id, finalWabaId, finalToken, finalVerifyToken, finalReplyMode,
        finalAiProvider, finalAiVoiceInstructions,
        finalAbout, finalDescription, finalWebsite, finalEmail, finalAddress, finalUsername,
        finalCallingEnabled, finalCallSchedule
      ).run();
    }

    // Auto-enable calling for this phone number via Meta Graph API
    if (finalToken && phone_number_id) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const enableRes = await fetch(`https://graph.facebook.com/v20.0/${phone_number_id}/settings`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${finalToken}`,
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
            const enableData = await enableRes.json();
            console.log(`[Calling] Auto-enabled calling for ${phone_number_id}:`, enableData);
          } catch (e) {
            console.error(`[Calling] Failed to auto-enable calling for ${phone_number_id}:`, e);
          }

          // Subscribe webhook fields (messages + calls) for this WABA.
          // Use the outer finalWabaId (which falls back to the stored value) —
          // re-deriving from raw `waba_id` here shadowed it and skipped
          // subscription whenever the caller updated a config without
          // re-sending waba_id in the body.
          if (finalWabaId) {
            try {
              const subsRes = await fetch(`https://graph.facebook.com/v20.0/${finalWabaId}/subscribed_apps`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${finalToken}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'subscribed_fields=messages,calls'
              });
              const subsData: any = await subsRes.json();
              console.log(`[Webhook] Subscribed messages+calls for WABA ${finalWabaId}:`, subsData);
            } catch (e) {
              console.error(`[Webhook] Failed to subscribe for WABA ${finalWabaId}:`, e);
            }
          }

          // Sync Profile info to Meta
          const metaPayload: any = { messaging_product: 'whatsapp' };
          let shouldSyncProfile = false;
          if (finalAbout !== undefined && finalAbout !== null) { metaPayload.about = finalAbout; shouldSyncProfile = true; }
          if (finalDescription !== undefined && finalDescription !== null) { metaPayload.description = finalDescription; shouldSyncProfile = true; }
          if (finalEmail !== undefined && finalEmail !== null) { metaPayload.email = finalEmail; shouldSyncProfile = true; }
          if (finalWebsite !== undefined && finalWebsite !== null) { metaPayload.websites = [finalWebsite]; shouldSyncProfile = true; }
          if (finalAddress !== undefined && finalAddress !== null) { metaPayload.address = finalAddress; shouldSyncProfile = true; }
          
          if (shouldSyncProfile) {
            try {
              const profileRes = await fetch(`https://graph.facebook.com/v20.0/${phone_number_id}/whatsapp_business_profile`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${finalToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(metaPayload)
              });
              const profileData = await profileRes.json();
              if (!profileRes.ok) {
                console.error('[Profile] Failed to sync config profile:', profileData);
              } else {
                console.log('[Profile] Synced config profile to Meta API');
              }
            } catch (e) {
              console.error('[Profile] Error syncing config profile to Meta API:', e);
            }
          }
        })()
      );
    }
    return c.json({ success: true, message: 'WhatsApp config saved', id: finalId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get WhatsApp Config
router.get('/api/whatsapp/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {


    const { results } = await c.env.DB.prepare('SELECT id, phone_number_id, waba_id, access_token, verify_token, reply_mode, calling_enabled, ai_provider, ai_voice_instructions, about, description, website, email, address, username, profile_picture_url, call_schedule, created_at FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).all();
    const config = results && results.length > 0 ? results[0] : null;
    return c.json({ config: config || null, configs: results || [] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete WhatsApp Config
router.delete('/api/whatsapp/config/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('DELETE FROM whatsapp_configs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true, message: 'WhatsApp config deleted successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// WHATSAPP BUSINESS PROFILE API
// ==========================================

// GET WhatsApp Business Profile from Meta
router.get('/api/whatsapp/config/profile', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const phoneNumberId = c.req.query('phoneNumberId');
  if (!phoneNumberId) return c.json({ error: 'phoneNumberId query param required' }, 400);

  try {
    const config = await c.env.DB.prepare(
      'SELECT id, phone_number_id, waba_id, access_token, about, description, website, email, address, username, profile_picture_url FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, phoneNumberId).first<any>();
    if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

    const profileRes = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/whatsapp_business_profile?fields=about,description,email,websites,address,vertical,profile_picture_url`,
      { headers: { 'Authorization': `Bearer ${config.access_token}` } }
    );
    const profileData: any = await profileRes.json();

    if (profileData.data && profileData.data[0]) {
      const metaProfile = profileData.data[0];
      return c.json({
        profile: {
          about: metaProfile.about || config.about || '',
          description: metaProfile.description || config.description || '',
          website: metaProfile.websites?.[0] || config.website || '',
          email: metaProfile.email || config.email || '',
          address: metaProfile.address || config.address || '',
          vertical: metaProfile.vertical || '',
          profile_picture_url: metaProfile.profile_picture_url || '',
          username: config.username || '',
        },
        source: 'meta'
      });
    }

    return c.json({
      profile: {
        about: config.about || '',
        description: config.description || '',
        website: config.website || '',
        email: config.email || '',
        address: config.address || '',
        username: config.username || '',
      },
      source: 'local'
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT Update WhatsApp Business Profile (syncs to Meta + DB)
router.put('/api/whatsapp/config/profile', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phone_number_id, about, description, website, email, address, username } = await c.req.json();
  if (!phone_number_id) return c.json({ error: 'phone_number_id required' }, 400);

  try {
    const config = await c.env.DB.prepare(
      'SELECT id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, phone_number_id).first<any>();
    if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

    const metaPayload: any = { messaging_product: 'whatsapp' };
    if (about !== undefined) metaPayload.about = about;
    if (description !== undefined) metaPayload.description = description;
    if (email !== undefined) metaPayload.email = email;
    if (website !== undefined) metaPayload.websites = [website];
    if (address !== undefined) metaPayload.address = address;

    if (Object.keys(metaPayload).length > 0) {
      const syncRes = await fetch(
        `https://graph.facebook.com/v20.0/${phone_number_id}/whatsapp_business_profile`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metaPayload)
        }
      );
      const syncData = await syncRes.json();
      if (!syncRes.ok) {
        console.error('[Profile] Meta API error:', syncData);
      }
    }

    const updates: string[] = [];
    const binds: any[] = [];
    if (about !== undefined) { updates.push('about = ?'); binds.push(about); }
    if (description !== undefined) { updates.push('description = ?'); binds.push(description); }
    if (website !== undefined) { updates.push('website = ?'); binds.push(website); }
    if (email !== undefined) { updates.push('email = ?'); binds.push(email); }
    if (address !== undefined) { updates.push('address = ?'); binds.push(address); }
    if (username !== undefined) { updates.push('username = ?'); binds.push(username); }

    if (updates.length > 0) {
      binds.push(config.id);
      await c.env.DB.prepare(
        `UPDATE whatsapp_configs SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...binds).run();
    }

    return c.json({ success: true, message: 'Profile updated' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST Upload & update WhatsApp Business Profile picture
router.post('/api/whatsapp/config/profile/picture', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    const phoneNumberId = body['phone_number_id'] as string || c.req.query('phoneNumberId');

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded' }, 400);
    }
    if (!phoneNumberId) {
      return c.json({ error: 'phone_number_id required' }, 400);
    }

    const config = await c.env.DB.prepare(
      'SELECT id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, phoneNumberId).first<any>();
    if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

    // Save to R2
    const arrayBuffer = await file.arrayBuffer();
    const extension = file.name ? file.name.split('.').pop() : 'png';
    const key = `profile_${crypto.randomUUID()}.${extension}`;
    await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'image/png' }
    });
    const origin = new URL(c.req.url).origin;
    const r2Url = `${origin}/api/public/media/${key}`;

    // Update profile_picture_url in local DB
    await c.env.DB.prepare(
      'UPDATE whatsapp_configs SET profile_picture_url = ? WHERE id = ?'
    ).bind(r2Url, config.id).run();

    // Try to sync to Meta API (non-blocking)
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Step 1: Get App ID from the token
          const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${config.access_token}&access_token=${config.access_token}`);
          const debugData: any = await debugRes.json();
          const appId = debugData.data?.app_id;

          if (!appId) {
            console.error('[Profile] Failed to fetch app_id for Resumable Upload API:', debugData);
            return;
          }

          // Step 2: Create Resumable Upload Session
          const sessionRes = await fetch(
            `https://graph.facebook.com/v20.0/${appId}/uploads?file_length=${arrayBuffer.byteLength}&file_type=${file.type || 'image/png'}`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${config.access_token}` }
            }
          );
          const sessionData: any = await sessionRes.json();
          const uploadSessionId = sessionData.id;

          if (!uploadSessionId) {
            console.error('[Profile] Failed to create upload session:', sessionData);
            return;
          }

          // Step 3: Upload the actual file bytes
          const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${uploadSessionId}`, {
            method: 'POST',
            headers: {
              'Authorization': `OAuth ${config.access_token}`,
              'file_offset': '0'
            },
            body: arrayBuffer
          });
          const uploadData: any = await uploadRes.json();
          const handle = uploadData.h;

          if (uploadRes.ok && handle) {
            // Step 4: Update business profile with the upload handle
            await fetch(
              `https://graph.facebook.com/v20.0/${phoneNumberId}/whatsapp_business_profile`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${config.access_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messaging_product: 'whatsapp', profile_picture_handle: handle })
              }
            );
            console.log(`[Profile] Meta profile picture updated for ${phoneNumberId}`);
          } else {
            console.error('[Profile] Meta Resumable Upload failed:', uploadData);
          }
        } catch (e) {
          console.error('[Profile] Meta sync error:', e);
        }
      })()
    );

    return c.json({ success: true, profile_picture_url: r2Url });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// CALL SCHEDULE API
// ==========================================

// GET call schedule for a WhatsApp config
router.get('/api/whatsapp/config/call-schedule', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const phoneNumberId = c.req.query('phoneNumberId');
  if (!phoneNumberId) return c.json({ error: 'phoneNumberId query param required' }, 400);

  try {
    const config = await c.env.DB.prepare(
      'SELECT id, calling_enabled, call_schedule FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, phoneNumberId).first<any>();

    if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

    let schedule = { enabled: false, start_time: '09:00', end_time: '17:00', days: [1,2,3,4,5] };
    try { schedule = JSON.parse(config.call_schedule || '{}'); } catch (e) {}

    return c.json({
      calling_enabled: config.calling_enabled === 1,
      schedule
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT update call schedule
router.put('/api/whatsapp/config/call-schedule', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phone_number_id, calling_enabled, schedule } = await c.req.json();
  if (!phone_number_id) return c.json({ error: 'phone_number_id required' }, 400);

  try {
    const config = await c.env.DB.prepare(
      'SELECT id FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, phone_number_id).first<any>();
    if (!config) return c.json({ error: 'WhatsApp config not found' }, 404);

    if (calling_enabled !== undefined) {
      await c.env.DB.prepare('UPDATE whatsapp_configs SET calling_enabled = ? WHERE id = ?')
        .bind(calling_enabled ? 1 : 0, config.id).run();
    }

    if (schedule !== undefined) {
      const scheduleStr = JSON.stringify({
        enabled: schedule.enabled || false,
        start_time: schedule.start_time || '09:00',
        end_time: schedule.end_time || '17:00',
        days: Array.isArray(schedule.days) ? schedule.days : [1,2,3,4,5]
      });
      await c.env.DB.prepare('UPDATE whatsapp_configs SET call_schedule = ? WHERE id = ?')
        .bind(scheduleStr, config.id).run();
    }

    return c.json({ success: true, message: 'Call schedule updated' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get all local and Meta templates
router.get('/api/whatsapp/templates', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {


    const { limit, offset } = pagination(c, 100);
    const { results: localTemplates } = await c.env.DB.prepare(
      'SELECT * FROM whatsapp_templates WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(workspaceId, limit, offset).all();

    const config = await c.env.DB.prepare(
      'SELECT waba_id, access_token FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC'
    ).bind(workspaceId).first();

    let metaTemplates: any[] = [];
    let fetchError = null;

    if (config && config.waba_id && config.access_token && config.access_token !== 'â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢') {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${config.waba_id}/message_templates`, {
          headers: { 'Authorization': `Bearer ${config.access_token}` }
        });
        const data: any = await res.json();
        if (data && data.data) {
          metaTemplates = data.data.map((t: any) => {
            const bodyComp = t.components?.find((comp: any) => comp.type === 'BODY');
            return {
              id: t.id,
              name: t.name,
              category: t.category,
              language: t.language,
              body_text: bodyComp ? bodyComp.text : '',
              status: t.status,
              is_meta: true
            };
          });
        } else if (data && data.error) {
          fetchError = data.error.message;
        }
      } catch (e: any) {
        fetchError = e.message;
      }
    }

    return c.json({
      success: true,
      local: localTemplates || [],
      meta: metaTemplates || [],
      metaError: fetchError
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create/Submit WhatsApp Template
router.post('/api/whatsapp/templates', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { name, category, language, body_text } = await c.req.json();
  if (!name || !body_text) return c.json({ error: 'Name and body text are required' }, 400);
  if (String(name).trim().length > 128) return c.json({ error: 'Template name is too long (max 128 characters)' }, 400);
  if (String(body_text).length > 1024) return c.json({ error: 'Template body is too long (Meta limit is 1024 characters)' }, 400);

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const templateId = crypto.randomUUID();

  try {


    const config = await c.env.DB.prepare(
      'SELECT waba_id, access_token FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC'
    ).bind(workspaceId).first();

    let metaSuccess = false;
    let metaError = null;

    if (config && config.waba_id && config.access_token && config.access_token !== 'â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢') {
      try {
        const payload = {
          name: cleanName,
          category: category || 'UTILITY',
          language: language || 'en_US',
          components: [
            {
              type: 'BODY',
              text: body_text
            }
          ]
        };

        const res = await fetch(`https://graph.facebook.com/v19.0/${config.waba_id}/message_templates`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data: any = await res.json();
        if (data && data.id) {
          metaSuccess = true;
        } else if (data && data.error) {
          metaError = data.error.message;
        }
      } catch (e: any) {
        metaError = e.message;
      }
    }

    await c.env.DB.prepare(
      `INSERT INTO whatsapp_templates (id, workspace_id, name, category, language, body_text, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      templateId,
      workspaceId,
      cleanName,
      category || 'UTILITY',
      language || 'en_US',
      body_text,
      metaSuccess ? 'PENDING' : 'APPROVED'
    ).run();

    return c.json({
      success: true,
      message: metaSuccess ? 'Template submitted to Meta and saved locally!' : 'Template saved locally!',
      id: templateId,
      metaSubmitted: metaSuccess,
      metaError: metaError
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete local template
router.delete('/api/whatsapp/templates/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('DELETE FROM whatsapp_templates WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true, message: 'Template deleted successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Send Template Message
router.post('/api/whatsapp/templates/send', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, templateName, languageCode, parameters, phoneNumberId } = await c.req.json();
  if (!to || !templateName) return c.json({ error: 'Missing to or templateName' }, 400);

  try {
    let config: any = null;
    if (phoneNumberId) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phoneNumberId).first();
    }
    if (!config) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp is not configured for this workspace' }, 400);

    const components: any[] = [];
    if (parameters && Array.isArray(parameters) && parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map(p => ({
          type: 'text',
          text: p
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode || 'en_US'
        },
        components: components.length > 0 ? components : undefined
      }
    };

    const res = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await res.json();
    if (data.error) {
      return c.json({ error: data.error.message }, 400);
    }

    // Save to database as a sent message
    let contact = await c.env.DB.prepare('SELECT id FROM contacts WHERE workspace_id = ? AND platform_contact_id = ?').bind(workspaceId, to).first();
    let contactId = contact?.id;
    if (!contactId) {
      contactId = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name) VALUES (?, ?, ?, ?, ?)')
        .bind(contactId, workspaceId, 'whatsapp', to, to).run();
    }

    let conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id = ?').bind(workspaceId, contactId, config.phone_number_id).first<{ id: string }>();
    if (!conv) {
      // Fallback for older conversations without phone_number_id set
      conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id IS NULL').bind(workspaceId, contactId).first<{ id: string }>();
      if (conv) {
        await c.env.DB.prepare('UPDATE conversations SET phone_number_id = ? WHERE id = ?').bind(config.phone_number_id, conv.id).run();
      }
    }
    let convId = conv?.id;
    if (!convId) {
      convId = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(convId, workspaceId, contactId, 'whatsapp', 'open', config.phone_number_id).run();
    }

    const msgId = crypto.randomUUID();
    const content = `[Template Message] ${templateName}`;
    const platformMsgId = data.messages?.[0]?.id || crypto.randomUUID();
    const templateMsgNow = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, platform_message_id, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(msgId, convId, 'agent', 'text', content, platformMsgId, 'whatsapp', templateMsgNow).run();

    // Broadcast template message via global Durable Object
    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = c.env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: msgId,
            conversation_id: convId,
            sender_type: 'agent',
            message_type: 'text',
            content,
            platform_message_id: platformMsgId,
            platform: 'whatsapp',
            created_at: templateMsgNow
          }
        })
      }));
    } catch (doErr) {
      console.error("Failed to broadcast template message to DO:", doErr);
    }

    return c.json({ success: true, message: 'Template message sent successfully!', data });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// ==========================================
// WHATSAPP FLOWS MANAGEMENT
// ==========================================

// Get all flows for workspace
router.get('/api/whatsapp/flows', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {


    const { limit, offset } = pagination(c, 100);
    const { results: flows } = await c.env.DB.prepare(
      'SELECT * FROM whatsapp_flows WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(workspaceId, limit, offset).all();

    return c.json({ success: true, flows: flows || [] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create or Update flow
router.post('/api/whatsapp/flows', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { id, name, categories, screens_json, status } = await c.req.json();
  if (!name) return c.json({ error: 'Name is required' }, 400);

  const flowId = id || crypto.randomUUID();
  const finalStatus = status || 'DRAFT';
  const finalCategories = categories || 'UTILITY';
  const finalScreens = screens_json || JSON.stringify([
    {
      id: "screen_1",
      title: "First Screen",
      layout: {
        children: [
          { type: "text", content: "Welcome to our Whatsapp Flow form" },
          { type: "input", label: "Full Name", placeholder: "Enter name", required: true, name: "fullName" },
          { type: "submit", label: "Submit" }
        ]
      }
    }
  ]);

  try {


    let existing = null;
    if (id) {
      existing = await c.env.DB.prepare('SELECT id FROM whatsapp_flows WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
    }

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE whatsapp_flows SET name = ?, categories = ?, screens_json = ?, status = ? WHERE id = ? AND workspace_id = ?`
      ).bind(name, finalCategories, finalScreens, finalStatus, flowId, workspaceId).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO whatsapp_flows (id, workspace_id, name, categories, screens_json, status) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(flowId, workspaceId, name, finalCategories, finalScreens, finalStatus).run();
    }

    return c.json({ success: true, message: 'Flow saved successfully', id: flowId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete flow
router.delete('/api/whatsapp/flows/:id', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare('DELETE FROM whatsapp_flows WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true, message: 'Flow deleted successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Publish flow
router.post('/api/whatsapp/flows/:id/publish', requireRole('owner', 'admin'), async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);
  const id = c.req.param('id');

  try {
    await c.env.DB.prepare("UPDATE whatsapp_flows SET status = 'PUBLISHED' WHERE id = ? AND workspace_id = ?").bind(id, workspaceId).run();
    return c.json({ success: true, message: 'Flow published successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});


// Send WhatsApp Message
router.post('/api/whatsapp/send', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { to, text, conversationId, type = 'text', mediaUrl, r2Url, filename, location, contacts, phoneNumberId } = await c.req.json();
  if (!to || !conversationId) return c.json({ error: 'Missing required fields' }, 400);

  try {
    // Verify conversation belongs to workspace
    const convCheck = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?')
      .bind(conversationId, workspaceId).first();
    if (!convCheck) return c.json({ error: 'Conversation not found in this workspace' }, 404);

    let config: any = null;
    if (phoneNumberId) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?').bind(workspaceId, phoneNumberId).first();
    }
    if (!config) {
      config = await c.env.DB.prepare('SELECT phone_number_id, access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp is not configured for this workspace' }, 400);

    // Build the Meta Cloud API payload
    let payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: type
    };

    if (type === 'text') {
      if (!text) return c.json({ error: 'Text content is required for text messages' }, 400);
      // WhatsApp text body limit is 4096 characters; reject oversized payloads
      // before they reach the Meta API.
      if (String(text).length > 4096) {
        return c.json({ error: 'Message is too long. WhatsApp limit is 4096 characters.' }, 400);
      }
      payload.text = { preview_url: false, body: text };
    } else if (type === 'image') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for image messages' }, 400);
      // Compute mediaObj only inside type block
      const isMediaId = !mediaUrl.startsWith('http') && !mediaUrl.startsWith('/');
      let finalMediaUrl = mediaUrl;
      if (mediaUrl.startsWith('/')) {
        const origin = new URL(c.req.url).origin;
        finalMediaUrl = `${origin}${mediaUrl}`;
      }
      payload.image = { ...(isMediaId ? { id: mediaUrl } : { link: finalMediaUrl }), caption: text || "" };
    } else if (type === 'video') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for video messages' }, 400);
      const isMediaId = !mediaUrl.startsWith('http') && !mediaUrl.startsWith('/');
      let finalMediaUrl = mediaUrl;
      if (mediaUrl.startsWith('/')) {
        const origin = new URL(c.req.url).origin;
        finalMediaUrl = `${origin}${mediaUrl}`;
      }
      payload.video = { ...(isMediaId ? { id: mediaUrl } : { link: finalMediaUrl }), caption: text || "" };
    } else if (type === 'document') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for document messages' }, 400);
      const isMediaId = !mediaUrl.startsWith('http') && !mediaUrl.startsWith('/');
      let finalMediaUrl = mediaUrl;
      if (mediaUrl.startsWith('/')) {
        const origin = new URL(c.req.url).origin;
        finalMediaUrl = `${origin}${mediaUrl}`;
      }
      payload.document = { ...(isMediaId ? { id: mediaUrl } : { link: finalMediaUrl }), filename: filename || 'Document.pdf', caption: text || "" };
    } else if (type === 'location') {
      if (!location || !location.latitude || !location.longitude) {
        return c.json({ error: 'Latitude and longitude are required for location messages' }, 400);
      }
      payload.location = {
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name || 'Location',
        address: location.address || ''
      };
    } else if (type === 'contacts') {
      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return c.json({ error: 'Contacts list is required' }, 400);
      }
      payload.contacts = contacts;
    } else {
      return c.json({ error: `Unsupported send type: ${type}` }, 400);
    }

    // Call Meta Cloud API
    const metaResponse = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const metaData: any = await metaResponse.json();
    if (metaData.error) {
      return c.json({ error: metaData.error.message }, 400);
    }

    // Ensure database columns are up-to-date


    // Save sent message to database
    let contentToSave = text;
    if (type === 'location') {
      contentToSave = JSON.stringify(location);
    } else if (type === 'contacts') {
      contentToSave = JSON.stringify(contacts);
    } else if (type === 'document' && !text) {
      contentToSave = filename || 'Document.pdf';
    }

    const savedMessageId = crypto.randomUUID();
    const platformMsgId = metaData.messages?.[0]?.id || crypto.randomUUID();
    const mediaUrlToSave = r2Url || mediaUrl || null;
    const agentMsgNow = new Date().toISOString();

    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        savedMessageId,
        conversationId,
        'agent',
        type,
        contentToSave || null,
        mediaUrlToSave,
        platformMsgId,
        'whatsapp',
        agentMsgNow
      ).run();

    // Update conversation
    await c.env.DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(conversationId).run();

    // Broadcast message via global Durable Object
    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = c.env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: savedMessageId,
            conversation_id: conversationId,
            sender_type: 'agent',
            message_type: type,
            content: contentToSave || null,
            media_url: mediaUrlToSave,
            platform_message_id: platformMsgId,
            platform: 'whatsapp',
            status: 'sent',
            created_at: agentMsgNow
          }
        })
      }));
    } catch (doErr) {
      console.error("Failed to broadcast message to DO:", doErr);
    }

    return c.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: savedMessageId,
        platform_message_id: platformMsgId,
        status: 'sent',
        created_at: agentMsgNow
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get Inbox Conversations (unified: whatsapp, email, and future IG/FB DMs)

export default router;
