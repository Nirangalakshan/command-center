import { getAuthApiOrigin, getValidSupabaseAccessToken, syncAuthSessionFromSupabase } from '@/services/authApi';
import { supabase } from '@/integrations/supabase/client';

/** BMS Black proxy on the command-center API (Supabase token → Firebase upstream). */
const BMS_BLACK_BASE_URL = `${getAuthApiOrigin()}/api/bms-black`;

const AGENT_PREFIX = '/agent/conversations';

// ── Row from GET /agent/conversations (queue | mine) ──────────────────────

export interface Conversation {
  conversationId: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  role: string;
  ownerUid: string | null;
  status: string;
  agentId: string | null;
  agentName: string | null;
  agentEmail: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastSender: string;
  unreadForAgent: number;
  unreadForCustomer: number;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

export type ConversationsResponse = {
  queue: Conversation[];
  mine: Conversation[];
};

/** @deprecated Use {@link Conversation} */
export type AgentConversation = Conversation;

/** @deprecated Use {@link ConversationsResponse} */
export type AgentConversationsResponse = ConversationsResponse;

// ── Legacy dashboard shape (sidebar unread / older UI) ─────────────────────

export interface ChatWorkshop {
  ownerUid: string;
  name: string;
  displayName: string;
  slug: string;
  logoUrl: string;
  email: string;
  phone: string;
  address: string;
  abn: string;
  timezone: string;
  state: string;
  bookingEngineUrl: string;
  accountStatus: string;
}

export interface ChatWorkshopUser {
  uid: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  phone: string;
  branchId: string;
  branchName: string;
}

export interface ChatItem {
  chatId: string;
  workshopOwnerUid: string;
  tenantUserUid: string;
  tenantRole: string;
  agentUid: string;
  participantIds: string[];
  agentName: string;
  tenantName: string;
  lastMessageText: string;
  lastMessageAt: string;
  lastSenderId: string;
  unreadForTenant: boolean;
  unreadForAgent: boolean;
  chatsReviewed: boolean;
  chatsReviewedAt: string | null;
  chatsReviewedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  workshop: ChatWorkshop | null;
  workshopUser: ChatWorkshopUser | null;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  /** Same as {@link conversationId} — kept for older call sites. */
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
  senderRole?: string;
  readAt?: string | null;
}

export type FetchChatsOptions = {
  tenantId?: string | null;
  ownerUid?: string | null;
  queueLimit?: number;
  mineLimit?: number;
};

export type FetchChatMessagesOptions = {
  limit?: number;
  before?: string | null;
};

export type FetchChatMessagesPage = {
  messages: ChatMessage[];
  nextBefore: string | null;
};

export type CallCenterChatOptions = {
  /** BMS workshop owner uid — sent as `X-Tenant-Id` on call-center chat routes. */
  workshopOwnerUid?: string | null;
};

async function bmsBlackFetch(
  path: string,
  init: RequestInit = {},
  options?: CallCenterChatOptions,
): Promise<Response> {
  const token = await getValidSupabaseAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  const tenant = options?.workshopOwnerUid?.trim();
  if (tenant) headers.set('X-Tenant-Id', tenant);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${BMS_BLACK_BASE_URL}${suffix}`;
  return fetch(url, { ...init, headers });
}

async function bmsBlackFetchWithAuthRetry(
  path: string,
  init: RequestInit = {},
  options?: CallCenterChatOptions,
): Promise<Response> {
  let res = await bmsBlackFetch(path, init, options);
  if (res.status !== 401) return res;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) return res;

  syncAuthSessionFromSupabase(data.session);
  return bmsBlackFetch(path, init, options);
}

async function readHttpErrorDetail(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return '';
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      const msg = o.message ?? o.error ?? o.detail ?? o.reason;
      if (typeof msg === 'string') return msg;
    }
    return text.slice(0, 800);
  } catch {
    return text.slice(0, 800);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function toConversation(raw: unknown): Conversation {
  const r = asRecord(raw);
  return {
    conversationId: String(r.conversationId ?? r.chatId ?? ''),
    userId: String(r.userId ?? ''),
    userName: String(r.userName ?? ''),
    userEmail: r.userEmail == null ? null : String(r.userEmail),
    userPhone: r.userPhone == null ? null : String(r.userPhone),
    role: String(r.role ?? ''),
    ownerUid: r.ownerUid == null ? null : String(r.ownerUid),
    status: String(r.status ?? ''),
    agentId: r.agentId == null ? null : String(r.agentId),
    agentName: r.agentName == null ? null : String(r.agentName),
    agentEmail: r.agentEmail == null ? null : String(r.agentEmail),
    lastMessage: String(r.lastMessage ?? r.lastMessageText ?? ''),
    lastMessageAt: String(r.lastMessageAt ?? ''),
    lastSender: String(r.lastSender ?? r.lastSenderId ?? ''),
    unreadForAgent: Number(r.unreadForAgent ?? 0),
    unreadForCustomer: Number(r.unreadForCustomer ?? 0),
    createdAt: String(r.createdAt ?? ''),
    updatedAt: String(r.updatedAt ?? ''),
    claimedAt: r.claimedAt == null ? null : String(r.claimedAt),
    closedAt: r.closedAt == null ? null : String(r.closedAt),
    closedBy: r.closedBy == null ? null : String(r.closedBy),
  };
}

function conversationToChatItem(c: Conversation): ChatItem {
  const lastN = c.lastSender.trim().toLowerCase();
  const lastSenderId =
    lastN === 'agent'
      ? (c.agentId ?? '')
      : lastN === 'customer'
        ? (c.userId ?? '')
        : '';

  return {
    chatId: c.conversationId,
    workshopOwnerUid: c.ownerUid ?? '',
    tenantUserUid: c.userId,
    tenantRole: c.role,
    agentUid: c.agentId ?? '',
    participantIds: [c.userId, c.agentId ?? ''].filter(Boolean),
    agentName: c.agentName ?? '',
    tenantName: c.userName,
    lastMessageText: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    lastSenderId,
    unreadForTenant: c.unreadForCustomer > 0,
    unreadForAgent: c.unreadForAgent > 0,
    chatsReviewed: Boolean(c.closedAt) || c.status === 'closed',
    chatsReviewedAt: c.closedAt,
    chatsReviewedByUid: c.closedBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    workshop: null,
    workshopUser: {
      uid: c.userId,
      name: c.userName,
      displayName: c.userName,
      email: c.userEmail ?? '',
      role: c.role,
      phone: c.userPhone ?? '',
      branchId: '',
      branchName: '',
    },
  };
}

function tenantScopedHeaders(ownerUid: string): Headers {
  const h = new Headers();
  if (ownerUid) h.set('X-Tenant-Id', ownerUid);
  return h;
}

function appendScopeQuery(params: URLSearchParams, options?: FetchChatsOptions): void {
  const ou = options?.ownerUid?.trim() || '';
  const tid = options?.tenantId?.trim() || '';
  if (ou) params.set('ownerUid', ou);
  else if (tid) params.set('tenantId', tid);
}

function extractMessageText(value: unknown, depth = 0): string {
  if (depth > 6) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const r = asRecord(value);
  for (const k of ['text', 'body', 'content', 'message', 'lastMessage'] as const) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  for (const wrap of ['data', 'result', 'payload'] as const) {
    const w = r[wrap];
    if (w != null && w !== r) {
      const inner = extractMessageText(w, depth + 1);
      if (inner.trim()) return inner;
    }
  }
  return '';
}

function extractMessageCreatedAt(raw: Record<string, unknown>): string {
  for (const k of [
    'createdAt',
    'created_at',
    'sentAt',
    'sent_at',
    'timestamp',
    'time',
    'date',
  ] as const) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function toMessage(raw: unknown, fallbackConversationId: string): ChatMessage {
  if (typeof raw === 'string') {
    const id = fallbackConversationId;
    return {
      messageId: '',
      conversationId: id,
      chatId: id,
      senderId: '',
      text: raw,
      createdAt: '',
    };
  }
  const r = asRecord(raw);
  const convId = String(r.conversationId ?? r.chatId ?? fallbackConversationId);
  return {
    messageId: String(r.messageId ?? r.id ?? ''),
    conversationId: convId,
    chatId: convId,
    senderId: String(r.senderId ?? r.userId ?? r.agentUid ?? r.sender_uid ?? ''),
    text: extractMessageText(raw),
    createdAt: extractMessageCreatedAt(r),
    senderRole: r.senderRole != null ? String(r.senderRole) : undefined,
    readAt:
      r.readAt === null ? null : r.readAt != null ? String(r.readAt) : undefined,
  };
}

function collectMessagesArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const key of ['messages', 'chatMessages', 'items', 'results'] as const) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
    const chat = o.chat;
    if (chat && typeof chat === 'object' && Array.isArray((chat as Record<string, unknown>).messages)) {
      return (chat as Record<string, unknown>).messages as unknown[];
    }
    const data = o.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      for (const key of ['messages', 'chatMessages', 'items', 'results'] as const) {
        if (Array.isArray(d[key])) return d[key] as unknown[];
      }
    }
  }
  return [];
}

function readNextBefore(json: unknown): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const direct = o.nextBefore ?? o.next_before;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return null;
}

// ── Public API (support-chat) ─────────────────────────────────────────────

export async function fetchConversations(
  options?: FetchChatsOptions,
): Promise<ConversationsResponse> {
  const ou = options?.ownerUid?.trim() || '';
  const params = new URLSearchParams();
  appendScopeQuery(params, options);
  if (options?.queueLimit != null) params.set('queueLimit', String(options.queueLimit));
  if (options?.mineLimit != null) params.set('mineLimit', String(options.mineLimit));
  const qs = params.toString();
  const path = `${AGENT_PREFIX}${qs ? `?${qs}` : ''}`;

  const res = await bmsBlackFetch(path, { headers: tenantScopedHeaders(ou) });

  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`fetchConversations failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  return {
    queue: Array.isArray(json.queue) ? json.queue.map(toConversation) : [],
    mine: Array.isArray(json.mine) ? json.mine.map(toConversation) : [],
  };
}

/** @deprecated Use {@link fetchConversations} */
export const fetchAgentConversations = fetchConversations;

export async function fetchConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const page = await fetchChatMessagesPage(conversationId);
  return page.messages;
}

