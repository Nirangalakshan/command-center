import { supabase } from '@/integrations/supabase/client';
import type {
  Tenant, Queue, Agent, Call, SipLine, DashboardSummary,
  TenantOnboarding, NewClientForm, StageTransitionResult,
  AgentGroup, DIDMapping, IncomingCall,
  CallResult, TranscriptStatus, SipLineStatus, RingStrategy,
  CallerContext, CustomerRecord, VehicleRecord, ServiceRecord,
  BookingRecord, BookingStatus,
} from './types';
import {
  ONBOARDING_STAGES,
  validateStageTransition,
  getNextStage,
  getGoLiveBlockers,
  getGoLiveWarnings,
} from '@/utils/onboardingValidation';
import { getBookings } from './bookingsApi';
import { logSystemActivity } from './auditLogApi';
import type { UserSession } from './types';

export { ONBOARDING_STAGES };

/* ─── Tenants ─── */

export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    industry: t.industry,
    status: t.status as 'active' | 'inactive',
    brandColor: t.brand_color,
    didNumbers: t.did_numbers || [],
  }));
}

/* ─── Summary (computed from live data) ─── */

export async function fetchSummary(tenantId?: string | null): Promise<DashboardSummary> {
  // Fetch agents and calls for computation
  const [agents, queues, calls] = await Promise.all([
    fetchAgents(tenantId),
    fetchQueues(tenantId),
    fetchCalls(tenantId),
  ]);

  const onCall = agents.filter((a) => a.status === 'on-call').length;
  const online = agents.filter((a) => a.status !== 'offline').length;
  const available = agents.filter((a) => a.status === 'available').length;
  const queued = queues.reduce((s, q) => s + q.waitingCalls, 0);
  const answered = calls.filter((c) => c.result === 'answered').length;
  const total = calls.length;
  const avgHandle = answered > 0
    ? Math.round(calls.filter((c) => c.result === 'answered').reduce((s, c) => s + c.durationSeconds, 0) / answered)
    : 0;
  const sla = queues.length > 0
    ? Math.round(queues.reduce((s, q) => s + q.slaPercent, 0) / queues.length)
    : 0;

  return {
    activeCalls: onCall,
    queuedCalls: queued,
    availableAgents: available,
    onlineAgents: online,
    totalCallsToday: total,
    answerRate: total > 0 ? Math.round((answered / total) * 1000) / 10 : 0,
    abandonRate: total > 0 ? Math.round((calls.filter((c) => c.result === 'abandoned').length / total) * 1000) / 10 : 0,
    avgHandleTime: avgHandle,
    slaPercent: sla,
  };
}

/* ─── Queues ─── */

export async function fetchQueues(tenantId?: string | null): Promise<Queue[]> {
  let query = supabase.from('queues').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((q) => ({
    id: q.id,
    tenantId: q.tenant_id,
    name: q.name,
    type: q.type,
    color: q.color,
    icon: q.icon,
    activeCalls: q.active_calls,
    waitingCalls: q.waiting_calls,
    availableAgents: q.available_agents,
    totalAgents: q.total_agents,
    avgWaitSeconds: q.avg_wait_seconds,
    slaPercent: q.sla_percent,
  }));
}

/* ─── Agents ─── */

export async function fetchAgents(tenantId?: string | null): Promise<Agent[]> {
  let query = supabase.from('agents').select('*, tenants(name)');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('name');
  if (error) {
    // Fallback without join if inner fails
    let q2 = supabase.from('agents').select('*');
    if (tenantId) q2 = q2.eq('tenant_id', tenantId);
    const { data: d2, error: e2 } = await q2.order('name');
    if (e2) throw new Error(e2.message);
    return (d2 || []).map(mapAgent);
  }
  return (data || []).map(mapAgent);
}

