/**
 * ═══════════════════════════════════════════════════════════
 * Yeastar PBX Service — Proxy-based API Client
 *
 * This service calls a Supabase Edge Function proxy ('yeastar-api')
 * instead of calling the PBX directly. This solves CORS errors
 * and keeps sensitive credentials on the server.
 * ═══════════════════════════════════════════════════════════
 */

import { supabase } from "@/integrations/supabase/client";
import { IpForbiddenError } from "@/services/linkusSdkService";

/** Yeastar REST surface (incl. cloud RAS) is `/openapi/v1.0/*`, not bare `/v1.0/*`. */
const OPENAPI = "/openapi/v1.0";

/** Same host the edge function (`YEASTAR_PBX_URL`) uses — RAS URL preferred (matches Linkus/OpenAPI). */
const PBX_PUBLIC_BASE_URL = (
  (import.meta.env.VITE_YEASTAR_PBX_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_YEASTAR_API_URL as string | undefined)?.trim() ||
  ''
).replace(/\/$/, '');

const CLIENT_ID = import.meta.env.VITE_YEASTAR_CLIENT_ID ?? '';
const CLIENT_SECRET = import.meta.env.VITE_YEASTAR_CLIENT_SECRET ?? '';

/** Linkus SDK app — Linkus succeeds today, so this Open API app is known to pass IP rules. */
const SDK_ACCESS_ID = (import.meta.env.VITE_YEASTAR_SDK_ACCESS_ID as string | undefined) ?? '';
const SDK_ACCESS_KEY = (import.meta.env.VITE_YEASTAR_SDK_ACCESS_KEY as string | undefined) ?? '';

/** Optional dedicated extension-list / OpenAPI app — re-use if present. */
const OPENAPI_ACCESS_ID = (import.meta.env.VITE_YEASTAR_OPENAPI_ACCESS_ID as string | undefined) ?? '';
const OPENAPI_ACCESS_KEY = (import.meta.env.VITE_YEASTAR_OPENAPI_ACCESS_KEY as string | undefined) ?? '';

const YEASTAR_API_IP_RESTRICTION_HINT =
  'Yeastar 70087 (IP forbidden): Supabase yeastar-api calls the PBX from Supabase egress IPs. ' +
    'Either disable IP restriction / whitelist those IPs on **every** Open API app you use ' +
    '(Integrations → API), **or** rely on browser-direct recording auth (dashboard tries this ' +
    'automatically after Edge fails — requires PBX/RAS to allow browser CORS).';

function throwIfYeastarIpForbidden(errcode: number, errmsgRaw: unknown): void {
  const errmsg = String(errmsgRaw ?? '');
  if (errcode === 70087 || /ip forbidden/i.test(errmsg)) {
    throw new IpForbiddenError(YEASTAR_API_IP_RESTRICTION_HINT);
  }
}

// Token cache (proxy — click-to-call, extension polling, etc.)
let _token: string | null = null;
let _tokenExpiry = 0;

/** Recording-only: may use browser→PBX when Edge egress is blocked (70087). */
let _recordingAuth: {
  token: string;
  expiresAt: number;
  browserTransport: boolean;
} | null = null;

export function isYeastarConfigured(): boolean {
  return Boolean(
    PBX_PUBLIC_BASE_URL &&
      ((CLIENT_ID.trim() && CLIENT_SECRET.trim()) ||
        (SDK_ACCESS_ID.trim() && SDK_ACCESS_KEY.trim()) ||
        (OPENAPI_ACCESS_ID.trim() && OPENAPI_ACCESS_KEY.trim()))
  );
}

// ─── Authentication ───────────────────────────────────────

type YeastarCredential = { label: string; id: string; key: string };

/**
 * Returns each unique credential pair the user provided, in fallback order.
 * Order: Integration → SDK → OpenAPI. The first pair the PBX accepts wins and is cached.
 */
