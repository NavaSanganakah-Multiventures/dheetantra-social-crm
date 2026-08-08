'use client';

import { useEffect } from 'react';
import { requestFcmToken, onForegroundMessage, deleteFcmToken } from '../lib/firebase-client';

function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, options);
  } catch (e) {
    console.error('Browser notification error:', e);
  }
}

export function FcmRegistration() {
  useEffect(() => {
    async function registerFcm() {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      try {
        const token = await requestFcmToken();
        if (token) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const workspaceId = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null;
          if (workspaceId) headers['x-workspace-id'] = workspaceId;
          await fetch('/api/fcm/register', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ token, device_type: 'web' })
          });
          console.log('FCM web token registered with server.');
        }

        onForegroundMessage((payload: any) => {
          console.log('Foreground FCM message received:', payload);
          const data = payload.data || {};
          const type = data.type || '';
          const title = payload.notification?.title || 'DheeTantra';
          const body = payload.notification?.body || 'New update';

          showBrowserNotification(title, {
            body,
            requireInteraction: type === 'incoming_call',
            data,
          });

          // Broadcast to dashboard UI so it can show in-app overlays without refresh.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('fcm-foreground-message', { detail: payload }));
          }
        });
      } catch (e) {
        console.error('Failed to register FCM', e);
      }
    }

    registerFcm();

    return () => {
      // Token cleanup on unmount not needed — page reloads/closes keep token
      // so background push keeps working. Explicit logout can call deleteFcmToken().
    };
  }, []);

  return null;
}

/**
 * Explicitly remove the web FCM token from the server and from Firebase.
 * Call this from logout flow.
 */
export async function unregisterFcmToken() {
  try {
    await fetch('/api/fcm/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch (e) {
    console.error('Server FCM unregister error:', e);
  }
  await deleteFcmToken();
}
