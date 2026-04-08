import { auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';

/** Resolves the workshop ownerUid from .env */
export async function resolveOwnerUid(): Promise<string> {
  return (import.meta.env.VITE_BMS_OWNER_UID as string) ?? '';
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BookingServiceItem = {
  serviceId: string;
  serviceName: string;
  price: number;
  duration: number;
};

export type BookingService = {
  id?: string;
  name: string;
  price: number;
  staffName: string | null;
  completionStatus: string;
};

export type Booking = {
  id: string;
  ownerUid: string;
  bookingCode?: string;
  status?: string;
  branchId: string;
  branchName?: string;
  date: string;
  time: string;
  pickupTime?: string;
  services: BookingServiceItem[] | BookingService[];
  client: string;
  clientName?: string;
  clientEmail: string;
  clientPhone: string;
  customerId?: string;
  vehicleNumber?: string;
  vehicleMake?: string;
  notes?: string;
  source?: string;
  totalPrice?: number;
  progress?: { completed: number; total: number; percentage: number };
  additionalIssueCount?: number;
  pendingApprovalCount?: number;
  createdAt?: { _seconds: number; _nanoseconds: number };
};

export type AvailabilityResponse = {
  available: boolean;
  availableSlots: string[];
};

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  'https://black.bmspros.com.au/api/call-center';

const STATIC_TOKEN =
  (import.meta.env.VITE_BMS_BEARER_TOKEN as string) ?? '';

// ─── Headers Helper ──────────────────────────────────────────────────────────

async function apiHeaders(ownerUid: string): Promise<HeadersInit> {
  const user = auth.currentUser;
  const token = user ? await getIdToken(user) : STATIC_TOKEN;

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': ownerUid,
  };
}

// ─── 1. GET Availability ─────────────────────────────────────────────────────

export async function getBookingAvailability(
  ownerUid: string,
  branchId: string,
  date: string,
  serviceIds: string[],
): Promise<AvailabilityResponse> {
  const url = `${BASE_URL}/bookings/availability?branchId=${encodeURIComponent(
    branchId,
  )}&date=${encodeURIComponent(date)}&serviceIds=${encodeURIComponent(
    serviceIds.join(','),
  )}`;

  const res = await fetch(url, {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    throw new Error(`getBookingAvailability failed: ${res.status}`);
  }

  return await res.json();
}

// ─── 2. GET All Bookings ──────────────────────────────────────────────────────

export async function getBookings(
  ownerUid: string,
  limit: number = 25,
  branchId?: string,
): Promise<Booking[]> {
  const url = new URL(`${BASE_URL}/bookings`);
  url.searchParams.set('limit', limit.toString());

  const res = await fetch(url.toString(), {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    throw new Error(`getBookings failed: ${res.status}`);
  }

  const json = await res.json();
  let bookings: Booking[] = json.bookings ?? [];
  
  if (branchId) {
    console.warn(`[getBookings] Filtering ${bookings.length} bookings by branchId: "${branchId}"`);
    bookings = bookings.filter((b: any) => {
      const bBranchId = b.branchId || b.branch_id || b.branchId;
      return bBranchId === branchId;
    });
    console.warn(`[getBookings] Results after filter: ${bookings.length}`);
  }
  
  return bookings;
}

// ─── 3. POST Create Booking ──────────────────────────────────────────────────

export type VehicleDetails = {
  make?: string;
  model?: string;
  year?: string;
  registrationNumber?: string;
  mileage?: string;
  bodyType?: string;
  colour?: string;
  vinChassis?: string;
  engineNumber?: string;
  notes?: string;
};

export async function createBooking(data: {
  ownerUid: string;
  branchId: string;
  date: string;
  time: string;
  pickupTime?: string;
  services: BookingServiceItem[];
  client: string;
  clientEmail: string;
  clientPhone: string;
  customerId?: string;
  vehicleDetails?: VehicleDetails;
  notes?: string;
}): Promise<{ bookingId: string }> {
  const res = await fetch(`${BASE_URL}/bookings`, {
    method: 'POST',
    headers: await apiHeaders(data.ownerUid),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`createBooking failed: ${res.status}`);
  }

  return await res.json();
}

// ─── 4. GET Booking Detail ───────────────────────────────────────────────────

export type BookingTask = {
  id: string;
  serviceId: string;
  serviceName: string;
  name: string;
  description: string;
  done: boolean;
  imageUrl: string;
  staffNote: string;
  completedAt: { _seconds: number; _nanoseconds: number } | null;
};

export type BookingServiceDetail = {
  id: string;
  name: string;
  price: number;
  duration: number;
  staffId: string | null;
  staffName: string | null;
  approvalStatus: string;
  completionStatus: string;
  completedAt: { _seconds: number; _nanoseconds: number } | null;
};

export type BookingActivity = {
  id: string;
  type: string;
  message: string;
  performedByName: string;
  performedByRole: string;
  timestamp: { _seconds: number; _nanoseconds: number } | null;
};

export type BookingDetail = {
  booking: {
    id: string;
    bookingCode: string;
    status: string;
    date: string;
    time: string;
    pickupTime?: string;
    duration?: number;
    totalPrice: number;
    ownerUid: string;
    branchId: string;
    branchName: string;
    client: string;
    clientEmail: string;
    clientPhone: string;
    customerId?: string;
    vehicleNumber?: string;
    vehicleBodyType?: string;
    vehicleColour?: string;
    vehicleMileage?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleVinChassis?: string;
    vehicleEngineNumber?: string;
    notes?: string;
    source?: string;
    createdAt: { _seconds: number; _nanoseconds: number };
    updatedAt: { _seconds: number; _nanoseconds: number };
  };
  services: BookingServiceDetail[];
  tasks: BookingTask[];
  additionalIssues: Record<string, unknown>[];
  progress: {
    services: { completed: number; total: number; percentage: number };
    tasks: { completed: number; total: number; percentage: number };
  };
  activities: BookingActivity[];
};

export async function getBookingById(
  ownerUid: string,
  bookingId: string,
): Promise<BookingDetail> {
  const res = await fetch(
    `${BASE_URL}/bookings/${encodeURIComponent(bookingId)}`,
    {
      headers: await apiHeaders(ownerUid),
    },
  );

  if (!res.ok) {
    throw new Error(`getBookingById failed: ${res.status}`);
  }

  return await res.json();
}

// ─── 5. Additional Issues ─────────────────────────────────────────────────────

export async function getAdditionalIssues(
  ownerUid: string,
  bookingId: string,
): Promise<any> {
  const res = await fetch(
    `${BASE_URL}/bookings/${bookingId}/additional-issues`,
    {
      headers: await apiHeaders(ownerUid),
    },
  );

  if (!res.ok) {
    throw new Error(`getAdditionalIssues failed: ${res.status}`);
  }

  return await res.json();
}

export async function updateIssueDecision(
  ownerUid: string,
  bookingId: string,
  issueId: string,
  customerResponse: 'accept' | 'reject',
): Promise<any> {
  const res = await fetch(
    `${BASE_URL}/bookings/${bookingId}/additional-issues/${issueId}`,
    {
      method: 'PATCH',
      headers: await apiHeaders(ownerUid),
      body: JSON.stringify({ customerResponse }),
    },
  );

  if (!res.ok) {
    throw new Error(`updateIssueDecision failed: ${res.status}`);
  }

  return await res.json();
}

// ─── 6. Notifications ────────────────────────────────────────────────────────

export type BookingNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  bookingId: string;
  bookingCode: string;
  bookingDate: string;
  bookingTime: string;
  branchId: string;
  branchName: string;
  clientName: string;
  serviceName: string;
  services: { name: string; staffName: string; status: string }[];
  ownerUid: string;
  targetAdminUid: string;
  read: boolean;
  createdAt: { _seconds: number; _nanoseconds: number } | null;
};

export async function fetchNotifications(ownerUid: string): Promise<BookingNotification[]> {
  const { db, auth: fbAuth } = await import('@/lib/firebase');
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { signInWithEmailAndPassword } = await import('firebase/auth');

  if (!fbAuth.currentUser) {
    const email = import.meta.env.VITE_FIREBASE_AGENT_EMAIL as string;
    const password = import.meta.env.VITE_FIREBASE_AGENT_PASSWORD as string;
    if (email && password) {
      try {
        await signInWithEmailAndPassword(fbAuth, email, password);
      } catch (err) {
        console.error('[fetchNotifications] Firebase auto-login failed:', err);
      }
    }
  }

  const q = query(
    collection(db, 'notifications'),
    where('ownerUid', '==', ownerUid)
  );

  const snap = await getDocs(q);
  const items = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: d.type ?? '',
      title: d.title ?? '',
      message: d.message ?? '',
      bookingId: d.bookingId ?? '',
      bookingCode: d.bookingCode ?? '',
      bookingDate: d.bookingDate ?? '',
      bookingTime: d.bookingTime ?? '',
      branchId: d.branchId ?? '',
      branchName: d.branchName ?? '',
      clientName: d.clientName ?? '',
      serviceName: d.serviceName ?? '',
      services: d.services ?? [],
      ownerUid: d.ownerUid ?? '',
      targetAdminUid: d.targetAdminUid ?? '',
      read: d.read ?? false,
      createdAt: d.createdAt ?? null,
    } as BookingNotification;
  });

  // Client-side sort descending by createdAt
  const getTs = (val: any) => {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    if (val._seconds) return val._seconds * 1000;
    return new Date(val).getTime() || 0;
  };

  items.sort((a, b) => {
    const tA = getTs(a.createdAt);
    const tB = getTs(b.createdAt);
    return tB - tA;
  });

  const finalItems = items.slice(0, 200);

  // DEBUG: Let's log the branches found
  const branchCounts = finalItems.reduce((acc, curr) => {
    const branch = curr.branchName || 'Unknown Branch';
    acc[branch] = (acc[branch] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('[fetchNotifications] Branch breakdown:', branchCounts);

  return finalItems;
}

/**
 * Fetch notifications for multiple ownerUids (all branches) and merge them.
 * Firestore 'in' supports max 30 values per query.
 */
export async function fetchAllBranchNotifications(ownerUids: string[]): Promise<BookingNotification[]> {
  const unique = [...new Set(ownerUids.filter(Boolean))];
  if (unique.length === 0) return [];

  // For a single owner, reuse the existing function
  if (unique.length === 1) return fetchNotifications(unique[0]);

  const { db, auth: fbAuth } = await import('@/lib/firebase');
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { signInWithEmailAndPassword } = await import('firebase/auth');

  if (!fbAuth.currentUser) {
    const email = import.meta.env.VITE_FIREBASE_AGENT_EMAIL as string;
    const password = import.meta.env.VITE_FIREBASE_AGENT_PASSWORD as string;
    if (email && password) {
      try {
        await signInWithEmailAndPassword(fbAuth, email, password);
      } catch (err) {
        console.error('[fetchAllBranchNotifications] Firebase auto-login failed:', err);
      }
    }
  }

  // Firestore 'in' operator supports max 30 values; chunk if needed
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30));
  }

  const allItems: BookingNotification[] = [];

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'notifications'),
      where('ownerUid', 'in', chunk),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      allItems.push({
        id: d.id,
        type: data.type ?? '',
        title: data.title ?? '',
        message: data.message ?? '',
        bookingId: data.bookingId ?? '',
        bookingCode: data.bookingCode ?? '',
        bookingDate: data.bookingDate ?? '',
        bookingTime: data.bookingTime ?? '',
        branchId: data.branchId ?? '',
        branchName: data.branchName ?? '',
        clientName: data.clientName ?? '',
        serviceName: data.serviceName ?? '',
        services: data.services ?? [],
        ownerUid: data.ownerUid ?? '',
        targetAdminUid: data.targetAdminUid ?? '',
        read: data.read ?? false,
        createdAt: data.createdAt ?? null,
      } as BookingNotification);
    }
  }

  const getTs = (val: any) => {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    if (val._seconds) return val._seconds * 1000;
    return new Date(val).getTime() || 0;
  };

  allItems.sort((a, b) => getTs(b.createdAt) - getTs(a.createdAt));

  const finalItems = allItems.slice(0, 200);

  const branchCounts = finalItems.reduce((acc, curr) => {
    const branch = curr.branchName || 'Unknown Branch';
    acc[branch] = (acc[branch] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('[fetchAllBranchNotifications] Branch breakdown:', branchCounts);

  return finalItems;
}

// ─── 7. Call Logs ────────────────────────────────────────────────────────────

export async function createCallLog(data: {
  ownerUid: string;
  branchId: string;
  callerPhone: string;
  direction: 'inbound' | 'outbound';
  purpose: string;
  duration: number;
  notes?: string;
  outcome?: string;
  customerId?: string;
  bookingId?: string;
  callCenterCallId?: string;
}): Promise<{ callLogId: string }> {
  const res = await fetch(`${BASE_URL}/call-logs`, {
    method: 'POST',
    headers: await apiHeaders(data.ownerUid),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`createCallLog failed: ${res.status}`);
  }

  return await res.json();
}

export type CallLog = {
  id: string;
  callerPhone: string;
  direction: string;
  purpose: string;
  duration: number;
  notes?: string;
  outcome?: string;
  createdAt: { _seconds: number; _nanoseconds: number };
};

export async function getCallLogs(
  ownerUid: string,
  limit: number = 10,
): Promise<CallLog[]> {
  const res = await fetch(
    `${BASE_URL}/call-logs?ownerUid=${ownerUid}&limit=${limit}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    throw new Error(`getCallLogs failed: ${res.status}`);
  }

  const json = await res.json();
  return json.callLogs ?? [];
}

// ─── 7. Webhooks ─────────────────────────────────────────────────────────────

export async function getWebhooks(): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE_URL}/webhooks`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`getWebhooks failed: ${res.status}`);
  }

  const json = await res.json();
  return json.webhooks ?? [];
}