export async function postConversationMessage(
  conversationId: string,
  text: string,
): Promise<ChatMessage | null> {
  const path = `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/messages`;
  const res = await bmsBlackFetch(path, {
    method: 'POST',
    body: JSON.stringify({ message: text }),
  });

  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `postConversationMessage failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const rawText = await res.text();
  const fallback: ChatMessage = {
    messageId: '',
    conversationId,
    chatId: conversationId,
    senderId: '',
    text,
    createdAt: new Date().toISOString(),
  };

  if (!rawText.trim()) return fallback;

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const payload = parsed.message ?? parsed.data ?? parsed;
    return toMessage(payload, conversationId);
  } catch {
    return fallback;
  }
}

export async function postConversationClaim(conversationId: string): Promise<void> {
  const res = await bmsBlackFetch(
    `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/claim`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`postConversationClaim failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}

export async function postConversationRead(conversationId: string): Promise<void> {
  const res = await bmsBlackFetch(
    `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`postConversationRead failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}

export async function postConversationClose(conversationId: string): Promise<void> {
  const res = await bmsBlackFetch(
    `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/close`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`postConversationClose failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}

export async function fetchWorkshopName(ownerUid: string | null): Promise<string | null> {
  if (!ownerUid) return null;
  const { data, error } = await supabase
    .from('did_mappings')
    .select('workshop_name')
    .eq('owner_id', ownerUid)
    .maybeSingle();
  if (error || !data?.workshop_name) return null;
  return String(data.workshop_name).trim() || null;
}

export async function fetchWorkshopNames(ownerUids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ownerUids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from('did_mappings')
    .select('owner_id, workshop_name')
    .in('owner_id', unique);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    if (row.owner_id && row.workshop_name && !map[row.owner_id]) {
      map[row.owner_id] = String(row.workshop_name).trim();
    }
  }
  return map;
}

// ── Public API (call-center chats) ─────────────────────────────────────────

export type CallCenterWorkshopOwner = {
  ownerUid: string;
  name: string;
  slug: string;
  logoUrl: string;
  contactPhone: string;
  email: string;
  timezone: string;
  state: string;
  accountStatus: string;
};

function collectWorkshopOwnersArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.workshopOwners)) return o.workshopOwners;
    const data = o.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d.workshopOwners)) return d.workshopOwners;
    }
  }
  return [];
}

function toCallCenterWorkshopOwner(raw: unknown): CallCenterWorkshopOwner {
  const r = asRecord(raw);
  return {
    ownerUid: String(r.ownerUid ?? ''),
    name: String(r.name ?? ''),
    slug: String(r.slug ?? ''),
    logoUrl: String(r.logoUrl ?? ''),
    contactPhone: String(r.contactPhone ?? ''),
    email: String(r.email ?? ''),
    timezone: String(r.timezone ?? ''),
    state: String(r.state ?? ''),
    accountStatus: String(r.accountStatus ?? ''),
  };
}

export async function fetchCallCenterWorkshopOwners(): Promise<CallCenterWorkshopOwner[]> {
  const res = await bmsBlackFetch('/chats/workshop-owners');
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `fetchCallCenterWorkshopOwners failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }
  const json = (await res.json()) as unknown;
  return collectWorkshopOwnersArray(json).map(toCallCenterWorkshopOwner);
}

export type StartCallCenterChatResponse = {
  chatId: string;
  conversationId?: string;
};

/** Client cache until auth server exposes GET /api/bms-black/chats/:chatId/messages */
const CALL_CENTER_MESSAGES_CACHE_KEY = 'command_center_call_center_chat_messages';

function readCallCenterMessagesCache(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CALL_CENTER_MESSAGES_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, ChatMessage[]> = {};
    for (const [chatId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(rows)) continue;
      out[chatId] = rows.filter((r) => r && typeof r === 'object') as ChatMessage[];
    }
    return out;
  } catch {
    return {};
  }
}

