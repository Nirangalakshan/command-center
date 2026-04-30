const PBX_BASE = ((import.meta.env.VITE_YEASTAR_PBX_URL as string) ?? '').replace(/\/$/, '');
const CLIENT_ID = ((import.meta.env.VITE_YEASTAR_CLIENT_ID as string) ?? '').trim();
const CLIENT_SECRET = ((import.meta.env.VITE_YEASTAR_CLIENT_SECRET as string) ?? '').trim();

let _token: string | null = null;
let _tokenExp = 0;

interface OpenApiBase<T = unknown> {
  errcode: number;
  errmsg: string;
  data?: T;
  list?: T;
}

export interface YeastarMessageSession {
  id: number;
  type: string;
  isClose: boolean;
  isArchived: boolean;
  customerNo: string;
  customerName: string;
  didNumber: string;
  lastMsgId: number;
  queueId: number;
  pickupMemberId: number;
}

export interface YeastarSessionMessage {
  sessionId: number;
  msgId: number;
  senderNo: string;
  senderType: number;
  senderName: string;
  body: string;
  msgType: number;
  sendTime: number;
  receiveTime: number;
}

function assertConfigured() {
  if (!PBX_BASE || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'Missing Yeastar config: VITE_YEASTAR_PBX_URL, VITE_YEASTAR_CLIENT_ID, VITE_YEASTAR_CLIENT_SECRET.',
    );
  }
}

async function getToken(): Promise<string> {
  assertConfigured();
  if (_token && Date.now() < _tokenExp) return _token;

  const res = await fetch(`${PBX_BASE}/openapi/v1.0/get_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: CLIENT_ID, password: CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Yeastar token HTTP ${res.status}`);
  const json: {
    errcode: number;
    errmsg: string;
    access_token?: string;
    access_token_expire_time?: number;
  } = await res.json();
  if (json.errcode !== 0 || !json.access_token) {
    throw new Error(`Yeastar token error ${json.errcode}: ${json.errmsg}`);
  }

  _token = json.access_token;
  _tokenExp = Date.now() + Math.max(60, (json.access_token_expire_time ?? 1800) - 60) * 1000;
  return _token;
}

/** Other party in the thread: `to` is the usual customer object; some PBX builds use `from` for internal extension peers. */
function sessionPeer(raw: Record<string, unknown>): Record<string, unknown> {
  const to = (raw.to ?? {}) as Record<string, unknown>;
  const from = (raw.from ?? {}) as Record<string, unknown>;
  const toNo = String(to.user_no ?? '').trim();
  if (toNo) return to;
  const fromNo = String(from.user_no ?? '').trim();
  if (fromNo) return from;
  return to;
}

function normalizeSession(raw: Record<string, unknown>): YeastarMessageSession {
  const peer = sessionPeer(raw);
  return {
    id: Number(raw.id ?? 0),
    type: String(raw.type ?? ''),
    isClose: Number(raw.is_close ?? 0) === 1,
    isArchived: Number(raw.is_archived ?? 0) === 1,
    customerNo: String(peer.user_no ?? ''),
    customerName: String(peer.username ?? '') || String(peer.user_no ?? ''),
    didNumber: String(raw.did_number ?? ''),
    lastMsgId: Number(raw.last_msg_id ?? 0),
    queueId: Number(raw.queue_id ?? 0),
    pickupMemberId: Number(raw.pickup_member_id ?? 0),
  };
}

function normalizeMsg(raw: Record<string, unknown>): YeastarSessionMessage {
  const sender = (raw.sender ?? {}) as Record<string, unknown>;
  return {
    sessionId: Number(raw.session_id ?? 0),
    msgId: Number(raw.msg_id ?? 0),
    senderNo: String(sender.user_no ?? ''),
    senderType: Number(sender.user_type ?? 0),
    senderName: String(sender.username ?? sender.user_no ?? ''),
    body: String(raw.msg_body ?? ''),
    msgType: Number(raw.msg_type ?? 0),
    sendTime: Number(raw.send_time ?? 0),
    receiveTime: Number(raw.receive_time ?? 0),
  };
}

export interface ExtensionWithMessagingSessions {
  extension: string;
  sessionCount: number;
}

/**
 * For each extension number, calls `message_session/list` (same as
 * {@link fetchSessionsByExtension}). Returns only extensions that have at
 * least one messaging session — i.e. they have had a conversation on the PBX.
 *
 * Requests are run in small concurrent batches to avoid hammering the API.
 */