function getYeastarCredentialCandidates(): YeastarCredential[] {
  const raw: YeastarCredential[] = [];
  if (CLIENT_ID.trim() && CLIENT_SECRET.trim()) {
    raw.push({ label: 'VITE_YEASTAR_CLIENT_ID/SECRET', id: CLIENT_ID.trim(), key: CLIENT_SECRET.trim() });
  }
  if (SDK_ACCESS_ID.trim() && SDK_ACCESS_KEY.trim()) {
    raw.push({ label: 'VITE_YEASTAR_SDK_ACCESS_*', id: SDK_ACCESS_ID.trim(), key: SDK_ACCESS_KEY.trim() });
  }
  if (OPENAPI_ACCESS_ID.trim() && OPENAPI_ACCESS_KEY.trim()) {
    raw.push({ label: 'VITE_YEASTAR_OPENAPI_ACCESS_*', id: OPENAPI_ACCESS_ID.trim(), key: OPENAPI_ACCESS_KEY.trim() });
  }
  const seen = new Set<string>();
  return raw.filter((c) => {
    const k = `${c.id}::${c.key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Recording flows prefer SDK/OpenAPI credentials first — integration CLIENT_* is often the one
 * with strict IP rules while Linkus SDK credentials match what agents already use.
 */
function getYeastarCredentialCandidatesForRecordings(): YeastarCredential[] {
  const raw: YeastarCredential[] = [];
  if (SDK_ACCESS_ID.trim() && SDK_ACCESS_KEY.trim()) {
    raw.push({ label: 'VITE_YEASTAR_SDK_ACCESS_*', id: SDK_ACCESS_ID.trim(), key: SDK_ACCESS_KEY.trim() });
  }
  if (OPENAPI_ACCESS_ID.trim() && OPENAPI_ACCESS_KEY.trim()) {
    raw.push({ label: 'VITE_YEASTAR_OPENAPI_ACCESS_*', id: OPENAPI_ACCESS_ID.trim(), key: OPENAPI_ACCESS_KEY.trim() });
  }
  if (CLIENT_ID.trim() && CLIENT_SECRET.trim()) {
    raw.push({ label: 'VITE_YEASTAR_CLIENT_ID/SECRET', id: CLIENT_ID.trim(), key: CLIENT_SECRET.trim() });
  }
  const seen = new Set<string>();
  return raw.filter((c) => {
    const k = `${c.id}::${c.key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function tryFetchAccessToken(
  c: YeastarCredential
): Promise<{ token: string; ttlSec: number } | { ipForbidden: true; label: string }> {
  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/get_token`,
      method: 'POST',
      body: { username: c.id, password: c.key },
    },
  });

  if (error) throw new Error(`Yeastar auth proxy error (${c.label}): ${error.message}`);

  if (typeof data?.errcode === 'number' && data.errcode !== 0) {
    const msg = String(data.errmsg ?? '');
    if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
      return { ipForbidden: true, label: c.label };
    }
    throw new Error(`Yeastar auth failed (${c.label}, ${data.errcode}): ${msg}`);
  }

  const accessToken = data?.access_token as string | undefined;
  if (!accessToken) throw new Error(`Yeastar auth failed (${c.label}): ${JSON.stringify(data)}`);

  return {
    token: accessToken,
    ttlSec: Number(data?.access_token_expire_time ?? 1800),
  };
}

async function tryFetchAccessTokenFromBrowser(
  c: YeastarCredential
): Promise<
  | { token: string; ttlSec: number }
  | { ipForbidden: true }
  | null
> {
  try {
    const url = `${PBX_PUBLIC_BASE_URL}${OPENAPI}/get_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ username: c.id, password: c.key }),
    });

    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!data || typeof data !== 'object') return null;

    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      const msg = String(data.errmsg ?? '');
      if (data.errcode === 70087 || /ip forbidden/i.test(msg)) {
        return { ipForbidden: true };
      }
      throw new Error(`Yeastar browser auth (${c.label}, ${data.errcode}): ${msg}`);
    }

    const accessToken = data.access_token as string | undefined;
    if (!accessToken) return null;

    return {
      token: accessToken,
      ttlSec: Number(data.access_token_expire_time ?? 1800),
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('Yeastar browser auth')) throw e;
    return null;
  }
}

