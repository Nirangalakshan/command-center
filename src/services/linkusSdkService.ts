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

/**
 * Workaround for the super-admin "no cached sign + PBX blocking new auth" deadlock:
 * an admin can copy a freshly-generated sign from a working machine (or from the
 * Yeastar admin portal) and paste it here. We just store it like any normal sign.
 *
 * Returns `true` if the input looked plausible and was stored; otherwise `false`.
 */
export function seedSdkSign(email: string, rawSign: string): boolean {
  const sign = rawSign.trim();
  if (!email.trim() || !sign) return false;
  /** Yeastar SDK signs are long opaque tokens — guard against accidental short strings. */
  if (sign.length < 24) return false;
  try {
    localStorage.setItem(signKey(email), sign);
    return true;
  } catch {
    return false;
  }
}

// ─── Shared "Edge IP-forbidden" memoisation ────────────────
//
// Yeastar IP allowlists are configured *per Open API app*. Every time we hit
// 70087 from a Supabase Edge call we waste a request *and* push the PBX closer
// to its rate-limit / auto-ban threshold (which then breaks unrelated calls
// like extension/list). Once we know an app's Edge route is blocked, skip
// Edge for that credential for a few minutes and use the browser transport.
const _edgeIpBlockedUntil = new Map<string, number>();
const EDGE_IP_BLOCK_MEMO_MS = 5 * 60 * 1000;

export function markYeastarEdgeIpBlocked(credId: string): void {
  if (!credId) return;
  _edgeIpBlockedUntil.set(credId, Date.now() + EDGE_IP_BLOCK_MEMO_MS);
}

export function isYeastarEdgeIpBlocked(credId: string): boolean {
  if (!credId) return false;
  const until = _edgeIpBlockedUntil.get(credId);
  if (until == null) return false;
  if (Date.now() >= until) {
    _edgeIpBlockedUntil.delete(credId);
    return false;
  }
  return true;
}

export function clearYeastarEdgeIpBlocks(): void {
  _edgeIpBlockedUntil.clear();
}

// ─── PBX access-token cache (30-min TTL) ──────────────────

interface SdkPbxToken {
  token: string;
  /** `true` when the token was obtained from the dashboard's browser (IP-whitelisted). */
  browserTransport: boolean;
}

let _pbxToken: string | null = null;
let _pbxTokenExpiresAt = 0;
/** Tracks which transport issued `_pbxToken` so `sign/create` can use the same path. */
let _pbxTokenBrowserTransport = false;

/**
 * Acquires an SDK PBX access-token. Prefers the Edge proxy (server-to-server),
 * but transparently falls back to a direct browser fetch if the PBX denies the
 * Edge IP with 70087. Required for super-admin / first-time agents whose sign
 * has never been generated and cached locally.
 */
