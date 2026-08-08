import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let messagingInstance: Messaging | null = null;

function hasCompleteConfig(cfg: Record<string, string | undefined>): boolean {
  return !!cfg.apiKey && !!cfg.projectId && !!cfg.appId && !!cfg.messagingSenderId;
}

async function loadFirebaseConfig(): Promise<Record<string, string>> {
  if (hasCompleteConfig(firebaseConfig)) {
    return firebaseConfig as Record<string, string>;
  }
  const res = await fetch('/api/fcm/config', { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error('Failed to load Firebase config from backend');
  }
  return (await res.json()) as Record<string, string>;
}

export async function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (typeof window === 'undefined') return null;
  const config = await loadFirebaseConfig();
  return getApps().length === 0 ? initializeApp(config) : getApps()[0];
}

export async function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (typeof window === 'undefined') return null;
  const supported = await isSupported();
  if (!supported) return null;
  const app = await getFirebaseApp();
  if (!app) return null;
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    return registration;
  } catch (e) {
    console.error('FCM service worker registration failed:', e);
    return null;
  }
}

export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  let registration: ServiceWorkerRegistration | null = null;
  if ('serviceWorker' in navigator) {
    registration = await registerServiceWorker();
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    let vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      // VAPID key bhi backend se le sakte hain agar env mein na ho.
      try {
        const configRes = await fetch('/api/fcm/config', { credentials: 'same-origin' });
        const config = (await configRes.json()) as { vapidKey?: string };
        vapidKey = config.vapidKey;
      } catch (_e) {
        // ignore
      }
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration ?? undefined,
    });
    return token;
  } catch (e) {
    console.error('FCM Token error:', e);
  }
  return null;
}

export async function deleteFcmToken(): Promise<void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return;
  try {
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(messaging);
  } catch (e) {
    console.error('FCM delete token error:', e);
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  getMessagingInstance().then((messaging) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      callback(payload);
    });
  });
}