function mapAgent(a: Record<string, unknown> & { tenants?: { name?: string } }): Agent {
  return {
    id: a.id as string,
    tenantId: (a.tenant_id as string) || '',
    queueIds: (a.queue_ids as string[]) || [],
    name: a.name as string,
    extension: (a.extension as string) || '',
    email: (a.email as string) || undefined,
    phone: (a.phone_number as string) || (a.phone as string) || undefined,
    notes: (a.notes as string) || undefined,
    role: ((a.role as Agent['role']) || 'agent'),
    status: ((a.status as Agent['status']) || 'offline'),
    currentCaller: (a.current_caller as string | null) ?? null,
    callStartTime: a.call_start_time ? Number(a.call_start_time) : null,
    allowedQueueIds: (a.allowed_queue_ids as string[]) || [],
    assignedTenantIds: (a.assigned_tenant_ids as string[]) || [],
    groupIds: (a.group_ids as string[]) || [],
    tenantName: a.tenants?.name,
  };
}

/** Fields super-admins may change from the Agents tab (maps to `public.agents` columns). */
export type DashboardAgentUpdate = {
  name?: string;
  extension?: string;
  email?: string;
  phone?: string;
  tenantId?: string | null;
  queueIds?: string[];
  role?: Agent['role'];
};

export async function updateDashboardAgent(agentId: string, patch: DashboardAgentUpdate): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.extension !== undefined) row.extension = patch.extension;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone_number = patch.phone;
  if (patch.tenantId !== undefined) row.tenant_id = patch.tenantId;
  if (patch.queueIds !== undefined) row.queue_ids = patch.queueIds;
  if (patch.role !== undefined) row.role = patch.role;

  const { error } = await supabase.from('agents').update(row).eq('id', agentId);
  if (error) throw new Error(error.message);
}

export async function deleteDashboardAgent(agentId: string): Promise<void> {
  const { error } = await supabase.from('agents').delete().eq('id', agentId);
  if (error) throw new Error(error.message);
}

/* ─── Calls ─── */

export async function fetchCalls(tenantId?: string | null): Promise<Call[]> {
  let query = supabase.from('calls').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('start_time', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data || []).map((c) => ({
    id: c.id,
    tenantId: c.tenant_id,
    queueId: c.queue_id,
    agentId: c.agent_id,
    callerNumber: c.caller_number,
    callerName: c.caller_name,
    startTime: c.start_time,
    answerTime: c.answer_time,
    endTime: c.end_time,
    durationSeconds: c.duration_seconds,
    result: c.result as CallResult,
    recordingUrl: c.recording_url,
    transcriptStatus: c.transcript_status as TranscriptStatus,
    summaryStatus: c.summary_status as 'pending' | 'ready' | 'none',
    agentName: '—', // Will be joined later or resolved client-side
    queueName: '—',
    tenantName: '—',
  }));
}

/* ─── SIP Lines ─── */

export async function fetchSipLines(tenantId?: string | null): Promise<SipLine[]> {
  let query = supabase.from('sip_lines').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('label');
  if (error) throw new Error(error.message);
  return (data || []).map((l) => ({
    id: l.id,
    tenantId: l.tenant_id,
    label: l.label,
    trunkName: l.trunk_name,
    status: l.status as SipLineStatus,
    activeCaller: l.active_caller,
    activeSince: l.active_since ? Number(l.active_since) : null,
  }));
}

/* ─── Agent Groups ─── */

export async function fetchAgentGroups(tenantId?: string | null): Promise<AgentGroup[]> {
  let query = supabase.from('agent_groups').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((g) => ({
    id: g.id,
    name: g.name,
    tenantId: g.tenant_id,
    queueId: g.queue_id,
    agentIds: g.agent_ids || [],
    ringStrategy: g.ring_strategy as RingStrategy,
  }));
}

/* ─── DID Mappings ─── */

