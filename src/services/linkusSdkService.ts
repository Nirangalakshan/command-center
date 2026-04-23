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

/**
 * Raised when the PBX returns 10005 ACCESS_DENIED. Means the API app's
 * permission list doesn't include the resource we're trying to query — the
 * fix is to edit the app on the PBX and grant the missing scope.
 */
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
//
// API reference:
//   https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/query-extension-list.html
//
// IMPORTANT:
//   * Method is GET (POST returns 10001 INTERFACE NOT EXISTED)
//   * Parameters are in the query string, not a JSON body
//   * `sort_by` must be one of: id | number | caller_id_name | email_addr |
//     mobile_number | presence_status
//
// Presence values (Yeastar lower_snake): available | away | business_trip |
// do_not_disturb | lunch | off_work
//
// online_status shape:
//   {
//     sip_phone:       { status: 0|1, ext_dev_type?: string, status_list?: [...] },
//     linkus_desktop:  { status: 0|1, ext_dev_type?: string },
//     linkus_mobile:   { status: 0|1, ext_dev_type?: string, status_list?: [...] },
//     linkus_web:      { status: 0|1, ext_dev_type?: string }
//   }

export type PbxPresence =
  | 'available'
  | 'away'
  | 'business_trip'
  | 'do_not_disturb'
  | 'lunch'
  | 'off_work';

export interface PbxExtension {
  id: number;
  /** Dialable extension number, e.g. "1000". */
  number: string;
  /** Display name (caller ID). Falls back to the number if empty. */
  name: string;
  email?: string;
  mobileNumber?: string;
  roleName?: string;
  /** Presence, lowercased per Yeastar spec. Unknown values pass through as-is. */
  presence?: PbxPresence | string;
  /** Free-text custom presence set by the user. */
  customPresence?: string;
  /** True if extension is online on ANY endpoint (SIP / Linkus desktop / web / mobile). */
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

// 5-minute in-memory cache so re-opens of the widget don't hammer the PBX.
let _extCache: { at: number; data: PbxExtension[] } | null = null;
const EXT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch the extension directory from Yeastar OpenAPI.
 *
 * Requires a PBX access token (we already cache it for the sign flow, so this
 * piggy-backs on `getPbxAccessToken()`). Results are cached for 5 minutes.
 *
 * Pass `{ force: true }` to bypass the cache (e.g. after a manual refresh).
 */
export async function fetchExtensions(
  opts: { force?: boolean } = {}
): Promise<PbxExtension[]> {
  if (!opts.force && _extCache && Date.now() - _extCache.at < EXT_CACHE_TTL_MS) {
    return _extCache.data;
  }

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

  // Yeastar P-Series paginates; 500 is well above most deployments. If the
  // tenant has more we'd iterate pages, but that's vanishingly rare.
  const params = new URLSearchParams({
    access_token: accessToken,
    page: '1',
    page_size: '500',
    sort_by: 'number',
    order_by: 'asc',
  });

  const res = await fetch(
    `${PBX_BASE}/openapi/v1.0/extension/list?${params.toString()}`,
    { method: 'GET' }
  );

  if (!res.ok) throw new Error(`PBX extension/list HTTP ${res.status}`);

  const json: {
    errcode: number;
    errmsg: string;
    total_number?: number;
    data?: RawExtension[];
  } = await res.json();

  if (json.errcode !== 0) {
    const msg = `PBX extension/list error ${json.errcode}: ${json.errmsg}`;
    if (isIpForbidden(msg)) throw new IpForbiddenError();
    if (json.errcode === 10005) throw new ApiAccessDeniedError('Extension List');
    throw new Error(msg);
  }

  const raw = Array.isArray(json.data) ? json.data : [];
  const extensions = raw
    .map(normaliseExtension)
    .filter((e) => e.number); // ignore any entries without a dialable number

  _extCache = { at: Date.now(), data: extensions };
  return extensions;
}

export function clearExtensionCache() {
  _extCache = null;
}
