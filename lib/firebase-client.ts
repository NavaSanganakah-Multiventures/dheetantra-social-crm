import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  if (typeof window === 'undefined') return null;
  return getApps().length === 0 && firebaseConfig.apiKey ? initializeApp(firebaseConfig) : getApps()[0];
}

export async function requestFcmToken() {
  const app = getFirebaseApp();
  if (!app) return null;
  const supported = await isSupported();
  if (!supported) return null;
  
  try {
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      });
      return token;
    }
  } catch (e) {
    console.error("FCM Token error:", e);
  }
  return null;
}

export function onMessageListener() {
  const app = getFirebaseApp();
  if (!app) return new Promise((resolve) => resolve(null));
  const messaging = getMessaging(app);
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
}