export async function fetchExtensionsWithMessagingSessions(
  extensionNumbers: string[],
  options?: { concurrency?: number },
): Promise<ExtensionWithMessagingSessions[]> {
  const uniq = [...new Set(extensionNumbers.map((n) => n.trim()).filter(Boolean))];
  if (!uniq.length) return [];

  const concurrency = Math.max(1, Math.min(10, options?.concurrency ?? 5));
  const withSessions: ExtensionWithMessagingSessions[] = [];

  for (let i = 0; i < uniq.length; i += concurrency) {
    const chunk = uniq.slice(i, i + concurrency);
    const settled = await Promise.all(
      chunk.map(async (ext) => {
        try {
          const sessions = await fetchSessionsByExtension(ext);
          if (sessions.length === 0) return null;
          return { extension: ext, sessionCount: sessions.length } satisfies ExtensionWithMessagingSessions;
        } catch {
          // Missing permission, extension not in messaging, etc. — treat as no sessions.
          return null;
        }
      }),
    );
    for (const row of settled) {
      if (row) withSessions.push(row);
    }
  }

  withSessions.sort((a, b) =>
    a.extension.localeCompare(b.extension, undefined, { numeric: true }),
  );
  return withSessions;
}

export async function fetchSessionsByExtension(extension: string): Promise<YeastarMessageSession[]> {
  const ext = extension.trim();
  if (!ext) return [];
  const token = await getToken();
  const qs = new URLSearchParams({
    access_token: token,
    page_size: '100',
    user_type: '1',
    user_no: ext,
    is_archived: '2',
    is_closed: '2',
    is_pickup: '0',
    collection: 'all',
  });
  const res = await fetch(`${PBX_BASE}/openapi/v1.0/message_session/list?${qs}`, {
    headers: { 'User-Agent': 'OpenAPI' },
  });
  if (!res.ok) throw new Error(`message_session/list HTTP ${res.status}`);
  const json: OpenApiBase<unknown[]> = await res.json();
  if (json.errcode !== 0) {
    throw new Error(`message_session/list error ${json.errcode}: ${json.errmsg}`);
  }
  const rows = Array.isArray(json.list) ? json.list : [];
  return rows
    .map((x) => normalizeSession((x ?? {}) as Record<string, unknown>))
    .filter((x) => x.id > 0)
    .sort((a, b) => b.lastMsgId - a.lastMsgId);
}

export async function fetchMessagesBySession(sessionId: number): Promise<YeastarSessionMessage[]> {
  if (!sessionId) return [];
  const token = await getToken();
  const qs = new URLSearchParams({
    access_token: token,
    id: String(sessionId),
    page_size: '100',
  });
  const res = await fetch(`${PBX_BASE}/openapi/v1.0/message/get?${qs}`, {
    headers: { 'User-Agent': 'OpenAPI' },
  });
  if (!res.ok) throw new Error(`message/get HTTP ${res.status}`);
  const json: OpenApiBase<{ records?: unknown[] }> = await res.json();
  if (json.errcode !== 0) {
    throw new Error(`message/get error ${json.errcode}: ${json.errmsg}`);
  }
  const records = Array.isArray(json.data?.records) ? json.data?.records : [];
  return records
    .map((x) => normalizeMsg((x ?? {}) as Record<string, unknown>))
    .filter((x) => x.msgId > 0)
    .sort((a, b) => a.msgId - b.msgId);
}

export async function sendMessageAsExtension(
  extension: string,
  sessionId: number,
  text: string,
): Promise<void> {
  const ext = extension.trim();
  const body = text.trim();
  if (!ext || !sessionId || !body) return;
  const token = await getToken();
  const qs = new URLSearchParams({ access_token: token });
  const res = await fetch(`${PBX_BASE}/openapi/v1.0/message/send?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' },
    body: JSON.stringify({
      sender_type: 1,
      sender_no: ext,
      session_id: sessionId,
      msg_kind: 0,
      msg_type: 0,
      msg_body: body,
      request_id: `cc-${Date.now()}`,
    }),
  });
  if (!res.ok) throw new Error(`message/send HTTP ${res.status}`);
  const json: OpenApiBase = await res.json();
  if (json.errcode !== 0) {
    throw new Error(`message/send error ${json.errcode}: ${json.errmsg}`);
  }
}