function writeCallCenterMessagesCache(cache: Record<string, ChatMessage[]>): void {
  try {
    localStorage.setItem(CALL_CENTER_MESSAGES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function sortChatMessages(rows: ChatMessage[]): ChatMessage[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return ta !== tb ? ta - tb : (a.messageId || '').localeCompare(b.messageId || '');
  });
}

export function getCachedCallCenterChatMessages(chatId: string): ChatMessage[] {
  return readCallCenterMessagesCache()[chatId] ?? [];
}

function setCachedCallCenterChatMessages(chatId: string, messages: ChatMessage[]): void {
  const cache = readCallCenterMessagesCache();
  cache[chatId] = sortChatMessages(messages);
  writeCallCenterMessagesCache(cache);
}

function mergeCallCenterMessagesIntoCache(chatId: string, incoming: ChatMessage[]): void {
  if (incoming.length === 0) return;
  const cache = readCallCenterMessagesCache();
  const existing = cache[chatId] ?? [];
  const byKey = new Map<string, ChatMessage>();
  for (const m of [...existing, ...incoming]) {
    const key = m.messageId?.trim() || `${m.createdAt}|${m.text}|${m.senderId}`;
    byKey.set(key, m);
  }
  cache[chatId] = sortChatMessages([...byKey.values()]);
  writeCallCenterMessagesCache(cache);
}

export function clearCachedCallCenterChatMessages(chatId: string): void {
  const cache = readCallCenterMessagesCache();
  delete cache[chatId];
  writeCallCenterMessagesCache(cache);
}

function extractChatId(json: unknown): string {
  const seen = new Set<unknown>();

  const walk = (v: unknown, depth: number): string => {
    if (!v || depth > 6) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v !== 'object') return '';
    if (seen.has(v)) return '';
    seen.add(v);

    const r = v as Record<string, unknown>;
    for (const k of ['chatId', 'conversationId', 'id'] as const) {
      const direct = r[k];
      if (typeof direct === 'string' && direct.trim()) return direct.trim();
    }

    for (const wrap of ['chat', 'conversation', 'thread', 'data', 'result', 'payload'] as const) {
      const inner = walk(r[wrap], depth + 1);
      if (inner) return inner;
    }

    // fallback: scan a few top-level object values
    for (const value of Object.values(r)) {
      const inner = walk(value, depth + 1);
      if (inner) return inner;
    }
    return '';
  };

  return walk(json, 0);
}

