import { auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  'https://black.bmspros.com.au/api/call-center';

const STATIC_TOKEN =
  (import.meta.env.VITE_BMS_BEARER_TOKEN as string) ?? '';

async function apiHeaders(ownerUid: string): Promise<HeadersInit> {
  const user = auth.currentUser;
  const token = user ? await getIdToken(user) : STATIC_TOKEN;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': ownerUid,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type CustomerNotification = {
  id: string;
  source: string;
  type: 'additional_issue_quote' | 'estimate_reply' | 'booking_completed' | string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  // booking / issue
  bookingId: string | null;
  bookingCode: string | null;
  issueId: string | null;
  issueTitle: string | null;
  price: number | null;
  estimateId: string | null;
  // customer
  customerId: string;
  customerName: string;
  customerEmail: string;
  workshopName: string;
  ownerUid: string | null;
};

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchCustomerNotifications(
  ownerUid: string,
): Promise<CustomerNotification[]> {
  const res = await fetch(`${BASE_URL}/customer-notifications?all=1`, {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    throw new Error(`fetchCustomerNotifications failed: ${res.status}`);
  }

  const json = await res.json();
  // API may return { notifications: [...] } or a plain array
  const raw: unknown[] = Array.isArray(json) ? json : (json.notifications ?? []);

  return raw.map((item) => {
    const d = item as Record<string, unknown>;
    return {
      id:            String(d.id ?? ''),
      source:        String(d.source ?? ''),
      type:          String(d.type ?? ''),
      title:         String(d.title ?? ''),
      message:       String(d.message ?? ''),
      read:          Boolean(d.read),
      createdAt:     String(d.createdAt ?? ''),
      bookingId:     d.bookingId ? String(d.bookingId) : null,
      bookingCode:   d.bookingCode ? String(d.bookingCode) : null,
      issueId:       d.issueId ? String(d.issueId) : null,
      issueTitle:    d.issueTitle ? String(d.issueTitle) : null,
      price:         d.price != null ? Number(d.price) : null,
      estimateId:    d.estimateId ? String(d.estimateId) : null,
      customerId:    String(d.customerId ?? ''),
      customerName:  String(d.customerName ?? ''),
      customerEmail: String(d.customerEmail ?? ''),
      workshopName:  String(d.workshopName ?? ''),
      ownerUid:      d.ownerUid ? String(d.ownerUid) : null,
    } as CustomerNotification;
  });
}
