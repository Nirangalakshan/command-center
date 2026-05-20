/**
 * Command Centre auth API (e.g. http://127.0.0.1:5000/api/auth/login).
 * Persists tokens + Firebase identity metadata for later use (chat, BMS, etc.).
 */

import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

const AUTH_STORAGE_KEY = 'command_center_auth_session';

export interface FirebaseIdentityToolkitInfo {
  ok: boolean;
  stored: boolean;
  localId: string;
  email: string;
  displayName: string;
  registered: boolean;
}

export interface AuthLoginUser {
  id: string;
  email: string;
  user_metadata: {
    agent_type?: string;
    display_name?: string;
    email_verified?: boolean;
    [key: string]: unknown;
  };
}

export interface AuthLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: AuthLoginUser;
  roles: string[];
  agentType: string;
  expires_at: number;
  firebaseBlackIdentityToolkit: FirebaseIdentityToolkitInfo;
  firebasePinkIdentityToolkit: FirebaseIdentityToolkitInfo;
}

/** API origin without trailing slash (default http://127.0.0.1:5000). */
export function getAuthApiOrigin(): string {
  const fromEnv = (import.meta.env.VITE_AUTH_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'http://127.0.0.1:5000';
}

function authUrl(path: string): string {
  const origin = getAuthApiOrigin();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}/api/auth${suffix}` : `/api/auth${suffix}`;
}

export async function loginWithAuthApi(
  email: string,
  password: string,
): Promise<AuthLoginResponse> {
  const res = await fetch(authUrl('/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  let body: AuthLoginResponse & { error?: string; message?: string };
  try {
    body = await res.json();
  } catch {
    throw new Error(res.ok ? 'Invalid response from auth server' : `Login failed (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(body.error || body.message || `Login failed (${res.status})`);
  }

  if (!body.access_token || !body.user?.id) {
    throw new Error('Auth server returned an incomplete login response');
  }

  return body as AuthLoginResponse;
}

export function saveAuthSession(data: AuthLoginResponse): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function getStoredAuthSession(): AuthLoginResponse | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthLoginResponse;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when `expires_at` (unix seconds) is in the past (30s skew). */
export function isAuthSessionExpired(session: AuthLoginResponse | null): boolean {
  if (!session?.expires_at) return true;
  return Date.now() / 1000 >= session.expires_at - 30;
}

export function getStoredAccessToken(): string | null {
  const s = getStoredAuthSession();
  if (!s || isAuthSessionExpired(s)) return null;
  return s.access_token;
}

/** Keep `command_center_auth_session` in sync when Supabase refreshes tokens. */
export function syncAuthSessionFromSupabase(session: Session): void {
  const stored = getStoredAuthSession();
  if (!stored) return;
  const expiresAt =
    session.expires_at ??
    Math.floor(Date.now() / 1000) + (session.expires_in ?? stored.expires_in ?? 3600);
  saveAuthSession({
    ...stored,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: expiresAt,
    expires_in: session.expires_in ?? stored.expires_in,
  });
}

function sessionNeedsRefresh(session: Session, skewSeconds = 60): boolean {
  const exp = session.expires_at;
  if (!exp) return false;
  return exp - Math.floor(Date.now() / 1000) <= skewSeconds;
}

/**
 * Supabase JWT for `/api/bms-black/*` (validated by attachSupabaseUser on the auth server).
 * Uses the live Supabase session + refresh — not a stale copy from localStorage alone.
 */
export async function getValidSupabaseAccessToken(): Promise<string> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const stored = getStoredAuthSession();
    if (stored?.access_token && stored.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });
      if (!error) {
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }
    }
  }

  if (!session?.access_token) {
    clearAuthSession();
    throw new Error('Your session expired. Please sign in again.');
  }

  if (sessionNeedsRefresh(session)) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      session = data.session;
    }
  }

  syncAuthSessionFromSupabase(session);
  return session.access_token;
}

export function getStoredFirebaseBlack(): FirebaseIdentityToolkitInfo | null {
  return getStoredAuthSession()?.firebaseBlackIdentityToolkit ?? null;
}

export function getStoredFirebasePink(): FirebaseIdentityToolkitInfo | null {
  return getStoredAuthSession()?.firebasePinkIdentityToolkit ?? null;
}