/** Used only by recording helpers — tries Edge proxy first, then browser (your office IP). */
async function getYeastarTokenForRecordings(): Promise<string> {
  if (_recordingAuth && Date.now() < _recordingAuth.expiresAt) {
    return _recordingAuth.token;
  }

  const candidates = getYeastarCredentialCandidatesForRecordings();
  if (candidates.length === 0) {
    throw new Error('Yeastar not configured — no client id/secret in .env');
  }

  const edgeFailures: string[] = [];

  for (const c of candidates) {
    let result: Awaited<ReturnType<typeof tryFetchAccessToken>>;
    try {
      result = await tryFetchAccessToken(c);
    } catch (e) {
      edgeFailures.push(
        `${c.label}: ${e instanceof Error ? e.message : String(e)}`
      );
      continue;
    }
    if ('ipForbidden' in result) {
      edgeFailures.push(`${c.label}: IP forbidden (70087)`);
      continue;
    }
    _recordingAuth = {
      token: result.token,
      expiresAt: Date.now() + Math.max(60, result.ttlSec - 60) * 1000,
      browserTransport: false,
    };
    return result.token;
  }

  const browserFailures: string[] = [];
  for (const c of candidates) {
    let result: Awaited<ReturnType<typeof tryFetchAccessTokenFromBrowser>>;
    try {
      result = await tryFetchAccessTokenFromBrowser(c);
    } catch (e) {
      browserFailures.push(
        `${c.label}: ${e instanceof Error ? e.message : String(e)}`
      );
      continue;
    }
    if (result === null) {
      browserFailures.push(`${c.label}: blocked or no JSON (often CORS)`);
      continue;
    }
    if ('ipForbidden' in result) {
      browserFailures.push(`${c.label}: IP forbidden (70087)`);
      continue;
    }
    _recordingAuth = {
      token: result.token,
      expiresAt: Date.now() + Math.max(60, result.ttlSec - 60) * 1000,
      browserTransport: true,
    };
    return result.token;
  }

  throw new IpForbiddenError(
    `${YEASTAR_API_IP_RESTRICTION_HINT} Edge: ${edgeFailures.join('; ') || 'no attempts'}. ` +
      `Browser get_token: ${browserFailures.join('; ') || 'no attempts'}.`
  );
}

export async function getYeastarToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const candidates = getYeastarCredentialCandidates();
  if (candidates.length === 0) {
    throw new Error('Yeastar not configured — no client id/secret in .env');
  }

  const ipForbiddenLabels: string[] = [];
  for (const c of candidates) {
    const result = await tryFetchAccessToken(c);
    if ('ipForbidden' in result) {
      ipForbiddenLabels.push(result.label);
      continue;
    }
    _token = result.token;
    _tokenExpiry = Date.now() + Math.max(60, result.ttlSec - 60) * 1000;
    return _token;
  }

  throw new IpForbiddenError(
    `${YEASTAR_API_IP_RESTRICTION_HINT} (tried: ${ipForbiddenLabels.join(', ')})`
  );
}

// ─── Call Control ──────────────────────────────────────────

export async function clickToCall(agentExtension: string, callerNumber: string): Promise<void> {
  if (!isYeastarConfigured()) throw new Error('Yeastar not configured');
  const token = await getYeastarToken();

  const { error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/call/dial`,
      method: 'POST',
      body: { caller: agentExtension, callee: callerNumber },
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  if (error) {
    throw new Error(`Click-to-call failed: ${error.message}`);
  }
}

export async function hangupCall(extension: string): Promise<void> {
  if (!isYeastarConfigured()) return;
  const token = await getYeastarToken();

  await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/call/hangup`,
      method: 'POST',
      body: { extension },
      headers: { Authorization: `Bearer ${token}` }
    }
  });
}

// ─── Extension Queries (fallback polling) ─────────────────

export interface YeastarExtension {
  extension: string;
  name: string;
  status: 'Idle' | 'Busy' | 'Ringing' | 'Unregistered';
}

export async function fetchExtensionList(): Promise<YeastarExtension[]> {
  if (!isYeastarConfigured()) return [];
  const token = await getYeastarToken();

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/extensionlist/query`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  if (error || !data) return [];
  return (data.extlist ?? []) as YeastarExtension[];
}

export async function fetchExtensionStatus(extension: string): Promise<string> {
  if (!isYeastarConfigured()) return 'unknown';
  const token = await getYeastarToken();

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/extension/query`,
      method: 'GET',
      params: { extension },
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  if (error || !data) return 'unknown';
  return String(data.status ?? 'unknown');
}

// ─── CDR Queries ───────────────────────────────────────────

