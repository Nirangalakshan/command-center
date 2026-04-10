import { useContext } from 'react';
import { FirebaseAuthContext } from './FirebaseAuthContext';

/**
 * Access Firebase auth state + BMS token anywhere in the component tree.
 *
 * @example
 *   const { idToken, signIn, signOut, firebaseUser, loading } = useFirebaseAuth();
 */
export function useFirebaseAuth() {
  return useContext(FirebaseAuthContext);
}
