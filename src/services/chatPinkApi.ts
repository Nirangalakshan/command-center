import { getFirebaseOnlyBmsBearerToken } from '@/services/bmsAuth';

// Re-export the chat APIs that the Chat Pink tab needs, so ChatPinkTab can
// import everything from a single module (chatPinkApi.ts).
export {
  fetchConversations,
  fetchConversationMessages,
  fetchCallCenterChatMessages,
  postConversationMessage,
  postCallCenterChatMessage,
  postConversationRead,
  postConversationClaim,
  postChatClose,
  postCallCenterChatClose,
  fetchWorkshopName,
  fetchWorkshopNames,
  fetchCallCenterWorkshopOwners,
  startCallCenterChatWithOwner,
  isCallCenterThreadId,
  persistCallCenterThreadTenant,
  getCallCenterThreadTenant,
} from '@/services/chatApi';
export type {
  CallCenterWorkshopOwner,
  Conversation,
  ChatMessage,
} from '@/services/chatApi';

const BASE_URL =
  (import.meta.env.VITE_CALL_CENTER_API_URL as string) ?? 'https://black.bmspros.com.au';

const PINK_PREFIX = '/api/call-center/chats/pink';

export interface PinkChat {
  chatId: string;
  workshopOwnerUid: string;
  workshopName: string;
  workshopLogoUrl: string;
  pinned: boolean;
  pinnedAt: string | null;
  pinnedByUid: string | null;
  lastMessageText: string;
  lastMessageAt: string;
  unreadForAgent: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getFirebaseOnlyBmsBearerToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
}

async function readHttpErrorDetail(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return '';
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    return j.message ?? j.error ?? text;
  } catch {
    return text;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function collectArray(json: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  const r = asRecord(json);
  for (const k of keys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
  }
  const data = asRecord(r.data);
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function toPinkChat(raw: unknown): PinkChat {
  const r = asRecord(raw);
  const workshop = asRecord(r.workshop);
  return {
    chatId: String(r.chatId ?? r.conversationId ?? r.id ?? ''),
    workshopOwnerUid: String(r.workshopOwnerUid ?? r.ownerUid ?? workshop.ownerUid ?? ''),
    workshopName: String(r.workshopName ?? workshop.name ?? ''),
    workshopLogoUrl: String(r.workshopLogoUrl ?? workshop.logoUrl ?? ''),
    pinned: Boolean(r.pinned ?? r.isPinned ?? false),
    pinnedAt: (r.pinnedAt as string | null) ?? null,
    pinnedByUid: (r.pinnedByUid as string | null) ?? null,
    lastMessageText: String(r.lastMessageText ?? r.lastMessage ?? ''),
    lastMessageAt: String(r.lastMessageAt ?? r.updatedAt ?? ''),
    unreadForAgent: Number(r.unreadForAgent ?? 0),
    status: String(r.status ?? ''),
    createdAt: String(r.createdAt ?? ''),
    updatedAt: String(r.updatedAt ?? ''),
  };
}

export type FetchPinkChatsOptions = {
  /** When true, only return chats currently pinned. */
  pinnedOnly?: boolean;
  /** Optional substring filter applied server-side; falls back to client-side filter when unsupported. */
  q?: string;
};

export async function fetchPinkChats(opts: FetchPinkChatsOptions = {}): Promise<PinkChat[]> {
  const params = new URLSearchParams();
  if (opts.pinnedOnly) params.set('pinned', 'true');
  if (opts.q?.trim()) params.set('q', opts.q.trim());

  const qs = params.toString();
  const path = `${PINK_PREFIX}${qs ? `?${qs}` : ''}`;
  const res = await authorizedFetch(path);
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`fetchPinkChats failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
  const json = (await res.json()) as unknown;
  return collectArray(json, 'chats', 'pinkChats', 'items').map(toPinkChat);
}

export async function pinChat(chatId: string): Promise<void> {
  const res = await authorizedFetch(
    `${PINK_PREFIX}/${encodeURIComponent(chatId)}/pin`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`pinChat failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}

export async function unpinChat(chatId: string): Promise<void> {
  const res = await authorizedFetch(
    `${PINK_PREFIX}/${encodeURIComponent(chatId)}/unpin`,
    { method: 'POST', body: '{}' },
  );
  if (!res.ok) {
    const detail = await readHttpErrorDetail(res);
    throw new Error(`unpinChat failed: ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
}
