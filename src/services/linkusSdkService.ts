/**
 * ═══════════════════════════════════════════════════════════
 * Linkus SDK Service — Yeastar ys-webrtc-sdk-core integration
 *
 * Sign generation runs entirely in the browser (requests come
 * from the agent's IP, not a Supabase server).
 *
 * The generated sign is cached in localStorage so that future
 * loads work from any IP without calling the Yeastar API again
 * (the sign has expire_time=0 — it never expires).
 *
 * If the Yeastar PBX returns 70087 IP FORBIDDEN, the agent must
 * connect once from a Yeastar-whitelisted IP to generate and
 * cache the sign.  After that, any IP works.
 *
 * LINKUS_PBX_URL → base PBX URL used to initialise the SDK.
 * ═══════════════════════════════════════════════════════════
 */

const PBX_BASE = (
  (import.meta.env.VITE_YEASTAR_PBX_URL as string) ?? ''
).replace(/\/$/, '');

const SDK_ACCESS_ID =
  (import.meta.env.VITE_YEASTAR_SDK_ACCESS_ID as string) ?? '';
const SDK_ACCESS_KEY =
  (import.meta.env.VITE_YEASTAR_SDK_ACCESS_KEY as string) ?? '';

export const LINKUS_PBX_URL = PBX_BASE;

// ─── localStorage key per agent email ─────────────────────

const signKey = (email: string) =>
  `__linkus_sdk_sign__${email.toLowerCase()}`;

export function getCachedSdkSign(email: string): string | null {
  try {
    return localStorage.getItem(signKey(email));
  } catch {
    return null;
  }
}

function cacheSdkSign(email: string, sign: string) {
  try {
    localStorage.setItem(signKey(email), sign);
  } catch { /* storage full — ignore */ }
}

/** Call this to force sign re-generation (e.g. after PBX credential reset). */
export function clearCachedSdkSign(email: string) {
  try {
    localStorage.removeItem(signKey(email));
  } catch { /* ignore */ }
}

// ─── PBX access-token cache (30-min TTL) ──────────────────

let _pbxToken: string | null = null;
let _pbxTokenExpiresAt = 0;

async function getPbxAccessToken(): Promise<string> {
  if (_pbxToken && Date.now() < _pbxTokenExpiresAt) return _pbxToken;

  const res = await fetch(`${PBX_BASE}/openapi/v1.0/get_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SDK_ACCESS_ID,
      password: SDK_ACCESS_KEY,
    }),
  });

  if (!res.ok) throw new Error(`PBX token endpoint HTTP ${res.status}`);

  const data: {
    errcode: number;
    errmsg: string;
    access_token?: string;
    access_token_expire_time?: number;
  } = await res.json();

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`PBX token error ${data.errcode}: ${data.errmsg}`);
  }

  _pbxToken = data.access_token;
  const ttlMs = ((data.access_token_expire_time ?? 1800) - 60) * 1000;
  _pbxTokenExpiresAt = Date.now() + ttlMs;

  return _pbxToken;
}

// ─── Public API ────────────────────────────────────────────

/**
 * Returns a Linkus SDK sign for the given agent email.
 *
 * Flow:
 *   1. Return cached sign from localStorage (survives any IP).
 *   2. Otherwise call Yeastar API to generate a new sign and cache it.
 *   3. On IP FORBIDDEN (error 70087): throw IP_FORBIDDEN error with
 *      clear instructions so the UI can display actionable guidance.
 */
export async function fetchSdkSign(email: string): Promise<string> {
  // 1 — localStorage hit (works from any IP)
  const cached = getCachedSdkSign(email);
  if (cached) return cached;

  // 2 — Generate fresh from Yeastar (needs whitelisted IP)
  if (!PBX_BASE || !SDK_ACCESS_ID || !SDK_ACCESS_KEY) {
    throw new Error(
      'Linkus SDK env vars missing. Check VITE_YEASTAR_PBX_URL, ' +
        'VITE_YEASTAR_SDK_ACCESS_ID and VITE_YEASTAR_SDK_ACCESS_KEY in .env'
    );
  }

  let accessToken: string;
  try {
    accessToken = await getPbxAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isIpForbidden(msg)) throw new IpForbiddenError();
    throw err;
  }

  const res = await fetch(
    `${PBX_BASE}/openapi/v1.0/sign/create?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, sign_type: 'sdk', expire_time: 0 }),
    }
  );

  if (!res.ok) throw new Error(`PBX sign endpoint HTTP ${res.status}`);

  const data: {
    errcode: number;
    errmsg: string;
    data?: { sign?: string };
  } = await res.json();

  if (data.errcode !== 0 || !data.data?.sign) {
    const msg = `PBX sign error ${data.errcode}: ${data.errmsg}`;
    if (isIpForbidden(msg)) throw new IpForbiddenError();
    throw new Error(msg);
  }

  const sign = data.data.sign;

  // Cache so future loads work from any IP
  cacheSdkSign(email, sign);

  return sign;
}

// ─── IP FORBIDDEN sentinel ─────────────────────────────────

function isIpForbidden(msg: string): boolean {
  return msg.includes('70087') || msg.toLowerCase().includes('ip forbidden');
}

export class IpForbiddenError extends Error {
  readonly isIpForbidden = true;
  constructor() {
    super('IP_FORBIDDEN');
    this.name = 'IpForbiddenError';
  }
}
