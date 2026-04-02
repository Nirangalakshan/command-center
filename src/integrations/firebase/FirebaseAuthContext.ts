import { createContext } from 'react';

/* ─── Types ─── */

export interface FirebaseAuthContextValue {
  /** The raw Firebase user (null = not signed in) */
  firebaseUser: { uid: string; email: string | null } | null;
  /** Firebase ID token — attach this as Bearer on BMS API calls */
  idToken: string | null;
  /** Sign in with email + password (Firebase) */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Sign out of Firebase */
  signOut: () => Promise<void>;
  /** True while the initial auth state is resolving */
  loading: boolean;
}

/* ─── Context ─── */

export const FirebaseAuthContext = createContext<FirebaseAuthContextValue>({
  firebaseUser: null,
  idToken: null,
  signIn: async () => ({ error: 'Not initialised' }),
  signOut: async () => {},
  loading: true,
});
