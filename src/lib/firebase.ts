import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured()) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else if (import.meta.env.DEV) {
  console.warn(
    '[firebase] Missing VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID — uncomment Firebase vars in .env. Chat/BMS Firestore features are disabled.',
  );
}

export { app, db, auth };

// ─── Auth-ready gate ────────────────────────────────────────────────────────

let _authReady = false;
let _pendingResolvers: (() => void)[] = [];
let _waitPromise: Promise<void> | null = null;

function _settle() {
  if (_authReady) return;
  _authReady = true;
  for (const r of _pendingResolvers) r();
  _pendingResolvers = [];
}

/** Called by FirebaseAuthProvider once auth state is fully settled. */
export function signalAuthReady(): void {
  _settle();
}

/**
 * Blocks until Firebase auth is initialised (or skipped when Firebase is not configured).
 */
export function waitForAuth(): Promise<void> {
  if (!auth || _authReady || auth.currentUser) return Promise.resolve();

  if (!_waitPromise) {
    _waitPromise = new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        _settle();
        resolve();
      };

      _pendingResolvers.push(done);

      const unsub = onAuthStateChanged(auth!, (user) => {
        if (user) {
          unsub();
          done();
        }
      });

      setTimeout(() => {
        unsub();
        done();
      }, 10_000);
    });
  }

  return _waitPromise;
}
