import { useEffect, useState, type ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './config';
import { signalAuthReady } from '@/lib/firebase';
import { FirebaseAuthContext } from './FirebaseAuthContext';

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<{ uid: string; email: string | null } | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const token = await user.getIdToken();
        setFirebaseUser({ uid: user.uid, email: user.email });
        setIdToken(token);
        setLoading(false);
        signalAuthReady();
      } else {
        setFirebaseUser(null);
        setIdToken(null);
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
  };

  return (
    <FirebaseAuthContext.Provider value={{ firebaseUser, idToken, signIn, signOut, loading }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}
