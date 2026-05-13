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

  const { data, error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: '/v1.0/get_token',
      method: 'POST',
      body: { username: CLIENT_ID, password: CLIENT_SECRET }
    }
  });

  if (error) throw new Error(`Yeastar auth failed: ${error.message}`);
  if (!data?.token) throw new Error(`Yeastar auth failed: ${JSON.stringify(data)}`);

  _token = data.token as string;
  _tokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min (token lives 30 min)
  return _token;
}

// ─── Call Control ──────────────────────────────────────────

export async function clickToCall(agentExtension: string, callerNumber: string): Promise<void> {
  if (!isYeastarConfigured()) throw new Error('Yeastar not configured');
  const token = await getYeastarToken();

  const { error } = await supabase.functions.invoke('yeastar-api', {
    body: {
      endpoint: '/v1.0/call/dial',
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
      endpoint: '/v1.0/call/hangup',
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
      endpoint: '/v1.0/extensionlist/query',
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
      endpoint: '/v1.0/extension/query',
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
      endpoint: '/v1.0/cdr/query',
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
        endpoint: '/v1.0/deviceinfo/query',
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
 * Returns a full authenticated URL to download or play a call recording.
 * Format: {PBX_URL}/v1.0/recording/download?recording={path}&token={token}
 */
export async function getRecordingDownloadUrl(recordingPath: string): Promise<string> {
  if (!isYeastarConfigured()) throw new Error('Yeastar not configured');
  const token = await getYeastarToken();
  
  // Handle both full URLs (from webhook) and raw paths
  let path = recordingPath;
  if (path.includes('recording=')) {
    const url = new URL(path);
    path = url.searchParams.get('recording') || path;
  } else if (path.includes('/')) {
    // If it's a full URL but not a standard Yeastar one, extract the path if possible
    try {
      const url = new URL(path);
      path = url.searchParams.get('recording') || url.pathname.split('/').pop() || path;
    } catch {
      // Not a valid URL, treat as raw path
    }
  }

  // Note: For the actual audio element src, we still need the PBX URL,
  // but we append the token obtained via the proxy.
  return `${PBX_BASE_URL}/v1.0/recording/download?recording=${encodeURIComponent(path)}&token=${token}`;
}
