import type { Env } from '../src/types';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * Generates an OAuth2 access token for Firebase Cloud Messaging using a Service Account JSON.
 */
async function getFcmAccessToken(credentials: { client_email: string; private_key: string }): Promise<string> {
  const { client_email, private_key } = credentials;

  // Cloudflare Workers use Web Crypto API, so we can use jose
  const privateKey = await importPKCS8(private_key, 'RS256');

  const jwt = await new SignJWT({
    iss: client_email,
    sub: client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });

  const data = await response.json() as any;
  if (!response.ok) {
    throw new Error(`Failed to generate FCM token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Sends a push notification using Firebase Cloud Messaging (FCM) v1 API.
 * Uses cached OAuth token to avoid repeated handshake when called in batch.
 */
let _cachedFcmTokens = new Map<string, { token: string; expiresAt: number }>();

async function getOrRefreshFcmToken(serviceAccountJson: string): Promise<{ token: string; projectId: string }> {
  const credentials = JSON.parse(serviceAccountJson);
  const projectId = credentials.project_id;
  const cached = _cachedFcmTokens.get(projectId);
  if (cached && Date.now() < cached.expiresAt) {
    return { token: cached.token, projectId };
  }
  const accessToken = await getFcmAccessToken(credentials);
  _cachedFcmTokens.set(projectId, { token: accessToken, expiresAt: Date.now() + 55 * 60 * 1000 }); // cache for 55 min
  return { token: accessToken, projectId };
}

export async function sendPushNotification(
  env: Env,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const serviceAccountJson = await env.SECRETS_KV.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    console.warn("FCM_SERVICE_ACCOUNT_JSON missing from KV. Push notification skipped");
    return;
  }

  try {
    const { token: accessToken, projectId } = await getOrRefreshFcmToken(serviceAccountJson);

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    
    const fcmPayload = {
      message: {
        token: token,
        notification: { title, body },
        data: data || {}
      }
    };

    const response = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fcmPayload)
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("FCM Send Error:", result);
    }
  } catch (err) {
    console.error("Failed to send push notification via FCM:", err);
  }
}

/**
 * Sends push notifications to MULTIPLE tokens in parallel.
 * Fetches OAuth token ONCE for the entire batch.
 */
export async function sendBatchPushNotifications(
  env: Env,
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) {
  if (tokens.length === 0) return;

  const serviceAccountJson = await env.SECRETS_KV.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    console.warn("FCM_SERVICE_ACCOUNT_JSON missing from KV. Batch push skipped");
    return;
  }

  try {
    const { token: accessToken, projectId } = await getOrRefreshFcmToken(serviceAccountJson);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    // Send all notifications in parallel with a shared access token
    await Promise.allSettled(tokens.map(token => {
      const fcmPayload = {
        message: {
          token,
          notification: { title, body },
          data: data || {}
        }
      };
      return fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fcmPayload)
      }).then(r => r.json());
    }));
  } catch (err) {
    console.error("Failed to send batch push notifications:", err);
  }
}
