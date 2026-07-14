'use client';

import { useEffect } from 'react';

export function FcmRegistration() {
  useEffect(() => {
    async function registerFcm() {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          // Only register push tokens for authenticated users.
          const meRes = await fetch('/api/auth/me');
          if (!meRes.ok) return;
          const meData: any = await meRes.json();
          if (!meData.user) return;

          const { requestFcmToken, onMessageListener } = await import('../lib/firebase-client');
          const token = await requestFcmToken();
          if (token) {
            await fetch('/api/fcm/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, device_type: 'web' })
            });
            console.log("FCM token registered with server.");
          }

          // Keep listening for foreground messages (onMessageListener resolves once).
          const listenLoop = async () => {
            try {
              while (true) {
                const payload: any = await onMessageListener();
                if (payload) {
                  console.log("Foreground message received:", payload);
                }
              }
            } catch (e) {
              console.error("FCM listener error:", e);
            }
          };
          listenLoop();
        } catch (e) {
          console.error("Failed to register FCM", e);
        }
      }
    }

    registerFcm();
  }, []);

  return null;
}
