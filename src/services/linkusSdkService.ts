/**
 * ═══════════════════════════════════════════════════════════
 * Linkus SDK Service — Yeastar ys-webrtc-sdk-core integration
 *
 * Sign generation and extension list queries are proxied via
 * the 'yeastar-api' Supabase Edge Function to resolve CORS
 * issues and improve security.
 * ═══════════════════════════════════════════════════════════
 */

import { supabase } from "@/integrations/supabase/client";

const PBX_BASE = (
  (import.meta.env.VITE_YEASTAR_PBX_URL as string) ?? ''
).replace(/\/$/, '');

const SDK_ACCESS_ID =
  (import.meta.env.VITE_YEASTAR_SDK_ACCESS_ID as string) ?? '';
const SDK_ACCESS_KEY =
  (import.meta.env.VITE_YEASTAR_SDK_ACCESS_KEY as string) ?? '';
const CLIENT_ACCESS_ID =
  (import.meta.env.VITE_YEASTAR_CLIENT_ID as string) ?? '';
const CLIENT_ACCESS_KEY =
  (import.meta.env.VITE_YEASTAR_CLIENT_SECRET as string) ?? '';

/** If set, `extension/list` uses this Open API app (for Extension scope) instead of the SDK app. */
const OPENAPI_EXT_LIST_ID = (
  (import.meta.env.VITE_YEASTAR_OPENAPI_ACCESS_ID as string) ?? ''
).trim();
const OPENAPI_EXT_LIST_KEY = (
  (import.meta.env.VITE_YEASTAR_OPENAPI_ACCESS_KEY as string) ?? ''
).trim();

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

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: '/openapi/v1.0/get_token',
      method: 'POST',
      body: {
        username: SDK_ACCESS_ID,
        password: SDK_ACCESS_KEY,
      }
    }
  });

  if (error) throw new Error(`PBX token proxy error: ${error.message}`);
  
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`PBX token error ${data.errcode}: ${data.errmsg}`);
  }

  _pbxToken = data.access_token;
  const ttlMs = ((data.access_token_expire_time ?? 1800) - 60) * 1000;
  _pbxTokenExpiresAt = Date.now() + ttlMs;

  return _pbxToken;
}

type ExtListCredential = { label: string; id: string; key: string };
const _extListTokenCache = new Map<string, { token: string; expiresAt: number }>();