export async function startCallCenterChatWithOwner(
  workshopOwnerUid: string,
  text?: string,
): Promise<StartCallCenterChatResponse> {
  const body: Record<string, unknown> = { workshopOwnerUid };
  if (text != null && text.trim()) body.text = text.trim();

  const res = await bmsBlackFetch(
    '/chats/start-with-owner',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    { workshopOwnerUid },
  );

  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `startCallCenterChatWithOwner failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const rawText = await res.text();
  const parsed: unknown = rawText.trim() ? (JSON.parse(rawText) as unknown) : rawText;
  const chatId = extractChatId(parsed);
  if (!chatId) {
    return { chatId: '', conversationId: undefined };
  }

  const fromApi = collectMessagesArray(parsed).map((row) => toMessage(row, chatId));
  if (fromApi.length > 0) {
    mergeCallCenterMessagesIntoCache(chatId, fromApi);
  } else if (text?.trim()) {
    mergeCallCenterMessagesIntoCache(chatId, [
      {
        messageId: '',
        conversationId: chatId,
        chatId,
        senderId: '',
        text: text.trim(),
        createdAt: new Date().toISOString(),
        senderRole: 'agent',
      },
    ]);
  }

  return {
    chatId,
    conversationId: chatId,
  };
}

export async function postCallCenterChatMessage(
  chatId: string,
  text: string,
  options?: CallCenterChatOptions,
): Promise<ChatMessage | null> {
  const res = await bmsBlackFetch(
    `/chats/${encodeURIComponent(chatId)}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) },
    options,
  );

  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `postCallCenterChatMessage failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const rawText = await res.text();
  const fallback: ChatMessage = {
    messageId: '',
    conversationId: chatId,
    chatId,
    senderId: '',
    text,
    createdAt: new Date().toISOString(),
    senderRole: 'agent',
  };

  if (!rawText.trim()) {
    mergeCallCenterMessagesIntoCache(chatId, [fallback]);
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const payload = parsed.message ?? parsed.data ?? parsed;
    const msg = toMessage(payload, chatId);
    mergeCallCenterMessagesIntoCache(chatId, [msg]);
    return msg;
  } catch {
    mergeCallCenterMessagesIntoCache(chatId, [fallback]);
    return fallback;
  }
}

export async function fetchCallCenterChatMessages(
  chatId: string,
  options?: CallCenterChatOptions,
): Promise<ChatMessage[]> {
  const msgPath = `/chats/${encodeURIComponent(chatId)}/messages`;
  const res = await bmsBlackFetchWithAuthRetry(msgPath, { method: 'GET' }, options);

  if (res.ok) {
    const json = (await res.json()) as unknown;
    const rows = collectMessagesArray(json).map((row) => toMessage(row, chatId));
    setCachedCallCenterChatMessages(chatId, rows);
    return rows;
  }

  // Auth server may only have POST /chats/:id/messages today — use client cache from start + sends
  if (res.status === 404) {
    return getCachedCallCenterChatMessages(chatId);
  }

  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    if (res.status === 401) {
      throw new Error(
        detail
          ? `${detail} Sign out and sign in again.`
          : 'Session expired or invalid. Sign out and sign in again.',
      );
    }
    throw new Error(
      `fetchCallCenterChatMessages failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }

  return getCachedCallCenterChatMessages(chatId);
}

