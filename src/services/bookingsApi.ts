import { supabase } from '@/integrations/supabase/client';

/** Load BMS workshop owner UID for a Supabase tenant (when set in `tenants.bms_owner_uid`). */
export async function resolveBmsOwnerUidForTenant(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const { data, error } = await supabase
    .from('tenants')
    .select('bms_owner_uid')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data?.bms_owner_uid) return null;
  const v = String(data.bms_owner_uid).trim();
  return v || null;
}

/** Default BMS branch id for a tenant (`tenants.bms_default_branch_id`). */
export async function resolveBmsDefaultBranchForTenant(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const { data, error } = await supabase
    .from('tenants')
    .select('bms_default_branch_id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data?.bms_default_branch_id) return null;
  const v = String(data.bms_default_branch_id).trim();
  return v || null;
}

/**
 * Resolve the BMS workshop owner UID for the active dashboard user.
 *
 * Priority:
 *   1. `agents.bms_owner_uid` for the currently signed-in Supabase user
 *      (this is the workshop the agent was onboarded into).
 *   2. `tenants.bms_owner_uid` for `sessionTenantId` (super-admin / non-agent paths).
 *
 * No env fallback — configure each tenant/agent row in Supabase.
 */
export async function resolveOwnerUid(sessionTenantId?: string | null): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('bms_owner_uid')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const fromAgent = String(agentRow?.bms_owner_uid ?? '').trim();
      if (fromAgent) return fromAgent;
    }
  } catch {
    // ignore — fall through to tenants lookup
  }

  const fromDb = await resolveBmsOwnerUidForTenant(sessionTenantId);
  return fromDb ?? '';
}

export async function resolveDefaultBranchId(sessionTenantId?: string | null): Promise<string | undefined> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('bms_branch_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const fromAgent = String(agentRow?.bms_branch_id ?? '').trim();
      if (fromAgent) return fromAgent;
    }
  } catch {
    // ignore — fall through to tenants lookup
  }

  const fromDb = await resolveBmsDefaultBranchForTenant(sessionTenantId);
  return fromDb ?? undefined;
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
  staffId?: string | null;
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
  additionalIssues?: Record<string, unknown>[];
  additionalIssueCount?: number;
  pendingApprovalCount?: number;
  createdAt?: { _seconds: number; _nanoseconds: number };
};

export type AvailabilityResponse = {
  available: boolean;
  availableSlots: string[];
};

/** Normalize a time label to `HH:mm` for compares, selects, and availability checks. */
export function trimBmsTimeLabel(t: string | undefined): string {
  if (!t?.trim()) return '';
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s.slice(0, 8);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function minutesFromBmsTimeLabel(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/** Dedupe + sort GET /bookings/availability slot strings to `HH:mm`. */
export function normalizeBookingAvailabilitySlots(slots: string[]): string[] {
  return [...new Set(slots.map((t) => trimBmsTimeLabel(t)).filter(Boolean))].sort(
    (a, b) => (minutesFromBmsTimeLabel(a) ?? 0) - (minutesFromBmsTimeLabel(b) ?? 0),
  );
}

export type StaffStatus = 'Active' | 'Suspended';
export type StaffRole = 'staff' | 'branch_admin';

export type WorkshopStaff = {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: StaffRole | string;
  staffRole: string | null;
  branchId: string | null;
  branchName: string | null;
  status: StaffStatus | string;
  avatar: string | null;
  timezone: string | null;
  weeklySchedule: Record<string, { branchId: string; branchName: string } | null> | null;
  training: Record<string, boolean> | null;
  createdAt: { _seconds: number; _nanoseconds: number } | null;
  updatedAt: { _seconds: number; _nanoseconds: number } | null;
};

import { getBmsBearerToken } from '@/services/bmsAuth';
import { getServiceById } from '@/services/servicesApi';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env.VITE_BMS_API_URL as string) ??
  'https://black.bmspros.com.au/api/call-center';

// ─── Headers Helper ──────────────────────────────────────────────────────────

async function apiHeaders(ownerUid: string): Promise<HeadersInit> {
  const token = await getBmsBearerToken({ waitForFirebaseInit: true });
  console.log('[bookingsApi] X-Tenant-Id:', ownerUid);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': ownerUid,
  };
}

