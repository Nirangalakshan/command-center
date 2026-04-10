import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initialising during hot-reload in dev
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);

/**
 * Resolves once Firebase has determined the initial auth state.
 * Prevents API calls from racing ahead of auth restoration from IndexedDB.
 */
let _authReadyPromise: Promise<User | null> | null = null;

export function waitForAuth(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (_authReadyPromise) return _authReadyPromise;

  _authReadyPromise = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
  return _authReadyPromise;
}
