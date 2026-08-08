/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker for the DheeTantra web dashboard.
// Handles background/closed-tab push messages (new_message, incoming_call,
// missed_call) and shows browser notifications.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

let messaging = null;

async function loadConfig() {
  try {
    const res = await fetch('/api/fcm/config');
    if (!res.ok) throw new Error('Failed to load Firebase config');
    return await res.json();
  } catch (e) {
    console.error('[FCM SW] Config load failed:', e);
    return null;
  }
}

async function initFirebase() {
  if (messaging) return messaging;
  const config = await loadConfig();
  if (!config || !config.apiKey) {
    console.warn('[FCM SW] No Firebase config — background push disabled');
    return null;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }
  messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] Background message:', payload);
    const data = payload.data || {};
    const type = data.type || '';
    const title = payload.notification?.title || 'DheeTantra';
    const body = payload.notification?.body || 'New update';

    const notificationOptions = {
      body,
      requireInteraction: type === 'incoming_call',
      tag: type === 'incoming_call' ? `call-${data.id || Date.now()}` : `msg-${data.messageId || Date.now()}`,
      data: { ...data, click_action: '/dashboard/' },
    };

    return self.registration.showNotification(title, notificationOptions);
  });

  return messaging;
}

// Install immediately start initializing Firebase so it is ready before any push.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(initFirebase());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Firebase SDK normally handles push, but if init is still pending fall back
  // to a generic notification so something is shown.
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const data = payload.data || {};
    const title = payload.notification?.title || 'DheeTantra';
    const body = payload.notification?.body || 'New update';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        data: { ...data, click_action: '/dashboard/' },
      })
    );
  } catch (e) {
    console.error('[FCM SW] Push parse error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const urlToOpen = data.click_action || '/dashboard/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Agar dashboard tab pehle se khula hai toh uspar focus karo.
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
