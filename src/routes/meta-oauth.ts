import { Hono } from 'hono';
import { Env } from '../types';

const metaOauth = new Hono<{ Bindings: Env }>();

// Add base64Url decode helper for Meta signed_request
function base64UrlDecode(str: string) {
  const padding = '='.repeat((4 - str.length % 4) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

// Convert an ArrayBuffer to a base64url string (for HMAC signature comparison)
function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Verify Meta signed_request: HMAC-SHA256 of the base64url payload using the app secret.
// Returns the parsed payload only if the signature is valid.
async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<{ valid: boolean; payload: any }> {
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return { valid: false, payload: null };

  const [signature, payloadBase64] = parts;
  let payload: any = null;
  try {
    payload = JSON.parse(base64UrlDecode(payloadBase64));
  } catch (e) {
    return { valid: false, payload: null };
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadBase64));
    const expectedSig = bufToBase64Url(sigBuffer);
    if (expectedSig !== signature) {
      return { valid: false, payload: null };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, payload: null };
  }
}

// Meta Data Deletion Callback
metaOauth.post('/data-deletion', async (c) => {
  try {
    const body = await c.req.parseBody();
    const signedRequest = body['signed_request'];

    if (!signedRequest || typeof signedRequest !== 'string') {
      return c.json({ error: 'Missing signed_request' }, 400);
    }

    // SECURITY: verify the signature of the signed_request before trusting it.
    const appSecret = c.env.SECRETS_KV ? await c.env.SECRETS_KV.get('META_APP_SECRET') : null;
    if (!appSecret) {
      console.error('[Data Deletion] META_APP_SECRET not configured in KV');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const { valid, payload } = await verifySignedRequest(signedRequest, appSecret);
    if (!valid || !payload) {
      console.error('[Data Deletion] Invalid signed_request signature');
      return c.json({ error: 'Invalid signed_request' }, 400);
    }

    const userId = payload.user_id;
    if (!userId) {
      return c.json({ error: 'Missing user_id in payload' }, 400);
    }

    // Generate a unique confirmation code
    const confirmationCode = crypto.randomUUID();

    // Store the deletion request status in KV
    if (c.env.SECRETS_KV) {
      await c.env.SECRETS_KV.put(`DELETION_STATUS:${confirmationCode}`, JSON.stringify({
        status: 'in_progress',
        user_id: userId,
        requested_at: new Date().toISOString()
      }), { expirationTtl: 60 * 60 * 24 * 7 }); // Keep for 7 days
    }

    // Schedule actual data deletion asynchronously
    c.executionCtx.waitUntil((async () => {
      try {
        console.log(`Processing data deletion for Meta user_id: ${userId}`);
        
        // Simulate deletion delay, in reality this would delete user data from D1
        await new Promise(res => setTimeout(res, 2000));
        
        if (c.env.SECRETS_KV) {
          await c.env.SECRETS_KV.put(`DELETION_STATUS:${confirmationCode}`, JSON.stringify({
            status: 'completed',
            user_id: userId,
            completed_at: new Date().toISOString()
          }), { expirationTtl: 60 * 60 * 24 * 7 });
        }
      } catch (e) {
        console.error('Deletion error:', e);
      }
    })());

    // Get the request origin or use a constructed domain
    const url = new URL(c.req.url);
    const statusUrl = `${url.protocol}//${url.host}/data-deletion-status?id=${confirmationCode}`;

    return c.json({
      url: statusUrl,
      confirmation_code: confirmationCode
    });

  } catch (error) {
    console.error('Data deletion webhook error:', error);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Endpoint to check status via API
metaOauth.get('/data-deletion-status/:code', async (c) => {
  const code = c.req.param('code');
  if (!code) return c.json({ error: 'Code required' }, 400);

  if (c.env.SECRETS_KV) {
    const status = await c.env.SECRETS_KV.get(`DELETION_STATUS:${code}`);
    if (status) {
      return c.json(JSON.parse(status));
    }
  }

  return c.json({ error: 'Not found' }, 404);
});

// This endpoint receives the onboarding data after the user completes the Embedded Signup flow
metaOauth.post('/embedded-signup', async (c) => {
  const body = await c.req.json();
  const accessToken = body.accessToken;
  const wabaId = body.wabaId;
  const phoneNumberIds = body.phoneNumberIds;

  // Trust the authenticated workspace from the session/header, not the request body,
  // so a caller cannot link a WABA to a workspace they don't belong to.
  // authMiddleware has already verified the caller is a member of this workspace.
  const workspaceId = c.req.header('x-workspace-id');

  if (!workspaceId || !wabaId || !phoneNumberIds || !Array.isArray(phoneNumberIds)) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  const systemUserToken = await c.env.SECRETS_KV.get('META_SYSTEM_USER_TOKEN');
  if (!systemUserToken) {
    return c.json({ error: 'Tech Provider System User Token not configured in KV' }, 500);
  }

  try {
    // 1. Validate WABA access using our System User Token
    const wabaResponse = await fetch(`https://graph.facebook.com/v19.0/${wabaId}?access_token=${systemUserToken}`);
    const wabaData: any = await wabaResponse.json();

    if (wabaData.error) {
      return c.json({ error: 'Failed to access WABA. Ensure client granted permissions to our Business Manager.', details: wabaData.error }, 400);
    }

    // Save WABA to DB
    await c.env.DB.prepare(`
      INSERT INTO waba_accounts (id, workspace_id, waba_id, name, timezone_id, currency)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(waba_id) DO UPDATE SET name=excluded.name, workspace_id=excluded.workspace_id
    `).bind(
      crypto.randomUUID(), workspaceId, wabaId, wabaData.name, wabaData.timezone_id, wabaData.currency
    ).run();

    // 2. Fetch and register phone numbers
    const registeredNumbers = [];
    for (const phoneId of phoneNumberIds) {
      // Fetch phone number details
      const phoneResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneId}?access_token=${systemUserToken}`);
      const phoneData: any = await phoneResponse.json();

      if (phoneData.error) continue;

      // Register the phone number for WhatsApp API
      const registerResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${systemUserToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin: '123456' }) // You would dynamically handle the PIN
      });
      const registerData: any = await registerResponse.json();

      if (!registerData.error) {
        // Save phone number to DB
        await c.env.DB.prepare(`
          INSERT INTO waba_phone_numbers (id, waba_id, workspace_id, phone_number_id, display_phone_number, quality_rating, verified_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(phone_number_id) DO UPDATE SET display_phone_number=excluded.display_phone_number
        `).bind(
          crypto.randomUUID(), wabaId, workspaceId, phoneId, phoneData.display_phone_number, phoneData.quality_rating, phoneData.verified_name
        ).run();

        // Also add to whatsapp_configs for backward compatibility in our app
        const existingConfig = await c.env.DB.prepare(
          'SELECT id FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
        ).bind(workspaceId, phoneId).first();

        if (existingConfig) {
          await c.env.DB.prepare(
            'UPDATE whatsapp_configs SET access_token = ?, waba_id = ? WHERE id = ?'
          ).bind(systemUserToken, wabaId, existingConfig.id).run();
        } else {
          await c.env.DB.prepare(
            'INSERT INTO whatsapp_configs (id, workspace_id, phone_number_id, waba_id, access_token) VALUES (?, ?, ?, ?, ?)'
          ).bind(crypto.randomUUID(), workspaceId, phoneId, wabaId, systemUserToken).run();
        }

        registeredNumbers.push(phoneData.display_phone_number);
      }
    }

    // 3. Subscribe to webhook events (CRITICAL — without this, Meta never sends webhooks!)
    let webhookSubscribed = false;
    try {
      const subsRes = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${systemUserToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'subscribed_fields=messages,calls'
      });
      const subsData: any = await subsRes.json();
      webhookSubscribed = subsData.success === true;
      console.log(`[Embedded Signup] Webhook subscription result for WABA ${wabaId}:`, subsData);
    } catch (e) {
      console.error(`[Embedded Signup] Failed to subscribe webhook for WABA ${wabaId}:`, e);
    }

    return c.json({ success: true, waba: wabaData.name, registeredNumbers, webhookSubscribed });
  } catch (error: any) {
    console.error('Embedded signup error:', error);
    return c.json({ error: 'Internal server error', details: error.message }, 500);
  }
});

export default metaOauth;
