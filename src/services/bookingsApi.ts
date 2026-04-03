import { auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BookingServiceItem = {
  serviceId: string;
  serviceName: string;
  price: number;
  duration: number;
};

export type Booking = {
  id: string;
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
  vehicleNumber?: string;
  notes?: string;
  source?: string;
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
): Promise<Booking[]> {
  const res = await fetch(`${BASE_URL}/bookings?limit=${limit}`, {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    throw new Error(`getBookings failed: ${res.status}`);
  }

  const json = await res.json();
  return json.bookings ?? [];
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

export async function getBookingById(
  ownerUid: string,
  bookingId: string,
): Promise<any> {
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

// ─── 6. Call Logs ────────────────────────────────────────────────────────────

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

export async function getCallLogs(
  ownerUid: string,
  limit: number = 10,
): Promise<any[]> {
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

export async function getWebhooks(): Promise<any[]> {
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