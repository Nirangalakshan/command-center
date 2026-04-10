import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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

// ─── Auth-ready gate ────────────────────────────────────────────────────────
// Resolves once FirebaseAuthProvider has fully initialised auth
// (including any auto-login with agent credentials).

let _authReady = false;
let _resolve: (() => void) | null = null;

const _authReadyPromise = new Promise<void>((resolve) => {
  _resolve = () => { _authReady = true; resolve(); };
  setTimeout(() => { _authReady = true; resolve(); }, 10_000);
});

/** Called by FirebaseAuthProvider once auth state is fully settled. */
export function signalAuthReady(): void {
  _resolve?.();
  _resolve = null;
}

/**
 * Awaits until Firebase auth is fully initialised (including auto-login).
 * Resolves immediately if auth is already ready or a user is signed in.
 */
export function waitForAuth(): Promise<void> {
  if (_authReady || auth.currentUser) return Promise.resolve();
  return _authReadyPromise;
}