export async function fetchDIDMappings(): Promise<DIDMapping[]> {
  const { data, error } = await dynamicSupabase.from('did_mappings').select('*');
  if (error) throw new Error(error.message);
  return (data || []).map((d: Record<string, unknown>) => ({
    did: String(d.did ?? ''),
    tenantId: String(d.tenant_id ?? ''),
    queueId: String(d.queue_id ?? ''),
    label: String(d.label ?? ''),
    branchId: String(d.branch_id ?? ''),
    branchName: String(d.branch_name ?? ''),
    mappingWorkshopName: String(d.workshop_name ?? ''),
    ownerId: String(d.owner_id ?? ''),
  }));
}

/* ─── Caller Context ─── */

type UntypedSupabase = {
  from: (table: string) => {
    select: (...args: unknown[]) => any;
    insert: (...args: unknown[]) => any;
    update: (...args: unknown[]) => any;
    delete: (...args: unknown[]) => any;
  };
};

const dynamicSupabase = supabase as unknown as UntypedSupabase;

export function normalizePhoneNumber(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/**
 * Builds every plausible format of a phone number so the DB lookup
 * succeeds regardless of how the number was originally stored.
 *
 * Covers: +94…, 94…, 0…, raw local (no prefix), and the original input.
 */
export function buildPhoneLookupVariants(phone: string | null | undefined): string[] {
  const raw = String(phone ?? '').trim();
  if (!raw) return [];

  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];

  const variants = new Set<string>();

  variants.add(digits);
  variants.add(raw);
  if (raw.startsWith('+')) variants.add(raw.slice(1));

  // Sri Lanka: 94 + 9-digit local  →  also try 0 + local and bare local
  if (digits.startsWith('94') && digits.length === 11) {
    const local = digits.slice(2);           // 766524216
    variants.add(`0${local}`);               // 0766524216
    variants.add(local);                     // 766524216
    variants.add(`+94${local}`);             // +94766524216
  }

  // Local with leading zero  →  also try with country code
  if (digits.startsWith('0') && digits.length === 10) {
    const local = digits.slice(1);           // 766524216
    variants.add(`94${local}`);              // 94766524216
    variants.add(`+94${local}`);             // +94766524216
    variants.add(local);                     // 766524216
  }

  // Bare local (9 digits, no prefix) — common when Yeastar strips the trunk prefix
  if (!digits.startsWith('0') && !digits.startsWith('94') && digits.length === 9) {
    variants.add(`0${digits}`);              // 0766524216
    variants.add(`94${digits}`);             // 94766524216
    variants.add(`+94${digits}`);            // +94766524216
  }

  return Array.from(variants);
}

export async function fetchCallerContext(
  tenantId: string,
  callerNumber: string,
): Promise<CallerContext | null> {
  const variants = buildPhoneLookupVariants(callerNumber);
  if (!tenantId || variants.length === 0) return null;

  const phoneFilter = variants
    .flatMap((variant) => [`phone_normalized.eq.${variant}`, `primary_phone.eq.${variant}`])
    .join(',');

  const { data: customer, error: customerError } = await dynamicSupabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(phoneFilter)
    .maybeSingle();

  if (customerError) throw new Error(customerError.message);
  if (!customer) return null;

  const { data: vehicles, error: vehicleError } = await dynamicSupabase
    .from('vehicles')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customer.id)
    .order('created_at');

  if (vehicleError) throw new Error(vehicleError.message);

  const vehicleRows = (vehicles || []) as Record<string, unknown>[];
  const vehicleIds = vehicleRows.map((vehicle) => String(vehicle.id));

  let serviceRows: Record<string, unknown>[] = [];
  if (vehicleIds.length > 0) {
    const { data: services, error: serviceError } = await dynamicSupabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id)
      .in('vehicle_id', vehicleIds)
      .order('service_date', { ascending: false });

    if (serviceError) throw new Error(serviceError.message);
    serviceRows = (services || []) as Record<string, unknown>[];
  }

  return {
    customer: mapCustomerRecord(customer as Record<string, unknown>),
    vehicles: vehicleRows.map(mapVehicleRecord),
    services: serviceRows.map(mapServiceRecord),
  };
}


/* ─── Incoming Calls — Yeastar Real-Time Integration ─── */

