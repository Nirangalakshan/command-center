/**
 * When true, `FirebaseAuthProvider` may sign in `VITE_FIREBASE_AGENT_*` on an empty
 * Firebase session (shared BMS service account). Set to false for Supabase-backed
 * agents so they can use their own Firebase session (dual sign-in) for BMS/chat.
 */
let allowEnvFirebaseAutoLogin = true;

export function setAllowFirebaseEnvAutoLogin(allow: boolean): void {
  allowEnvFirebaseAutoLogin = allow;
}

export function getAllowFirebaseEnvAutoLogin(): boolean {
  return allowEnvFirebaseAutoLogin;
}