function getExtListCredentialCandidates(): ExtListCredential[] {
  const raw: ExtListCredential[] = [];
  if (OPENAPI_EXT_LIST_ID && OPENAPI_EXT_LIST_KEY) {
    raw.push({
      label: 'VITE_YEASTAR_OPENAPI_ACCESS_*',
      id: OPENAPI_EXT_LIST_ID,
      key: OPENAPI_EXT_LIST_KEY,
    });
  }
  if (SDK_ACCESS_ID && SDK_ACCESS_KEY) {
    raw.push({
      label: 'VITE_YEASTAR_SDK_ACCESS_*',
      id: SDK_ACCESS_ID,
      key: SDK_ACCESS_KEY,
    });
  }
  if (CLIENT_ACCESS_ID && CLIENT_ACCESS_KEY) {
    raw.push({
      label: 'VITE_YEASTAR_CLIENT_ID/SECRET',
      id: CLIENT_ACCESS_ID,
      key: CLIENT_ACCESS_KEY,
    });
  }

  const seen = new Set<string>();
  return raw.filter((c) => {
    const k = `${c.id}::${c.key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function getPbxAccessTokenWithCreds(c: ExtListCredential): Promise<string> {
  const cacheKey = `${c.id}::${c.key}`;
  const hit = _extListTokenCache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit.token;

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: '/openapi/v1.0/get_token',
      method: 'POST',
      body: { username: c.id, password: c.key }
    }
  });

  if (error) throw new Error(`PBX token (${c.label}) proxy error: ${error.message}`);

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`PBX token (${c.label}) error ${data.errcode}: ${data.errmsg}`);
  }

  const ttlMs = ((data.access_token_expire_time ?? 1800) - 60) * 1000;
  _extListTokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
  });
  return data.access_token;
}

// ─── Public API ────────────────────────────────────────────

export async function fetchSdkSign(email: string): Promise<string> {
  const cached = getCachedSdkSign(email);
  if (cached) return cached;

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

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: '/openapi/v1.0/sign/create',
      method: 'POST',
      params: { access_token: accessToken },
      body: { username: email, sign_type: 'sdk', expire_time: 0 },
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  });

  if (error) throw new Error(`PBX sign proxy error: ${error.message}`);

  if (data.errcode !== 0 || !data.data?.sign) {
    const msg = `PBX sign error ${data.errcode}: ${data.errmsg}`;
    if (isIpForbidden(msg)) throw new IpForbiddenError();
    throw new Error(msg);
  }

  const sign = data.data.sign;
  cacheSdkSign(email, sign);
  return sign;
}

// ─── IP FORBIDDEN sentinel ─────────────────────────────────

function isIpForbidden(msg: string): boolean {
  return msg.includes('70087') || msg.toLowerCase().includes('ip forbidden');
}

export class IpForbiddenError extends Error {
  readonly isIpForbidden = true;

  constructor(
    /** Longer UX copy (e.g. server-side Open API vs browser). Omit to keep sentinel `IP_FORBIDDEN`. */
    message?: string
  ) {
    super(message ?? 'IP_FORBIDDEN');
    this.name = 'IpForbiddenError';
  }
}

export class ApiAccessDeniedError extends Error {
  readonly isApiAccessDenied = true;
  constructor(public resource: string) {
    super(
      `Yeastar API access denied for ${resource}. Grant this scope to the ` +
        `API app on the PBX (Integrations → API → Permissions).`
    );
    this.name = 'ApiAccessDeniedError';
  }
}

// ─── Extension directory ───────────────────────────────────

export type PbxPresence =
  | 'available'
  | 'away'
  | 'business_trip'
  | 'do_not_disturb'
  | 'lunch'
  | 'off_work';

export interface PbxExtension {
  id: number;
  number: string;
  name: string;
  email?: string;
  mobileNumber?: string;
  roleName?: string;
  presence?: PbxPresence | string;
  customPresence?: string;
  online: boolean;
}

type RawEndpoint = { status?: number } | undefined;

interface RawOnlineStatus {
  sip_phone?: RawEndpoint;
  linkus_desktop?: RawEndpoint;
  linkus_mobile?: RawEndpoint;
  linkus_web?: RawEndpoint;
  [key: string]: RawEndpoint;
}

interface RawExtension {
  id: number;
  number?: string;
  caller_id_name?: string;
  email_addr?: string;
  mobile_number?: string;
  role_name?: string;
  presence_status?: string;
  custom_presence_status?: string;
  online_status?: RawOnlineStatus;
}

function isOnline(status?: RawOnlineStatus): boolean {
  if (!status) return false;
  return Object.values(status).some((ep) => ep?.status === 1);
}

function normaliseExtension(e: RawExtension): PbxExtension {
  const number = e.number ?? '';
  const name = (e.caller_id_name ?? '').trim() || number;

  return {
    id: e.id,
    number,
    name,
    email: e.email_addr,
    mobileNumber: e.mobile_number,
    roleName: e.role_name,
    presence: e.presence_status,
    customPresence: e.custom_presence_status,
    online: isOnline(e.online_status),
  };
}

let _extCache: { at: number; data: PbxExtension[] } | null = null;
const EXT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchExtensions(
  opts: { force?: boolean } = {}
): Promise<PbxExtension[]> {
  if (!opts.force && _extCache && Date.now() - _extCache.at < EXT_CACHE_TTL_MS) {
    return _extCache.data;
  }

  const candidates = getExtListCredentialCandidates();
  if (!PBX_BASE || candidates.length === 0) {
    throw new Error(
      'Yeastar env vars missing. Check VITE_YEASTAR_PBX_URL plus one credential pair: ' +
        'VITE_YEASTAR_OPENAPI_ACCESS_*, VITE_YEASTAR_SDK_ACCESS_*, or VITE_YEASTAR_CLIENT_ID/SECRET.'
    );
  }

  let sawAccessDenied = false;
  let lastErr: Error | null = null;

  for (const cred of candidates) {
    try {
      const accessToken = await getPbxAccessTokenWithCreds(cred);

      const { data, error } = await supabase.functions.invoke('yeastar-api', {
        body: {
          endpoint: '/openapi/v1.0/extension/list',
          method: 'GET',
          params: {
            access_token: accessToken,
            page: '1',
            page_size: '500',
            sort_by: 'number',
            order_by: 'asc',
          },
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      });

      if (error) throw new Error(`PBX extension/list proxy error: ${error.message}`);

      if (data.errcode !== 0) {
        const msg = `PBX extension/list (${cred.label}) error ${data.errcode}: ${data.errmsg}`;
        if (isIpForbidden(msg)) throw new IpForbiddenError();
        if (data.errcode === 10005) {
          sawAccessDenied = true;
          lastErr = new Error(msg);
          continue;
        }
        throw new Error(msg);
      }

      const raw = Array.isArray(data.data) ? data.data : [];
      const extensions = raw
        .map(normaliseExtension)
        .filter((e) => e.number);

      _extCache = { at: Date.now(), data: extensions };
      return extensions;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isIpForbidden(msg)) throw new IpForbiddenError();
      if (msg.includes('10005') || msg.toLowerCase().includes('access denied')) {
        sawAccessDenied = true;
      }
      lastErr = err instanceof Error ? err : new Error(msg);
    }
  }

  if (sawAccessDenied) throw new ApiAccessDeniedError('Extension List');
  throw lastErr ?? new Error('Failed to query extension list');
}

export function clearExtensionCache() {
  _extCache = null;
  _extListTokenCache.clear();
}