/**
 * Kept for backwards compat — returns empty array.
 * Use subscribeToIncomingCalls() for live data.
 */
export async function fetchIncomingCalls(_allowedQueueIds?: string[]): Promise<IncomingCall[]> {
  return [];
}

/**
 * Subscribe to live incoming call events broadcast by the
 * yeastar-webhook Supabase Edge Function.
 *
 * The Yeastar PBX fires an IncomingCall event when a call rings.
 * The edge function translates it and broadcasts it here via
 * Supabase Realtime so the dashboard shows it instantly.
 *
 * @returns cleanup function — call it in useEffect cleanup
 */
export function subscribeToIncomingCalls(
  allowedQueueIds: string[],
  onCall: (call: IncomingCall) => void,
  onHangup?: (callId: string) => void,
): () => void {
  const channel = supabase
    .channel('yeastar-incoming-calls')
    .on('broadcast', { event: 'IncomingCall' }, ({ payload }) => {
      // If supervisor/agent, filter to their queues
      if (allowedQueueIds.length === 0 || allowedQueueIds.includes(payload.queueId)) {
        onCall(payload as IncomingCall);
      }
    })
    .on('broadcast', { event: 'CallHangup' }, ({ payload }) => {
      onHangup?.(payload.id as string);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/**
 * Subscribe to agent table changes (Postgres CDC).
 * Triggers whenever the yeastar-webhook updates agent status.
 */
export function subscribeToAgents(
  tenantId: string | null,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel('yeastar-agents-cdc')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agents',
        ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
      },
      () => onChange(),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/**
 * Subscribe to calls table changes (Postgres CDC).
 * Triggers whenever the yeastar-webhook inserts a new CDR.
 */
export function subscribeToCalls(
  tenantId: string | null,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel('yeastar-calls-cdc')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
      },
      () => onChange(),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/* ─── Client Onboarding ─── */

export async function fetchClients(tenantId?: string | null): Promise<TenantOnboarding[]> {
  let query = supabase.from('tenant_onboarding').select('*, tenants(*)');
  if (tenantId) query = query.eq('id', tenantId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(mapOnboarding);
}

function mapOnboarding(row: any): TenantOnboarding {
  const t = row.tenants || {};
  return {
    id: row.id,
    name: t.name || '',
    industry: t.industry || '',
    status: t.status || 'active',
    brandColor: t.brand_color || '#00d4f5',
    didNumbers: t.did_numbers || [],
    onboardingStage: row.onboarding_stage,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    createdBy: row.created_by,
    createdAt: row.created_at,
    notes: row.notes,
    clientDetails: row.client_details || {},
    businessRules: row.business_rules || {},
    queueSetup: row.queue_setup || { queues: [] },
    scriptKnowledgeBase: row.script_knowledge_base || {},
    bookingRules: row.booking_rules || {},
    testingGoLive: row.testing_go_live || {},
    activityLog: row.activity_log || [],
  };
}

function mapCustomerRecord(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ''),
    primaryPhone: String(row.primary_phone ?? ''),
    phoneNormalized: String(row.phone_normalized ?? ''),
    email: row.email ? String(row.email) : null,
    address: row.address ? String(row.address) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

function mapVehicleRecord(row: Record<string, unknown>): VehicleRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerId: String(row.customer_id),
    rego: String(row.rego ?? ''),
    make: String(row.make ?? ''),
    model: String(row.model ?? ''),
    year: typeof row.year === 'number' ? row.year : row.year ? Number(row.year) : null,
    color: row.color ? String(row.color) : null,
    vin: row.vin ? String(row.vin) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

function mapServiceRecord(row: Record<string, unknown>): ServiceRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerId: String(row.customer_id),
    vehicleId: String(row.vehicle_id),
    serviceDate: String(row.service_date ?? ''),
    serviceType: String(row.service_type ?? ''),
    odometerKm: typeof row.odometer_km === 'number'
      ? row.odometer_km
      : row.odometer_km
        ? Number(row.odometer_km)
        : null,
    amount: typeof row.amount === 'number'
      ? row.amount
      : row.amount
        ? Number(row.amount)
        : null,
    advisorNotes: row.advisor_notes ? String(row.advisor_notes) : null,
  };
}

/* ─── Bookings ─── */

export interface CreateBookingInput {
  tenantId: string;
  customerId?: string | null;
  vehicleId?: string | null;
  vehicleRego?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceType: string;
  bookingDate: string;
  dropOffTime: string;
  pickupTime?: string;
  notes?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<void> {
  const { error } = await (supabase as unknown as UntypedSupabase)
    .from('bookings')
    .insert({
      tenant_id: input.tenantId,
      customer_id: input.customerId || null,
      vehicle_id: input.vehicleId || null,
      vehicle_rego: input.vehicleRego || null,
      vehicle_make: input.vehicleMake || null,
      vehicle_model: input.vehicleModel || null,
      vehicle_year: input.vehicleYear ? Number(input.vehicleYear) : null,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      customer_email: input.customerEmail || null,
      service_type: input.serviceType,
      booking_date: input.bookingDate,
      drop_off_time: input.dropOffTime,
      pickup_time: input.pickupTime || null,
      notes: input.notes || null,
      status: 'pending',
    });
  if (error) throw new Error(error.message);
}

function mapBookingRecord(row: Record<string, unknown>): BookingRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : null,
    vehicleRego: row.vehicle_rego ? String(row.vehicle_rego) : null,
    vehicleMake: row.vehicle_make ? String(row.vehicle_make) : null,
    vehicleModel: row.vehicle_model ? String(row.vehicle_model) : null,
    vehicleYear: typeof row.vehicle_year === 'number' ? row.vehicle_year : row.vehicle_year ? Number(row.vehicle_year) : null,
    customerName: String(row.customer_name ?? ''),
    customerPhone: String(row.customer_phone ?? ''),
    customerEmail: row.customer_email ? String(row.customer_email) : null,
    serviceType: String(row.service_type ?? ''),
    bookingDate: String(row.booking_date ?? ''),
    dropOffTime: String(row.drop_off_time ?? ''),
    pickupTime: row.pickup_time ? String(row.pickup_time) : null,
    notes: row.notes ? String(row.notes) : null,
    status: (row.status as BookingStatus) ?? 'pending',
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function fetchBookings(tenantId: string | null): Promise<BookingRecord[]> {
  let query = (supabase as unknown as UntypedSupabase).from('bookings').select('*').order('booking_date', { ascending: false });
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBookingRecord);
}

export async function fetchBookingById(id: string): Promise<BookingRecord | null> {
  const { data, error } = await (supabase as unknown as UntypedSupabase)
    .from('bookings').select('*').eq('id', id).single();
  if (error) return null;
  return mapBookingRecord(data as Record<string, unknown>);
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  const { error } = await (supabase as unknown as UntypedSupabase)
    .from('bookings').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchLatestBookingByPhone(
  tenantId: string,
  phone: string,
  branchId?: string,
): Promise<BookingRecord | null> {
  try {
    // Fetch latest bookings for this owner (and branch if provided) from Firebase
    const bookings = await getBookings(tenantId, 50, branchId);
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Support Sri Lanka specific formatting cases for the local 10-digit number
    const localPhone = normalizedPhone.startsWith('94') && normalizedPhone.length === 11 
      ? `0${normalizedPhone.slice(2)}` 
      : normalizedPhone;

    const matching = bookings.filter(b => {
      const bPhone = (b.clientPhone || '').replace(/\D/g, '');
      return bPhone === normalizedPhone || bPhone === localPhone;
    });

    if (matching.length === 0) return null;
    
    // Sort descending by date
    matching.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const b = matching[0];
    
    // Map to BookingRecord for UI compatibility
    return {
      id: b.id,
      tenantId,
      customerId: b.customerId || null,
      vehicleId: null,
      vehicleRego: b.vehicleNumber || null,
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      customerName: b.client || 'Unknown',
      customerPhone: b.clientPhone || '',
      customerEmail: b.clientEmail || null,
      serviceType: b.services?.map(s => s.serviceName).join(', ') || 'General Service',
      bookingDate: b.date,
      dropOffTime: b.time,
      pickupTime: b.pickupTime || null,
      notes: b.notes || null,
      status: 'confirmed', // Fallback status
      createdAt: b.date,
      updatedAt: b.date,
    } as unknown as BookingRecord;
  } catch {
    // console.warn("fetchLatestBookingByPhone Firebase error:", error);
    return null;
  }
}

export async function createClient(data: NewClientForm, session: UserSession): Promise<TenantOnboarding> {
  // Create tenant first
  const tenantId = `t-${Date.now()}`;
  const { error: tErr } = await supabase.from('tenants').insert({
    id: tenantId,
    name: data.businessName.trim(),
    industry: data.industry,
    status: 'active',
    brand_color: data.brandColor,
    did_numbers: [],
  });
  if (tErr) throw new Error(tErr.message);

  // Create onboarding record
  const { error: oErr } = await supabase.from('tenant_onboarding').insert({
    id: tenantId,
    onboarding_stage: 'new',
    contact_name: data.contactName.trim(),
    contact_phone: data.contactPhone.trim(),
    contact_email: data.contactEmail.trim(),
    created_by: session.userId,
    notes: data.notes.trim(),
    client_details: {
      businessName: data.businessName.trim(),
      industry: data.industry,
      primaryContactName: data.contactName.trim(),
      primaryContactPhone: data.contactPhone.trim(),
      primaryContactEmail: data.contactEmail.trim(),
    },
  });
  if (oErr) throw new Error(oErr.message);

  await logSystemActivity(
    session,
    'CREATE_CLIENT',
    'TENANT_ONBOARDING',
    tenantId,
    { businessName: data.businessName.trim() }
  );

  const clients = await fetchClients(tenantId);
  return clients[0];
}

export async function advanceClientStage(
  clientId: string,
  session?: UserSession
): Promise<{ client: TenantOnboarding | null; transition: StageTransitionResult | null }> {
  const clients = await fetchClients(clientId);
  const client = clients[0];
  if (!client) return { client: null, transition: null };

  const nextStage = getNextStage(client.onboardingStage);
  if (!nextStage) {
    return {
      client,
      transition: {
        allowed: false,
        blockers: [{ section: 'Stage', field: 'onboardingStage', message: 'No next stage available', severity: 'blocker' }],
        warnings: [],
        targetStage: client.onboardingStage,
      },
    };
  }

  const transition = validateStageTransition(client, nextStage);

  if (transition.allowed) {
    await supabase
      .from('tenant_onboarding')
      .update({ onboarding_stage: nextStage })
      .eq('id', clientId);

    if (session) {
      await logSystemActivity(
        session,
        'ADVANCE_CLIENT_STAGE',
        'TENANT_ONBOARDING',
        clientId,
        { fromStage: client.onboardingStage, toStage: nextStage }
      );
    }

    const updated = await fetchClients(clientId);
    return { client: updated[0], transition };
  }

  return { client, transition };
}

export async function regressClientStage(
  clientId: string,
  session?: UserSession,
  reason: string = '',
): Promise<TenantOnboarding | null> {
  await supabase
    .from('tenant_onboarding')
    .update({ onboarding_stage: 'needs-revision' })
    .eq('id', clientId);

  if (session) {
    await logSystemActivity(
      session,
      'REGRESS_CLIENT_STAGE',
      'TENANT_ONBOARDING',
      clientId,
      { toStage: 'needs-revision', reason }
    );
  }

  const clients = await fetchClients(clientId);
  return clients[0] || null;
}

export async function getClientValidation(clientId: string) {
  const clients = await fetchClients(clientId);
  const client = clients[0];
  if (!client) return null;

  return {
    blockers: getGoLiveBlockers(client),
    warnings: getGoLiveWarnings(client),
  };
}