export async function postCallCenterChatClose(
  chatId: string,
  options?: CallCenterChatOptions,
): Promise<void> {
  const res = await bmsBlackFetch(
    `${AGENT_PREFIX}/${encodeURIComponent(chatId)}/close`,
    { method: 'POST', body: '{}' },
    options,
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `postCallCenterChatClose failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }
  clearCachedCallCenterChatMessages(chatId);
}

// ── Compatibility wrappers (Dashboard sidebar + older hooks) ────────────────

export async function fetchChats(options?: FetchChatsOptions): Promise<ChatItem[]> {
  const data = await fetchConversations(options);
  const qIds = new Set(data.queue.map((c) => c.conversationId));
  const ordered = [...data.mine.filter((c) => !qIds.has(c.conversationId)), ...data.queue];
  return ordered.map(conversationToChatItem);
}

export async function fetchChatMessagesPage(
  conversationId: string,
  options?: FetchChatMessagesOptions,
): Promise<FetchChatMessagesPage> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set('limit', String(options.limit));
  const before = options?.before?.trim();
  if (before) params.set('before', before);
  const qs = params.toString();
  const path = `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`;

  const res = await bmsBlackFetch(path);
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(
      `fetchChatMessagesPage failed: ${res.status}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const json = (await res.json()) as unknown;
  const rows = collectMessagesArray(json);
  return {
    messages: rows.map((row) => toMessage(row, conversationId)),
    nextBefore: readNextBefore(json),
  };
}

export async function fetchChatMessages(
  conversationId: string,
  options?: FetchChatMessagesOptions,
): Promise<ChatMessage[]> {
  const page = await fetchChatMessagesPage(conversationId, options);
  return page.messages;
}

export async function postChatMessage(
  conversationId: string,
  text: string,
  options?: { claimOn403?: boolean },
): Promise<ChatMessage | null> {
  void options;
  return postConversationMessage(conversationId, text);
}

export async function postChatRead(conversationId: string): Promise<void> {
  return postConversationRead(conversationId);
}

export async function postChatClaim(conversationId: string): Promise<void> {
  return postConversationClaim(conversationId);
}

export async function postChatClose(
  conversationId: string,
  opts?: { farewellMessage?: string },
): Promise<void> {
  const farewell = opts?.farewellMessage?.trim();
  const res = await bmsBlackFetch(
    `${AGENT_PREFIX}/${encodeURIComponent(conversationId)}/close`,
    {
      method: 'POST',
      body: JSON.stringify(farewell ? { farewellMessage: farewell } : {}),
    },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`postChatClose failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}
