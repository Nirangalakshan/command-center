import { auth, waitForAuth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';
import { supabase } from '@/integrations/supabase/client';

const SIGN_IN_REQUIRED =
  'Sign in required to use the workshop API. Please sign in with your dashboard account.';

/**
 * Bearer token for BMS Pro `/api/call-center` requests.
 * Uses the signed-in Firebase user ID token, or the Supabase session JWT — never a static env secret.
 */
export async function getBmsBearerToken(options?: {
  /** Wait for Firebase auth to finish initializing (matches previous bookings/notifications behaviour). */
  waitForFirebaseInit?: boolean;
  /** Request a fresh Firebase ID token (notifications only). */
  forceRefreshFirebase?: boolean;
}): Promise<string> {
  if (options?.waitForFirebaseInit) {
    await waitForAuth();
  }

  const user = auth.currentUser;
  if (user) {
    return getIdToken(user, options?.forceRefreshFirebase ?? false);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }

  throw new Error(SIGN_IN_REQUIRED);
}
