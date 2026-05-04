import { useEffect, useState, type ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, signalAuthReady } from '@/lib/firebase';
import { getAllowFirebaseEnvAutoLogin } from '@/lib/firebaseEnvAutoLoginPolicy';
import { FirebaseAuthContext } from './FirebaseAuthContext';

function logIdTokenFromLogin(label: string, token: string | null | undefined) {
  if (!token) {
    // console.log(`[${label}] idToken: (empty / cleared)`);
    return;
  }
  // console.log(`[${label}] idToken (masked): ${token.slice(0, 16)}...${token.slice(-16)}`);
  // console.log(`[${label}] idToken length:`, token.length);
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<{ uid: string; email: string | null } | null>(
    null,
  );
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const agentEmail = import.meta.env.VITE_FIREBASE_AGENT_EMAIL as string | undefined;
      const agentPass = import.meta.env.VITE_FIREBASE_AGENT_PASSWORD as string | undefined;

      if (user) {
        const token = await user.getIdToken();
        logIdTokenFromLogin('onAuthStateChanged', token);
        setFirebaseUser({ uid: user.uid, email: user.email });
        setIdToken(token);
        setLoading(false);
        signalAuthReady();
      } else {
        setFirebaseUser(null);
        setIdToken(null);

        // Brief delay so Supabase session + `setAllowFirebaseEnvAutoLogin(false)` for agents can run first.
        if (getAllowFirebaseEnvAutoLogin() && agentEmail && agentPass) {
          await new Promise((r) => setTimeout(r, 280));
        }
        if (getAllowFirebaseEnvAutoLogin() && agentEmail && agentPass) {
          try {
            const res = await signInWithEmailAndPassword(auth, agentEmail, agentPass);
            const token = await res.user.getIdToken();
            logIdTokenFromLogin('auto-login (env agent)', token);
            setFirebaseUser({ uid: res.user.uid, email: res.user.email });
            setIdToken(token);
          } catch {
            // Auto-login failed; user may sign in manually.
          }
        }
        setLoading(false);
        signalAuthReady();
      }
    });

    return unsub;
  }, []);

  const signIn = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const token = await user.getIdToken();
      logIdTokenFromLogin('signIn(email/password)', token);
      setFirebaseUser({ uid: user.uid, email: user.email });
      setIdToken(token);
      return { error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Firebase sign-in failed';
      return { error: msg };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setFirebaseUser(null);
    setIdToken(null);
    logIdTokenFromLogin('FirebaseAuthProvider.signOut[Firebase idToken]', null);
  };

  return (
    <FirebaseAuthContext.Provider value={{ firebaseUser, idToken, signIn, signOut, loading }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}