export interface YeastarCdr {
  cdrid: string;
  timestart: string;
  callfrom: string;
  callto: string;
  callduraction: number;
  talkduraction: number;
  status: string;
  type: string;
  did?: string;
  recording?: string;
}

export async function fetchCdrList(params?: {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<YeastarCdr[]> {
  if (!isYeastarConfigured()) return [];
  const token = await getYeastarToken();

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/cdr/query`,
      method: 'GET',
      params: {
        limit: String(params?.limit ?? 50),
        ...(params?.dateFrom ? { date_from: params.dateFrom } : {}),
        ...(params?.dateTo ? { date_to: params.dateTo } : {}),
      },
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  if (error || !data) return [];
  return (data.cdrlist ?? []) as YeastarCdr[];
}

// ─── PBX Info ──────────────────────────────────────────────

export async function fetchPbxInfo(): Promise<{ firmware?: string; model?: string } | null> {
  if (!isYeastarConfigured()) return null;
  try {
    const token = await getYeastarToken();
    const { data, error } = await supabase.functions.invoke('yeastar-api', {
      body: {
        endpoint: `${OPENAPI}/deviceinfo/query`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      }
    });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Recording Access ──────────────────────────────────────

/**
 * Resolve stored `recording_url` / webhook `recording` value into Open API `file` or numeric `id`.
 *
 * DB rows often store `{YEASTAR_RECORDING_BASE_URL}/{filename}`, e.g.
 * `https://host/cdr_recording/recording/foo.wav`.
 *
 * @see https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/download-a-recording-file.html
 */
function extractYeastarRecordingFileKey(recordingPath: string): string {
  const raw = recordingPath.trim();
  if (!raw) throw new Error('Empty recording path');

  try {
    const u = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : new URL(raw, 'http://recording.invalid/');

    const fromQuery =
      u.searchParams.get('recording') ?? u.searchParams.get('file');
    if (fromQuery?.trim()) return fromQuery.trim();

    let path = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    const prefix = 'cdr_recording/recording/';
    if (path.startsWith(prefix)) path = path.slice(prefix.length);
    if (path) return path;
  } catch {
    // Bare filename / relative path stored without scheme
  }
  return raw.replace(/^\/+/, '');
}

async function fetchRecordingDownloadJsonViaBrowser(
  params: Record<string, string>
): Promise<unknown | null> {
  try {
    const qs = new URLSearchParams(params);
    const url = `${PBX_PUBLIC_BASE_URL}${OPENAPI}/recording/download?${qs}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    return await res.json();
  } catch {
    return null;
  }
}

function parseRecordingDownloadResponse(
  data: unknown,
  token: string
): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (typeof d.errcode === 'number' && d.errcode !== 0) {
    const msg = String(d.errmsg ?? '');
    throwIfYeastarIpForbidden(d.errcode, msg);
    // Includes 10005 (no Recording scope) — still try `/cdr_recording/…` + relay below.
    return null;
  }

  const relUrl = d.download_resource_url;
  if (typeof relUrl !== 'string' || !relUrl) return null;

  const path = relUrl.startsWith('/') ? relUrl : `/${relUrl}`;
  const joinToken = path.includes('?') ? '&' : '?';
  return `${PBX_PUBLIC_BASE_URL}${path}${joinToken}access_token=${encodeURIComponent(token)}`;
}

/**
 * Official flow: GET `/openapi/v1.0/recording/download` → `download_resource_url`.
 * Returns `null` on any API error or missing scope — caller falls back to `/cdr_recording/…`
 * when the relay can still stream WAV with Bearer + token.
 */
async function tryRecordingDownloadViaOpenApi(
  recordingPath: string,
  token: string
): Promise<string | null> {
  let fileKey: string;
  try {
    fileKey = extractYeastarRecordingFileKey(recordingPath);
  } catch {
    return null;
  }

  const params = /^\d+$/.test(fileKey)
    ? { id: fileKey, access_token: token }
    : { file: fileKey, access_token: token };

  const browserTransport = _recordingAuth?.browserTransport === true;

  if (browserTransport) {
    const data = await fetchRecordingDownloadJsonViaBrowser(params);
    if (data === null) return null;
    return parseRecordingDownloadResponse(data, token);
  }

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: `${OPENAPI}/recording/download`,
      method: 'GET',
      params,
    },
  });

  if (error) return null;

  return parseRecordingDownloadResponse(data, token);
}

/**
 * RAS shortcut used when webhook stores full HTTPS paths under `/cdr_recording/recording/`.
 */
function buildDirectCdrRecordingUrl(recordingPath: string, token: string): string {
  const raw = recordingPath.trim();

  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    u.searchParams.set('access_token', token);
    u.searchParams.set('token', token);
    return u.toString();
  }

  const filename = raw.replace(/^\/+/, '');
  return `${PBX_PUBLIC_BASE_URL}/cdr_recording/recording/${filename}?access_token=${encodeURIComponent(token)}&token=${encodeURIComponent(token)}`;
}

/**
 * Recording playback/download URL for `<audio>` / new-tab download.
 *
 * 1. **OpenAPI**: `recording/download` when Recording scope is enabled.
 * 2. **Fallback**: `/cdr_recording/recording/…` + relay (Bearer + token) — used when OpenAPI returns 10005 or no link.
 *
 * Playback uses {@link getRecordingPlaybackObjectUrl} → Edge relay (avoids browser CORS on RAS).
 */
export async function getRecordingDownloadUrl(recordingPath: string): Promise<string> {
  if (!isYeastarConfigured())
    throw new Error('Yeastar not configured');

  const token = await getYeastarTokenForRecordings();

  const viaOpenApi = await tryRecordingDownloadViaOpenApi(recordingPath, token);
  if (viaOpenApi) return viaOpenApi;

  return buildDirectCdrRecordingUrl(recordingPath, token);
}

/**
 * Same-origin playback URL for `<audio>`: streams the PBX file through `yeastar-api`.
 *
 * Always relays — including when `get_token` ran in the browser (Edge 70087). Direct
 * `fetch()` from the dashboard origin to `*.ras.yeastar.com` hits **CORS**; server-side relay does not.
 */
export async function getRecordingPlaybackObjectUrl(
  recordingPath: string
): Promise<string> {
  const load = async () => {
    const directUrl = await getRecordingDownloadUrl(recordingPath);
    return relayPbxRecordingThroughEdge(directUrl);
  };

  try {
    return await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const maybeStaleToken =
      /non-audio|text\/html|bad token|non-audio body|PBX returned non-audio/i.test(
        msg
      );
    if (!maybeStaleToken) throw e;
    _recordingAuth = null;
    return await load();
  }
}

function sniffAudioMimeFromUrl(url: string): string {
  const path = url.split('?')[0] || url;
  if (/\.mp3$/i.test(path)) return 'audio/mpeg';
  if (/\.wav$/i.test(path)) return 'audio/wav';
  return 'audio/wav';
}

async function relayPbxRecordingThroughEdge(pbxDownloadUrl: string): Promise<string> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const { data: sess } = await supabase.auth.getSession();
  const bearer = sess.session?.access_token ?? anonKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/yeastar-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ relay_from_pbx: pbxDownloadUrl }),
  });

  const ct = (res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok || ct.includes('application/json')) {
    const raw = await res.text();
    let parsed: { error?: string; detail?: string; pbx_status?: number } | undefined;
    try {
      parsed = JSON.parse(raw) as { error?: string; detail?: string; pbx_status?: number };
    } catch {
      /* plain-text error body */
    }
    if (parsed && typeof parsed === 'object') {
      const hint = 'hint' in parsed ? String((parsed as { hint?: string }).hint) : '';
      const msg = [
        parsed.error ?? `Recording relay HTTP ${res.status}`,
        hint ? hint.slice(0, 360) : '',
        parsed.pbx_status != null ? `PBX ${parsed.pbx_status}` : '',
        parsed.detail && !hint ? String(parsed.detail).slice(0, 200) : '',
      ]
        .filter(Boolean)
        .join(' — ');
      throw new Error(msg || raw.slice(0, 240));
    }
    throw new Error(`Recording relay failed (${res.status}): ${raw.slice(0, 240)}`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) {
    throw new Error('Recording relay returned empty body');
  }

  let mime = res.headers.get('content-type')?.split(';')[0].trim() || '';
  if (!mime || mime === 'application/octet-stream') {
    mime = sniffAudioMimeFromUrl(pbxDownloadUrl);
  }

  const blob = new Blob([buf], { type: mime });
  return URL.createObjectURL(blob);
}
