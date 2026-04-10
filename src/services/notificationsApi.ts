import { auth } from "@/lib/firebase";
import { getIdToken } from "firebase/auth";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  "https://black.bmspros.com.au/api/call-center";

const STATIC_TOKEN = (import.meta.env.VITE_BMS_BEARER_TOKEN as string) ?? "";

async function apiHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  let token = STATIC_TOKEN;
  let source = "static";

  if (user) {
    try {
      token = await getIdToken(user);
      source = "firebase";
    } catch (e) {
      console.warn("[apiHeaders] Failed to get Firebase ID token:", e);
    }
  }

  // Fallback to Supabase if Firebase fails or is absent
  if (!token || token === STATIC_TOKEN) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
      source = "supabase";
    }
  }

  if (!token) {
    console.error("[apiHeaders] No token found (Firebase/Supabase/Static all empty)");
  } else {
    console.log(`[apiHeaders] Using ${source} token`);
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type CustomerNotification = {
  id: string;
  source: string;
  type:
    | "additional_issue_quote"
    | "estimate_reply"
    | "booking_completed"
    | string;
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
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  workshopName: string;
  ownerUid: string | null;
  // review / call status
  notificationReviewed: boolean;
  calledCustomer: boolean;
  calledCustomerByName: string | null;
  calledCustomerByDisplayName: string | null;
  notificationReviewedByName: string | null;
  notificationReviewedByDisplayName: string | null;
};

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchCustomerNotifications(retryCount = 0): Promise<
  CustomerNotification[]
> {
  try {
    const res = await fetch(`${BASE_URL}/customer-notifications?all=1`, {
      headers: await apiHeaders(),
    });

    if (res.status === 401 && retryCount < 2) {
      console.warn(`[fetchCustomerNotifications] 401 Unauthorized. Retrying (${retryCount + 1})...`);
      // Wait 1s before retrying to allow auth state to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchCustomerNotifications(retryCount + 1);
    }

    if (!res.ok) {
      throw new Error(`fetchCustomerNotifications failed: ${res.status}`);
    }

    const json = await res.json();
    const raw: unknown[] = Array.isArray(json)
      ? json
      : (json.notifications ?? []);
    console.log("[fetchCustomerNotifications] fetched", raw.length, "items");

    return raw.map((item) => {
      const d = item as Record<string, unknown>;
      return {
        id: String(d.id ?? ""),
        source: String(d.source ?? ""),
        type: String(d.type ?? ""),
        title: String(d.title ?? ""),
        message: String(d.message ?? ""),
        read: Boolean(d.read),
        createdAt: String(d.createdAt ?? ""),
        bookingId: d.bookingId ? String(d.bookingId) : null,
        bookingCode: d.bookingCode ? String(d.bookingCode) : null,
        issueId: d.issueId ? String(d.issueId) : null,
        issueTitle: d.issueTitle ? String(d.issueTitle) : null,
        price: d.price != null ? Number(d.price) : null,
        estimateId: d.estimateId ? String(d.estimateId) : null,
        customerId: String(d.customerId ?? ""),
        customerName: d.customerName ? String(d.customerName) : null,
        customerEmail: d.customerEmail ? String(d.customerEmail) : null,
        customerPhone: d.customerPhone ? String(d.customerPhone) : null,
        workshopName: String(d.workshopName ?? ""),
        ownerUid: d.ownerUid ? String(d.ownerUid) : null,
        notificationReviewed: Boolean(d.notificationReviewed),
        calledCustomer: Boolean(d.calledCustomer),
        calledCustomerByName: d.calledCustomerByName
          ? String(d.calledCustomerByName)
          : null,
        calledCustomerByDisplayName: d.calledCustomerByDisplayName
          ? String(d.calledCustomerByDisplayName)
          : null,
        notificationReviewedByName: d.notificationReviewedByName
          ? String(d.notificationReviewedByName)
          : null,
        notificationReviewedByDisplayName: d.notificationReviewedByDisplayName
          ? String(d.notificationReviewedByDisplayName)
          : null,
      } as CustomerNotification;
    });
  } catch (error) {
    if (retryCount < 2) {
      console.warn(`[fetchCustomerNotifications] Error occurred. Retrying (${retryCount + 1})...`, error);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchCustomerNotifications(retryCount + 1);
    }
    throw error;
  }
}

// ─── Mark reviewed ────────────────────────────────────────────────────────────

export async function markNotificationReviewed(
  notificationId: string,
): Promise<void> {
  console.log("[markNotificationReviewed] calling →", notificationId);
  const res = await fetch(
    `${BASE_URL}/customer-notifications/${notificationId}/notification-reviewed`,
    {
      method: "POST",
      headers: await apiHeaders(),
    },
  );
  console.log(
    "[markNotificationReviewed] response ←",
    res.status,
    res.ok ? "OK" : "FAILED",
  );
}

export async function markNotificationReviewedClosed(
  notificationId: string,
): Promise<void> {
  console.log("[markNotificationReviewedClosed] calling →", notificationId);
  const res = await fetch(
    `${BASE_URL}/customer-notifications/${notificationId}/notification-reviewed`,
    {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({ notificationReviewed: false }),
    },
  );
  console.log(
    "[markNotificationReviewedClosed] response ←",
    res.status,
    res.ok ? "OK" : "FAILED",
  );
}

// ─── Mark called ─────────────────────────────────────────────────────────────

export async function markCalledCustomer(
  notificationId: string,
): Promise<void> {
  await fetch(
    `${BASE_URL}/customer-notifications/${notificationId}/called-customer`,
    { method: "POST", headers: await apiHeaders() },
  );
}