async function getPbxAccessToken(): Promise<SdkPbxToken> {
  if (_pbxToken && Date.now() < _pbxTokenExpiresAt) {
    return { token: _pbxToken, browserTransport: _pbxTokenBrowserTransport };
  }

  if (!SDK_ACCESS_ID || !SDK_ACCESS_KEY) {
    throw new Error('Linkus SDK credentials missing (VITE_YEASTAR_SDK_ACCESS_*).');
  }

  const cred: ExtListCredential = {
    label: 'VITE_YEASTAR_SDK_ACCESS_*',
    id: SDK_ACCESS_ID,
    key: SDK_ACCESS_KEY,
  };

  const failures: string[] = [];
  let edgeIpForbidden = false;
  let browserIpForbidden = false;
  let browserNetworkBlocked = false;

  if (!isYeastarEdgeIpBlocked(cred.id)) {
    const edge = await tryGetPbxTokenViaEdge(cred);
    if ('token' in edge) {
      _pbxToken = edge.token;
      _pbxTokenBrowserTransport = false;
      _pbxTokenExpiresAt = Date.now() + Math.max(60_000, (edge.ttlSec - 60) * 1000);
      return { token: edge.token, browserTransport: false };
    }
    if ('ipForbidden' in edge) {
      markYeastarEdgeIpBlocked(cred.id);
      edgeIpForbidden = true;
      failures.push('Edge get_token: 70087 (Supabase egress IP not whitelisted)');
    } else {
      failures.push(`Edge get_token: ${edge.error}`);
    }
  } else {
    edgeIpForbidden = true;
    failures.push('Edge get_token: skipped (recently 70087)');
  }

  const browser = await tryGetPbxTokenViaBrowser(cred);
  if ('token' in browser) {
    _pbxToken = browser.token;
    _pbxTokenBrowserTransport = true;
    _pbxTokenExpiresAt = Date.now() + Math.max(60_000, (browser.ttlSec - 60) * 1000);
    return { token: browser.token, browserTransport: true };
  }
  if ('ipForbidden' in browser) {
    browserIpForbidden = true;
    failures.push('Browser get_token: 70087 (your network IP not whitelisted on the SDK app)');
  } else {
    /** Most often `TypeError: Failed to fetch` — Yeastar RAS does not expose CORS for this dashboard origin. */
    browserNetworkBlocked = true;
    failures.push(`Browser get_token: ${browser.error}`);
  }

  let summary: string;
  if (edgeIpForbidden && browserIpForbidden) {
    summary =
      'Yeastar rejected both the server-side and browser-direct sign requests with error 70087. ' +
      'Neither Supabase egress nor your current network IP is whitelisted on the Linkus SDK Open API app.';
  } else if (edgeIpForbidden && browserNetworkBlocked) {
    summary =
      'Yeastar rejected the server-side sign request (70087) and the browser-direct fallback was blocked by the browser ' +
      '(usually CORS — Yeastar RAS does not expose its REST API to this dashboard origin from a browser).';
  } else if (edgeIpForbidden) {
    summary = 'Yeastar rejected the server-side sign request with 70087 and the browser-direct fallback also failed.';
  } else {
    summary = 'Linkus SDK token request failed.';
  }

  console.warn('[Linkus SDK get_token]', { summary, failures });

  if (edgeIpForbidden || browserIpForbidden) {
    throw new IpForbiddenError(`${summary} Details: ${failures.join(' | ')}`);
  }
  throw new Error(`PBX SDK token failed — ${failures.join(' | ')}`);
}

type ExtListCredential = { label: string; id: string; key: string };
const _extListTokenCache = new Map<
  string,
  { token: string; expiresAt: number; browserTransport: boolean }
>();

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

type ExtListAuthResult =
  | { token: string; ttlSec: number }
  | { ipForbidden: true }
  | { error: string };

