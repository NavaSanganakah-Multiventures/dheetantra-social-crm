/**
 * Firebase Cloud Messaging (FCM) HTTP v1 sender for Cloudflare Workers.
 *
 * Credentials come from the SECRETS_KV namespace (never env vars):
 *   - FCM_SERVICE_ACCOUNT_JSON: the Firebase service-account JSON (raw or base64)
 *   - FCM_PROJECT_ID: optional; falls back to project_id inside the service-account JSON
 * Config + OAuth2 access token (RS256 JWT via Web Crypto) are cached in module
 * scope with short TTLs so per-message KV reads and token mints are avoided.
 */

interface ServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

interface FcmConfig {
  sa: ServiceAccount;
  projectId: string;
}

const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedConfig: { config: FcmConfig; fetchedAt: number } | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;
// In-flight promises so parallel sends share a single KV read / token mint
// instead of stampeding the cache on expiry.
let configPromise: Promise<FcmConfig> | null = null;
let tokenPromise: Promise<string> | null = null;

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bytes = base64UrlDecode(base64);
  return bytes.buffer as ArrayBuffer;
}

/**
 * Loads the FCM config from SECRETS_KV, cached for a short TTL.
 */
async function getFcmConfig(env: any): Promise<FcmConfig> {
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig.config;
  }
  // Single-flight: concurrent callers await the same fetch.
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const kv = env.SECRETS_KV;
    if (!kv) {
      throw new Error('SECRETS_KV binding is not configured');
    }
    const [raw, rawProjectId] = await Promise.all([
      kv.get('FCM_SERVICE_ACCOUNT_JSON'),
      kv.get('FCM_PROJECT_ID'),
    ]);
    if (!raw) {
      throw new Error('FCM_SERVICE_ACCOUNT_JSON is not configured in SECRETS_KV');
    }

    let json = raw;
    // Accept base64-encoded JSON as well as raw JSON.
    if (!raw.trim().startsWith('{')) {
      try {
        json = atob(raw.trim());
      } catch {
        throw new Error('FCM_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64 JSON');
      }
    }

    const sa = JSON.parse(json) as ServiceAccount;
    const config: FcmConfig = {
      sa,
      projectId: rawProjectId || sa.project_id || '',
    };
    cachedConfig = { config, fetchedAt: Date.now() };
    return config;
  })();

  try {
    return await configPromise;
  } finally {
    configPromise = null;
  }
}

async function getAccessToken(env: any): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  // Single-flight: concurrent callers await the same token mint.
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const { sa } = await getFcmConfig(env);
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64UrlEncode(
      new TextEncoder().encode(
        JSON.stringify({
          iss: sa.client_email,
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
          aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        })
      )
    );
    const signingInput = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(sa.private_key || ''),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

    const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`FCM token exchange failed (${res.status}): ${body}`);
    }

    const data: any = await res.json();
    cachedToken = {
      value: data.access_token,
      // Refresh 5 minutes before expiry.
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return cachedToken.value;
  })();

  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

/**
 * Send a push notification to a single FCM device token.
 *
 * @param env      Worker bindings (needs SECRETS_KV with FCM_SERVICE_ACCOUNT_JSON)
 * @param token    Device registration token
 * @param title    Notification title
 * @param body     Notification body
 * @param data     Optional string-key/value data payload (deep-link metadata)
 * @param options  Optional delivery tuning (TTL, category, sound). For calls
 *                 use `category: 'call'` and `ttlSeconds: 0` so the device
 *                 wakes instantly even on aggressive OEM battery savers.
 */
export async function sendPushNotification(
  env: any,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  options?: { ttlSeconds?: number; category?: string; sound?: string; dataOnly?: boolean }
): Promise<{ success: boolean; unregistered?: boolean; error?: string }> {
  try {
    if (!token) return { success: false, error: 'Empty token' };
    const accessToken = await getAccessToken(env);
    const { projectId } = await getFcmConfig(env);
    if (!projectId) return { success: false, error: 'FCM project_id missing' };

    const stringData: Record<string, string> = {};
    if (options?.dataOnly) {
      stringData.title = String(title);
      stringData.body = String(body);
    }
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        stringData[k] = String(v);
      }
    }

    const androidNotification: Record<string, any> = {
      channel_id: 'dheetantra_alerts',
      sound: 'default',
      visibility: 'public',
    };
    if (options?.category) androidNotification.category = options.category;
    // ttlSeconds == 0  → immediate delivery only (calls). For messages use a
    // long TTL so the device gets every message when it comes back online.
    const ttl =
      options?.ttlSeconds === 0
        ? '0s'
        : options?.ttlSeconds
          ? `${options.ttlSeconds}s`
          : '2419200s';

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          ...(options?.dataOnly ? {} : { notification: { title, body } }),
          data: stringData,
          android: {
            priority: 'high',
            ...(ttl ? { ttl } : {}),
            notification: options?.dataOnly ? undefined : androidNotification,
          },
          apns: {
            headers: ttl ? { 'apns-priority': '10' } : undefined,
            payload: {
              aps: {
                ...(options?.dataOnly ? {} : { alert: { title, body } }),
                sound: options?.sound || 'default',
                'content-available': 1,
                'mutable-content': 1,
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      // 404/410 (or the FCM error codes below) mean the device token is no
      // longer valid — the caller should delete it from fcm_tokens.
      const unregistered =
        res.status === 404 ||
        res.status === 410 ||
        /UNREGISTERED|InvalidRegistration|NotRegistered/i.test(errBody);
      return { success: false, unregistered, error: `FCM send failed (${res.status}): ${errBody.slice(0, 300)}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown FCM error' };
  }
}