// ─── 1. GET Availability ─────────────────────────────────────────────────────

/** Branch capacity / open slots for a date and service mix (new booking + reschedule must respect this). */
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

  return (await res.json()) as AvailabilityResponse;
}

// ─── 2. GET All Bookings ──────────────────────────────────────────────────────

/** Map GET /bookings list payload to `Booking` (fills `ownerUid` / `client` when omitted). */
function normalizeBookingListItem(
  raw: Record<string, unknown>,
  fallbackOwnerUid: string,
): Booking {
  const r = raw as Record<string, any>;
  const services = (Array.isArray(r.services) ? r.services : []) as Booking['services'];
  const additionalIssues = r.additionalIssues;
  return {
    id: String(r.id ?? ''),
    ownerUid: String(r.ownerUid ?? fallbackOwnerUid),
    bookingCode: r.bookingCode,
    status: r.status,
    branchId: String(r.branchId ?? ''),
    branchName: r.branchName,
    date: String(r.date ?? ''),
    time: String(r.time ?? ''),
    pickupTime: r.pickupTime,
    services,
    client: String(r.client ?? r.clientName ?? ''),
    clientName: r.clientName ?? r.client,
    clientEmail: String(r.clientEmail ?? ''),
    clientPhone: String(r.clientPhone ?? ''),
    customerId: r.customerId,
    vehicleNumber: r.vehicleNumber,
    vehicleMake: r.vehicleMake,
    notes: r.notes,
    source: r.source,
    totalPrice: typeof r.totalPrice === 'number' ? r.totalPrice : undefined,
    progress: r.progress,
    additionalIssues: Array.isArray(additionalIssues)
      ? (additionalIssues as Record<string, unknown>[])
      : undefined,
    additionalIssueCount: r.additionalIssueCount,
    pendingApprovalCount: r.pendingApprovalCount,
    createdAt: r.createdAt,
  };
}

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
  const rawList = Array.isArray(json.bookings) ? json.bookings : [];
  let bookings: Booking[] = rawList.map((row: Record<string, unknown>) =>
    normalizeBookingListItem(row, ownerUid),
  );
  
  if (branchId) {
    bookings = bookings.filter((b: any) => {
      const bBranchId = b.branchId || b.branch_id || b.branchId;
      return bBranchId === branchId;
    });
  }
  
  return bookings;
}

// ─── 2b. GET Workshop Staff ──────────────────────────────────────────────────