async function tryGetPbxTokenViaEdge(c: ExtListCredential): Promise<ExtListAuthResult> {
  try {
    const { data, error } = await supabase.functions.invoke('yeastar-api', {
      body: {
        endpoint: '/openapi/v1.0/get_token',
        method: 'POST',
        body: { username: c.id, password: c.key },
      },
    });
    if (error) return { error: `proxy: ${error.message}` };
    if (!data) return { error: 'empty response' };
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
        return { ipForbidden: true };
      }
      return { error: `errcode ${data.errcode}: ${msg}` };
    }
    if (!data.access_token) return { error: 'no access_token in response' };
    return {
      token: data.access_token as string,
      ttlSec: Number(data.access_token_expire_time ?? 1800),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function tryGetPbxTokenViaBrowser(c: ExtListCredential): Promise<ExtListAuthResult> {
  if (!PBX_BASE) return { error: 'no PBX base URL' };
  try {
    const res = await fetch(`${PBX_BASE}/openapi/v1.0/get_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: c.id, password: c.key }),
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return { error: `bad response (HTTP ${res.status})` };
    const errcode = (data as { errcode?: unknown }).errcode;
    const errmsg = String((data as { errmsg?: unknown }).errmsg ?? '');
    if (typeof errcode === 'number' && errcode !== 0) {
      if (errcode === 70087 || /ip forbidden/i.test(errmsg)) {
        return { ipForbidden: true };
      }
      return { error: `errcode ${errcode}: ${errmsg}` };
    }
    const accessToken = (data as { access_token?: unknown }).access_token;
    if (typeof accessToken !== 'string') return { error: 'no access_token in response' };
    return {
      token: accessToken,
      ttlSec: Number((data as { access_token_expire_time?: unknown }).access_token_expire_time ?? 1800),
    };
  } catch (e) {
    /** Most often `TypeError: Failed to fetch` — RAS missing CORS for the dashboard origin. */
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface CachedExtToken {
  token: string;
  expiresAt: number;
  /** `true` when the token was obtained directly from the browser (PBX whitelists user IP). */
  browserTransport: boolean;
}

async function getPbxAccessTokenWithCreds(c: ExtListCredential): Promise<CachedExtToken> {
  const cacheKey = `${c.id}::${c.key}`;
  const hit = _extListTokenCache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit;

  const failures: string[] = [];

  if (!isYeastarEdgeIpBlocked(c.id)) {
    const edge = await tryGetPbxTokenViaEdge(c);
    if ('token' in edge) {
      const ttlMs = Math.max(60_000, (edge.ttlSec - 60) * 1000);
      const cached: CachedExtToken = {
        token: edge.token,
        expiresAt: Date.now() + ttlMs,
        browserTransport: false,
      };
      _extListTokenCache.set(cacheKey, cached);
      return cached;
    }
    if ('ipForbidden' in edge) {
      markYeastarEdgeIpBlocked(c.id);
      failures.push(`${c.label} via Edge: 70087 (IP forbidden)`);
    } else {
      failures.push(`${c.label} via Edge: ${edge.error}`);
    }
  } else {
    failures.push(`${c.label} via Edge: skipped (recently 70087)`);
  }

  const browser = await tryGetPbxTokenViaBrowser(c);
  if ('token' in browser) {
    const ttlMs = Math.max(60_000, (browser.ttlSec - 60) * 1000);
    const cached: CachedExtToken = {
      token: browser.token,
      expiresAt: Date.now() + ttlMs,
      browserTransport: true,
    };
    _extListTokenCache.set(cacheKey, cached);
    return cached;
  }
  if ('ipForbidden' in browser) {
    failures.push(`${c.label} via Browser: 70087 (IP forbidden)`);
  } else {
    failures.push(`${c.label} via Browser: ${browser.error}`);
  }

  const allIpForbidden = failures.every((f) => /70087|ip forbidden/i.test(f));
  if (allIpForbidden) throw new IpForbiddenError();
  throw new Error(`PBX token (${c.label}) failed — ${failures.join(' | ')}`);
}

// ─── Public API ────────────────────────────────────────────

type SignCreateResult =
  | { sign: string }
  | { ipForbidden: true }
  | { error: string };

async function trySignCreateViaEdge(
  email: string,
  accessToken: string,
): Promise<SignCreateResult> {
  try {
    const { data, error } = await supabase.functions.invoke('yeastar-api', {
      body: {
        endpoint: '/openapi/v1.0/sign/create',
        method: 'POST',
        params: { access_token: accessToken },
        body: { username: email, sign_type: 'sdk', expire_time: 0 },
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });
    if (error) return { error: `proxy: ${error.message}` };
    if (!data) return { error: 'empty response' };
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
        return { ipForbidden: true };
      }
      return { error: `errcode ${data.errcode}: ${msg}` };
    }
    const sign = data?.data?.sign as string | undefined;
    if (!sign) return { error: 'no sign in response' };
    return { sign };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function trySignCreateViaBrowser(
  email: string,
  accessToken: string,
): Promise<SignCreateResult> {
  if (!PBX_BASE) return { error: 'no PBX base URL' };
  try {
    const url = `${PBX_BASE}/openapi/v1.0/sign/create?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ username: email, sign_type: 'sdk', expire_time: 0 }),
    });
    const data = await res.json().catch(() => null) as
      | { errcode?: number; errmsg?: string; data?: { sign?: string } }
      | null;
    if (!data || typeof data !== 'object') {
      return { error: `bad JSON (HTTP ${res.status})` };
    }
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
        return { ipForbidden: true };
      }
      return { error: `errcode ${data.errcode}: ${msg}` };
    }
    const sign = data.data?.sign;
    if (!sign) return { error: 'no sign in response' };
    return { sign };
  } catch (e) {
    /** Most often `TypeError: Failed to fetch` — RAS missing CORS for the dashboard origin. */
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchSdkSign(email: string): Promise<string> {
  const cached = getCachedSdkSign(email);
  if (cached) return cached;

  if (!PBX_BASE || !SDK_ACCESS_ID || !SDK_ACCESS_KEY) {
    throw new Error(
      'Linkus SDK env vars missing. Check VITE_YEASTAR_PBX_URL, ' +
        'VITE_YEASTAR_SDK_ACCESS_ID and VITE_YEASTAR_SDK_ACCESS_KEY in .env'
    );
  }

  let tokenInfo: SdkPbxToken;
  try {
    tokenInfo = await getPbxAccessToken();
  } catch (err) {
    /** Preserve the rich diagnostic from getPbxAccessToken. */
    if (err instanceof IpForbiddenError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (isIpForbidden(msg)) throw new IpForbiddenError(msg);
    throw err;
  }

  const failures: string[] = [];
  let edgeIpForbidden = false;
  let browserIpForbidden = false;
  let browserNetworkBlocked = false;

  /** Call `sign/create` via the same transport that issued the token so we
   *  don't waste another 70087 hit on the PBX. */
  if (!tokenInfo.browserTransport) {
    const edge = await trySignCreateViaEdge(email, tokenInfo.token);
    if ('sign' in edge) {
      cacheSdkSign(email, edge.sign);
      return edge.sign;
    }
    if ('ipForbidden' in edge) {
      markYeastarEdgeIpBlocked(SDK_ACCESS_ID);
      edgeIpForbidden = true;
      failures.push('Edge sign/create: 70087 (Supabase egress IP not whitelisted)');
    } else {
      failures.push(`Edge sign/create: ${edge.error}`);
    }
  }

  /** Browser fallback — also runs when Edge sign/create just 70087'd, since
   *  the token itself is valid from any IP. */
  const browser = await trySignCreateViaBrowser(email, tokenInfo.token);
  if ('sign' in browser) {
    cacheSdkSign(email, browser.sign);
    return browser.sign;
  }
  if ('ipForbidden' in browser) {
    browserIpForbidden = true;
    failures.push('Browser sign/create: 70087 (your network IP not whitelisted on the SDK app)');
  } else {
    browserNetworkBlocked = true;
    failures.push(`Browser sign/create: ${browser.error}`);
  }

  let summary: string;
  if (edgeIpForbidden && browserIpForbidden) {
    summary =
      'Yeastar rejected the sign/create call from both Supabase egress and your network with 70087. ' +
      'Whitelist both on the Linkus SDK Open API app, or grant the SDK Sign permission.';
  } else if (edgeIpForbidden && browserNetworkBlocked) {
    summary =
      'Yeastar rejected the server-side sign/create call (70087). The browser-direct fallback was blocked by the browser ' +
      '(usually CORS — Yeastar RAS does not expose its REST API to this dashboard origin from a browser).';
  } else {
    summary = 'Linkus SDK sign/create failed.';
  }

  console.warn('[Linkus SDK sign/create]', { summary, failures });

  if (edgeIpForbidden || browserIpForbidden) {
    throw new IpForbiddenError(`${summary} Details: ${failures.join(' | ')}`);
  }
  throw new Error(`PBX sign failed — ${failures.join(' | ')}`);
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
  let sawIpForbidden = false;
  let lastErr: Error | null = null;

  for (const cred of candidates) {
    let cached: CachedExtToken;
    try {
      cached = await getPbxAccessTokenWithCreds(cred);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof IpForbiddenError || isIpForbidden(msg)) {
        sawIpForbidden = true;
        lastErr = err instanceof Error ? err : new Error(msg);
        continue;
      }
      lastErr = err instanceof Error ? err : new Error(msg);
      continue;
    }

    const result = await queryExtensionList(cred, cached);
    if ('extensions' in result) {
      _extCache = { at: Date.now(), data: result.extensions };
      return result.extensions;
    }
    if (result.kind === 'ipForbidden') {
      sawIpForbidden = true;
      lastErr = new Error(`PBX extension/list (${cred.label}) error 70087: IP forbidden`);
      continue;
    }
    if (result.kind === 'accessDenied') {
      sawAccessDenied = true;
      lastErr = new Error(result.message);
      continue;
    }
    lastErr = new Error(result.message);
  }

  if (sawIpForbidden && !sawAccessDenied) throw new IpForbiddenError();
  if (sawAccessDenied) throw new ApiAccessDeniedError('Extension List');
  throw lastErr ?? new Error('Failed to query extension list');
}

type ExtListQueryResult =
  | { extensions: PbxExtension[] }
  | { kind: 'ipForbidden' }
  | { kind: 'accessDenied'; message: string }
  | { kind: 'other'; message: string };

async function queryExtensionList(
  cred: ExtListCredential,
  cached: CachedExtToken,
): Promise<ExtListQueryResult> {
  const params: Record<string, string> = {
    access_token: cached.token,
    page: '1',
    page_size: '500',
    sort_by: 'number',
    order_by: 'asc',
  };

  /** Token was issued in the browser (whitelisted IP) — keep talking to PBX from the browser. */
  if (cached.browserTransport) {
    const browser = await fetchExtensionListFromBrowser(cached.token, params);
    if ('extensions' in browser) return browser;
    if (browser.kind === 'ipForbidden') return { kind: 'ipForbidden' };
    if (browser.kind === 'accessDenied') {
      return {
        kind: 'accessDenied',
        message: `PBX extension/list (${cred.label}) error 10005: access denied`,
      };
    }
    return {
      kind: 'other',
      message: `PBX extension/list (${cred.label}) browser error: ${browser.message}`,
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('yeastar-api', {
      body: {
        endpoint: '/openapi/v1.0/extension/list',
        method: 'GET',
        params,
        headers: { Authorization: `Bearer ${cached.token}` },
      },
    });

    if (error) {
      return {
        kind: 'other',
        message: `PBX extension/list (${cred.label}) proxy error: ${error.message}`,
      };
    }
    if (!data) {
      return {
        kind: 'other',
        message: `PBX extension/list (${cred.label}) returned no data`,
      };
    }
    if (data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
        markYeastarEdgeIpBlocked(cred.id);
        /** Token works (was issued via Edge) but extension/list call hit per-call IP rule:
         *  retry the data fetch directly from the browser before giving up. */
        const browser = await fetchExtensionListFromBrowser(cached.token, params);
        if ('extensions' in browser) return browser;
        if (browser.kind === 'ipForbidden') return { kind: 'ipForbidden' };
        if (browser.kind === 'accessDenied') {
          return {
            kind: 'accessDenied',
            message: `PBX extension/list (${cred.label}) error 10005: access denied`,
          };
        }
        return {
          kind: 'other',
          message: `PBX extension/list (${cred.label}) IP forbidden via Edge; browser fallback: ${browser.message}`,
        };
      }
      if (data.errcode === 10005) {
        return {
          kind: 'accessDenied',
          message: `PBX extension/list (${cred.label}) error 10005: ${msg}`,
        };
      }
      return {
        kind: 'other',
        message: `PBX extension/list (${cred.label}) error ${data.errcode}: ${msg}`,
      };
    }

    const raw = Array.isArray(data.data) ? data.data : [];
    const extensions = raw.map(normaliseExtension).filter((e) => e.number);
    return { extensions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isIpForbidden(msg)) return { kind: 'ipForbidden' };
    if (/10005|access denied/i.test(msg)) {
      return { kind: 'accessDenied', message: msg };
    }
    return { kind: 'other', message: msg };
  }
}

async function fetchExtensionListFromBrowser(
  token: string,
  params: Record<string, string>,
): Promise<ExtListQueryResult> {
  if (!PBX_BASE) {
    return { kind: 'other', message: 'no PBX base URL' };
  }
  try {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${PBX_BASE}/openapi/v1.0/extension/list?${qs}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null) as
      | { errcode?: number; errmsg?: string; data?: unknown }
      | null;
    if (!data || typeof data !== 'object') {
      return { kind: 'other', message: `bad JSON (HTTP ${res.status})` };
    }
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) return { kind: 'ipForbidden' };
      if (data.errcode === 10005) return { kind: 'accessDenied', message: msg };
      return { kind: 'other', message: `errcode ${data.errcode}: ${msg}` };
    }
    const raw = Array.isArray(data.data) ? (data.data as RawExtension[]) : [];
    const extensions = raw.map(normaliseExtension).filter((e) => e.number);
    return { extensions };
  } catch (e) {
    /** Most often `TypeError: Failed to fetch` — RAS missing CORS for the dashboard origin. */
    return { kind: 'other', message: e instanceof Error ? e.message : String(e) };
  }
}

export function clearExtensionCache() {
  _extCache = null;
  _extListTokenCache.clear();
}
