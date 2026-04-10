import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

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

let _authReady = false;
let _pendingResolvers: (() => void)[] = [];
let _waitPromise: Promise<void> | null = null;

function _settle() {
  if (_authReady) return;
  _authReady = true;
  for (const r of _pendingResolvers) r();
  _pendingResolvers = [];
}

/** Called by FirebaseAuthProvider once auth state is fully settled (including auto-login). */
export function signalAuthReady(): void {
  console.log('[waitForAuth] signalAuthReady called, currentUser:', auth.currentUser?.email ?? 'null');
  _settle();
}

/**
 * Blocks until Firebase auth is fully initialised.
 * Resolves via whichever fires first:
 *  1. signalAuthReady() from FirebaseAuthProvider
 *  2. onAuthStateChanged reporting a signed-in user
 *  3. 10-second safety timeout
 */
export function waitForAuth(): Promise<void> {
  if (_authReady || auth.currentUser) return Promise.resolve();

  if (!_waitPromise) {
    _waitPromise = new Promise<void>((resolve) => {
      let settled = false;
      const done = (src: string) => {
        if (settled) return;
        settled = true;
        console.log(`[waitForAuth] resolved via ${src}, currentUser:`, auth.currentUser?.email ?? 'null');
        _settle();
        resolve();
      };

      _pendingResolvers.push(() => done('signalAuthReady'));

      const unsub = onAuthStateChanged(auth, (user) => {
        if (user) {
          unsub();
          done('onAuthStateChanged');
        }
      });

      setTimeout(() => { unsub(); done('timeout'); }, 10_000);
    });
  }

  return _waitPromise;
}
