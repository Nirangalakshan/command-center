import { collection, getDocs } from "firebase/firestore";
import { db, waitForAuth } from "@/lib/firebase";

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

export interface ChatMessageItem {
  id: string;
  chatId: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  updatedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function toIsoString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
    };
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      return Number.isNaN(d.getTime()) ? "" : d.toISOString();
    }
    if (typeof v.seconds === "number") {
      return new Date(v.seconds * 1000).toISOString();
    }
    if (typeof v._seconds === "number") {
      return new Date(v._seconds * 1000).toISOString();
    }
  }
  return "";
}

function pickString(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function toChatItem(raw: unknown, fallbackId: string): ChatItem {
  const r = asRecord(raw);
  const workshopRaw = asRecord(r.workshop);
  const workshopUserRaw = asRecord(r.workshopUser);

  return {
    chatId: pickString(r, ["chatId", "id"]) || fallbackId,
    workshopOwnerUid: pickString(r, ["workshopOwnerUid", "ownerUid"]),
    tenantUserUid: pickString(r, ["tenantUserUid", "tenantUid"]),
    tenantRole: pickString(r, ["tenantRole"]),
    agentUid: pickString(r, ["agentUid"]),
    participantIds: Array.isArray(r.participantIds)
      ? (r.participantIds as unknown[]).map((id) => String(id))
      : [],
    agentName: pickString(r, ["agentName"]),
    tenantName: pickString(r, ["tenantName", "customerName"]),
    lastMessageText: pickString(r, ["lastMessageText", "lastMessage"]),
    lastMessageAt: toIsoString(r.lastMessageAt),
    lastSenderId: pickString(r, ["lastSenderId"]),
    unreadForTenant: Boolean(r.unreadForTenant),
    unreadForAgent: Boolean(r.unreadForAgent),
    chatsReviewed: Boolean(r.chatsReviewed),
    chatsReviewedAt:
      r.chatsReviewedAt == null ? null : toIsoString(r.chatsReviewedAt),
    chatsReviewedByUid:
      r.chatsReviewedByUid == null ? null : String(r.chatsReviewedByUid),
    createdAt: toIsoString(r.createdAt),
    updatedAt: toIsoString(r.updatedAt),
    workshop: Object.keys(workshopRaw).length
      ? {
          ownerUid: String(workshopRaw.ownerUid ?? ""),
          name: String(workshopRaw.name ?? ""),
          displayName: String(workshopRaw.displayName ?? ""),
          slug: String(workshopRaw.slug ?? ""),
          logoUrl: String(workshopRaw.logoUrl ?? ""),
          email: String(workshopRaw.email ?? ""),
          phone: String(workshopRaw.phone ?? ""),
          address: String(workshopRaw.address ?? ""),
          abn: String(workshopRaw.abn ?? ""),
          timezone: String(workshopRaw.timezone ?? ""),
          state: String(workshopRaw.state ?? ""),
          bookingEngineUrl: String(workshopRaw.bookingEngineUrl ?? ""),
          accountStatus: String(workshopRaw.accountStatus ?? ""),
        }
      : null,
    workshopUser: Object.keys(workshopUserRaw).length
      ? {
          uid: String(workshopUserRaw.uid ?? ""),
          name: String(workshopUserRaw.name ?? ""),
          displayName: String(workshopUserRaw.displayName ?? ""),
          email: String(workshopUserRaw.email ?? ""),
          role: String(workshopUserRaw.role ?? ""),
          phone: String(workshopUserRaw.phone ?? ""),
          branchId: String(workshopUserRaw.branchId ?? ""),
          branchName: String(workshopUserRaw.branchName ?? ""),
        }
      : null,
  };
}

function toChatMessageItem(
  raw: unknown,
  chatId: string,
  fallbackId: string,
): ChatMessageItem {
  const r = asRecord(raw);
  return {
    id: pickString(r, ["messageId", "id", "uid"]) || fallbackId,
    chatId,
    text: pickString(r, ["text", "message", "body"]),
    senderId: pickString(r, ["senderId", "senderUid", "authorId", "fromUid"]),
    senderName: pickString(r, ["senderName", "authorName", "fromName"]),
    createdAt: toIsoString(r.createdAt) || toIsoString(r.timestamp),
    updatedAt: toIsoString(r.updatedAt),
  };
}

const CHAT_COLLECTION = "cc_direct_chats";

/**
 * Fetch ALL chats directly from Firestore `cc_direct_chats` collection (no API).
 * Sorted client-side by updatedAt/lastMessageAt desc, so we don't depend on
 * the field existing on every document.
 */
export async function fetchChatsFromFirebase(): Promise<ChatItem[]> {
  await waitForAuth();
  const snap = await getDocs(collection(db, CHAT_COLLECTION));
  const rows = snap.docs.map((docSnap) =>
    toChatItem(docSnap.data(), docSnap.id),
  );

  rows.sort((a, b) => {
    const ta = Date.parse(a.updatedAt || a.lastMessageAt || a.createdAt) || 0;
    const tb = Date.parse(b.updatedAt || b.lastMessageAt || b.createdAt) || 0;
    return tb - ta;
  });

  console.log(
    `[chatApi.fetchChatsFromFirebase] loaded ${rows.length} chats from "${CHAT_COLLECTION}"`,
  );
  return rows;
}

/**
 * Fetch messages for a given chat from `cc_direct_chats/{chatId}/messages`.
 */
export async function fetchChatMessagesFromFirebase(
  chatId: string,
): Promise<ChatMessageItem[]> {
  if (!chatId) return [];
  await waitForAuth();
  const snap = await getDocs(
    collection(db, CHAT_COLLECTION, chatId, "messages"),
  );
  const rows = snap.docs.map((docSnap) =>
    toChatMessageItem(docSnap.data(), chatId, docSnap.id),
  );
  rows.sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return ta - tb;
  });
  return rows;
}
