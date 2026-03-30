/**
 * ═══════════════════════════════════════════════════════════
 * Yeastar PBX Service — Frontend REST API Client
 * Yeastar P-Series / S-Series OAuth 2.0 integration
 *
 * Use for:
 *  - Click-to-call (agent dials caller from dashboard)
 *  - Querying live extension status (fallback polling)
 *  - Fetching CDRs on demand
 *
 * Note: Real-time events come via the yeastar-webhook edge
 * function, NOT this service. This is for outbound API calls.
 * ═══════════════════════════════════════════════════════════
 */

const PBX_BASE_URL = import.meta.env.VITE_YEASTAR_API_URL ?? '';
const CLIENT_ID = import.meta.env.VITE_YEASTAR_CLIENT_ID ?? '';
const CLIENT_SECRET = import.meta.env.VITE_YEASTAR_CLIENT_SECRET ?? '';

// Token cache
let _token: string | null = null;
let _tokenExpiry = 0;

export function isYeastarConfigured(): boolean {
  return Boolean(PBX_BASE_URL && CLIENT_ID && CLIENT_SECRET);
}

// ─── Authentication ───────────────────────────────────────

export async function getYeastarToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(`${PBX_BASE_URL}/v1.0/get_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CommandCentre/1.0',
    },
    body: JSON.stringify({ username: CLIENT_ID, password: CLIENT_SECRET }),
  });

  if (!res.ok) throw new Error(`Yeastar auth HTTP ${res.status}`);
  const json = await res.json();
  if (!json.token) throw new Error(`Yeastar auth failed: ${JSON.stringify(json)}`);

  _token = json.token as string;
  _tokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min (token lives 30 min)
  return _token;
}

// ─── Call Control ──────────────────────────────────────────

/**
 * Click-to-call: PBX calls the agent extension first,
 * then bridges to the callerNumber when answered.
 */
export async function clickToCall(agentExtension: string, callerNumber: string): Promise<void> {
  if (!isYeastarConfigured()) throw new Error('Yeastar not configured');
  const token = await getYeastarToken();

  const res = await fetch(`${PBX_BASE_URL}/v1.0/call/dial`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CommandCentre/1.0',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ caller: agentExtension, callee: callerNumber }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Click-to-call failed: ${err}`);
  }
}

/**
 * Hang up an active call by extension
 */
export async function hangupCall(extension: string): Promise<void> {
  if (!isYeastarConfigured()) return;
  const token = await getYeastarToken();

  await fetch(`${PBX_BASE_URL}/v1.0/call/hangup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CommandCentre/1.0',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ extension }),
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

  const res = await fetch(`${PBX_BASE_URL}/v1.0/extensionlist/query`, {
    headers: {
      'User-Agent': 'CommandCentre/1.0',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return (json.extlist ?? []) as YeastarExtension[];
}

export async function fetchExtensionStatus(extension: string): Promise<string> {
  if (!isYeastarConfigured()) return 'unknown';
  const token = await getYeastarToken();

  const res = await fetch(
    `${PBX_BASE_URL}/v1.0/extension/query?extension=${encodeURIComponent(extension)}`,
    {
      headers: {
        'User-Agent': 'CommandCentre/1.0',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) return 'unknown';
  const json = await res.json();
  return String(json.status ?? 'unknown');
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

  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 50),
    ...(params?.dateFrom ? { date_from: params.dateFrom } : {}),
    ...(params?.dateTo ? { date_to: params.dateTo } : {}),
  });

  const res = await fetch(`${PBX_BASE_URL}/v1.0/cdr/query?${qs}`, {
    headers: {
      'User-Agent': 'CommandCentre/1.0',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  return (json.cdrlist ?? []) as YeastarCdr[];
}

// ─── PBX Info ──────────────────────────────────────────────

export async function fetchPbxInfo(): Promise<{ firmware?: string; model?: string } | null> {
  if (!isYeastarConfigured()) return null;
  try {
    const token = await getYeastarToken();
    const res = await fetch(`${PBX_BASE_URL}/v1.0/deviceinfo/query`, {
      headers: { 'User-Agent': 'CommandCentre/1.0', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
