'use client';

import { useEffect } from 'react';

export function FcmRegistration() {
  useEffect(() => {
    async function registerFcm() {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
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

          const listen = async () => {
            try {
              const payload: any = await onMessageListener();
              if (payload) {
                console.log("Foreground message received:", payload);
              }
            } catch (e) {}
          };
          listen();
        } catch (e) {
          console.error("Failed to register FCM", e);
        }
      }
    }

    registerFcm();
  }, []);

  return null;
}