export async function getWorkshopStaff(
  ownerUid: string,
  options?: {
    branchId?: string;
    role?: StaffRole;
    status?: StaffStatus;
  },
): Promise<WorkshopStaff[]> {
  const url = new URL(`${BASE_URL}/staff`);
  if (options?.branchId) url.searchParams.set('branchId', options.branchId);
  if (options?.role) url.searchParams.set('role', options.role);
  if (options?.status) url.searchParams.set('status', options.status);

  // console.log('[getWorkshopStaff] GET /staff — all workshop staff (filtered by query)', {
  //   url: url.toString(),
  //   options,
  // });

  const res = await fetch(url.toString(), {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    console.warn('[getWorkshopStaff] request failed', { status: res.status, url: url.toString() });
    throw new Error(`getWorkshopStaff failed: ${res.status}`);
  }

  const json = await res.json();
  const staff = (json.staff ?? []) as WorkshopStaff[];
  // console.log(
  //   '[getWorkshopStaff] Workshop staff list (not service-specific). Count:',
  //   staff.length,
  //   staff.map((s) => ({ id: s.id, uid: s.uid, name: s.name })),
  // );
  return staff;
}

export type ServiceStaffAvailabilityResponse = {
  service?: {
    id?: string;
    name?: string;
    hasStaffAllowList?: boolean;
    staffIds?: string[];
  };
  filter?: {
    branchId?: string | null;
    branchName?: string | null;
    date?: string;
    dayName?: string;
  };
  staff?: WorkshopStaff[];
  total?: number;
};

function workshopStaffFromLite(raw: {
  id?: string;
  uid?: string;
  name?: string;
}): WorkshopStaff {
  const id = String(raw.id ?? raw.uid ?? '');
  const uid = String(raw.uid ?? raw.id ?? id);
  const name = String(raw.name ?? '').trim() || id;
  return {
    id,
    uid,
    name,
    email: null,
    mobile: null,
    role: 'staff',
    staffRole: null,
    branchId: null,
    branchName: null,
    status: 'Active',
    avatar: null,
    timezone: null,
    weeklySchedule: null,
    training: null,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * When GET /services/:id/staff returns `staff: []` but `service.staffIds` is set,
 * resolve display names from GET /services/:id (`staff[]` on the service record).
 */
async function resolveStaffFromAllowListAndServiceDetail(
  ownerUid: string,
  serviceId: string,
  allowedIds: string[],
): Promise<WorkshopStaff[]> {
  const ids = [...new Set(allowedIds.map(String).filter(Boolean))];
  if (ids.length === 0) return [];

  let detail: Awaited<ReturnType<typeof getServiceById>> = null;
  try {
    detail = await getServiceById(ownerUid, serviceId);
  } catch {
    detail = null;
  }

  const rosterRaw = (detail as unknown as { staff?: unknown } | null)?.staff;
  const roster = Array.isArray(rosterRaw)
    ? (rosterRaw as { id?: string; uid?: string; name?: string }[])
    : [];

  const idSet = new Set(ids);
  const byId = new Map<string, WorkshopStaff>();
  for (const row of roster) {
    const id = String(row.id ?? row.uid ?? '');
    if (!id || !idSet.has(id)) continue;
    byId.set(id, workshopStaffFromLite(row));
  }

  const ordered: WorkshopStaff[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) ordered.push(found);
    else {
      ordered.push(
        workshopStaffFromLite({
          id,
          uid: id,
          name: `Staff (${id.length > 8 ? id.slice(-6) : id})`,
        }),
      );
    }
  }
  return ordered;
}

export async function getStaffForService(
  ownerUid: string,
  serviceId: string,
  options: {
    branchId: string;
    date: string;
  },
): Promise<WorkshopStaff[]> {
  const url = new URL(
    `${BASE_URL}/services/${encodeURIComponent(serviceId)}/staff`,
  );
  url.searchParams.set('branchId', options.branchId);
  url.searchParams.set('date', options.date);

  const res = await fetch(url.toString(), {
    headers: await apiHeaders(ownerUid),
  });

  if (!res.ok) {
    throw new Error(`getStaffForService failed: ${res.status}`);
  }

  const json = (await res.json()) as ServiceStaffAvailabilityResponse;
  // console.log('[getStaffForService] GET /services/:id/staff — raw envelope', {
  //   serviceId,
  //   branchId: options.branchId,
  //   date: options.date,
  //   url: url.toString(),
  //   serviceName: json.service?.name,
  //   hasStaffAllowList: json.service?.hasStaffAllowList,
  //   staffIds: json.service?.staffIds,
  //   staffArrayLength: (json.staff ?? []).length,
  //   total: json.total,
  // });

  const fromEndpoint = (json.staff ?? []) as WorkshopStaff[];
  if (fromEndpoint.length > 0) {
    // console.log(
    //   '[getStaffForService] Relevant staff who can do this service (from response staff[]).',
    //   {
    //     serviceId,
    //     count: fromEndpoint.length,
    //     staff: fromEndpoint.map((s) => ({ id: s.id, name: s.name })),
    //   },
    // );
    return fromEndpoint;
  }

  const allowList = json.service?.staffIds ?? [];
  if (allowList.length === 0) {
    // console.log(
    //   '[getStaffForService] No staff in response and no staffIds — empty relevant list.',
    //   { serviceId },
    // );
    return [];
  }

  const resolved = await resolveStaffFromAllowListAndServiceDetail(
    ownerUid,
    serviceId,
    allowList,
  );
  // console.log(
  //   '[getStaffForService] Relevant staff who can do this service (resolved from staffIds + GET /services/:id).',
  //   {
  //     serviceId,
  //     count: resolved.length,
  //     staff: resolved.map((s) => ({ id: s.id, name: s.name })),
  //   },
  // );
  return resolved;
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
  /** BMS catalog key, e.g. `small_car`, when booking is priced by vehicle category. */
  vehicleType?: string;
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

/** BMS booking workflow values (see CALL_CENTER_API.md). */
export type BmsBookingWorkflowStatus = 'Confirmed' | 'Canceled';

/**
 * PATCH /bookings/{bookingId} — update workflow status (e.g. confirm or cancel request).
 * Body uses BMS capitalization: `Confirmed`, `Canceled`.
 */
export async function patchBookingWorkflowStatus(
  ownerUid: string,
  bookingId: string,
  status: BmsBookingWorkflowStatus,
): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: 'PATCH',
      headers: await apiHeaders(ownerUid),
      body: JSON.stringify({ status }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `patchBookingWorkflowStatus failed: ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    );
  }

  return await res.json().catch(() => ({}));
}

export type BookingConfirmStaffAssignment = {
  staffId: string;
  staffName: string;
};

/** Keys are booking line service ids (`BookingServiceDetail.id`). */
export type BookingConfirmStaffAssignments = Record<
  string,
  BookingConfirmStaffAssignment
>;

/**
 * POST /bookings/{bookingId}/confirm — confirm pending booking with per-line staff.
 * Body: `{ staffAssignments: { [serviceId]: { staffId, staffName } } }`
 */
export async function confirmBookingWithStaff(
  ownerUid: string,
  bookingId: string,
  staffAssignments: BookingConfirmStaffAssignments,
): Promise<unknown> {
  const res = await fetch(
    `${BASE_URL}/bookings/${encodeURIComponent(bookingId)}/confirm`,
    {
      method: 'POST',
      headers: await apiHeaders(ownerUid),
      body: JSON.stringify({ staffAssignments }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `confirmBookingWithStaff failed: ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    );
  }

  return await res.json().catch(() => ({}));
}

/** PATCH /bookings/{id}/reschedule — new slot, optional reason, optional staff changes. */
export type BookingReschedulePayload = {
  newDate: string;
  newTime: string;
  newPickupTime?: string;
  reason?: string;
  staffAssignments?: BookingConfirmStaffAssignments;
  newStaffId?: string;
  newStaffName?: string;
};

export async function patchBookingReschedule(
  ownerUid: string,
  bookingId: string,
  payload: BookingReschedulePayload,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    newDate: payload.newDate,
    newTime: payload.newTime,
  };
  if (payload.newPickupTime?.trim()) {
    body.newPickupTime = payload.newPickupTime.trim();
  }
  if (payload.reason?.trim()) {
    body.reason = payload.reason.trim();
  }
  if (
    payload.staffAssignments &&
    Object.keys(payload.staffAssignments).length > 0
  ) {
    body.staffAssignments = payload.staffAssignments;
  }
  if (payload.newStaffId?.trim()) {
    body.newStaffId = payload.newStaffId.trim();
    if (payload.newStaffName?.trim()) {
      body.newStaffName = payload.newStaffName.trim();
    }
  }

  const res = await fetch(
    `${BASE_URL}/bookings/${encodeURIComponent(bookingId)}/reschedule`,
    {
      method: 'PATCH',
      headers: await apiHeaders(ownerUid),
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `patchBookingReschedule failed: ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    );
  }

  return await res.json().catch(() => ({}));
}

/**
 * POST /bookings/{id}/cancel
 * Optional body: { reason?: string }
 */
export async function cancelBooking(
  ownerUid: string,
  bookingId: string,
  reason?: string,
): Promise<unknown> {
  const payload = reason?.trim() ? { reason: reason.trim() } : {};
  const res = await fetch(
    `${BASE_URL}/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: 'POST',
      headers: await apiHeaders(ownerUid),
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `cancelBooking failed: ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
    );
  }

  return await res.json().catch(() => ({}));
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
    // No auto-login here anymore to preserve agent identity
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
    // No auto-login here anymore to preserve agent identity
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
