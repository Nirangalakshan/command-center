import { supabase } from '@/integrations/supabase/client';
import type {
  Tenant, Queue, Agent, Call, SipLine, DashboardSummary,
  TenantOnboarding, NewClientForm, StageTransitionResult,
  AgentGroup, DIDMapping, IncomingCall,
} from './types';
import {
  ONBOARDING_STAGES,
  validateStageTransition,
  getNextStage,
  getGoLiveBlockers,
  getGoLiveWarnings,
} from '@/utils/onboardingValidation';

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
  let query = supabase.from('agents').select('*, tenants!inner(name)');
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

function mapAgent(a: any): Agent {
  return {
    id: a.id,
    tenantId: a.tenant_id,
    queueIds: a.queue_ids || [],
    name: a.name,
    extension: a.extension,
    role: a.role,
    status: a.status,
    currentCaller: a.current_caller,
    callStartTime: a.call_start_time ? Number(a.call_start_time) : null,
    allowedQueueIds: a.allowed_queue_ids || [],
    assignedTenantIds: a.assigned_tenant_ids || [],
    groupIds: a.group_ids || [],
    tenantName: a.tenants?.name,
  };
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
    result: c.result as any,
    recordingUrl: c.recording_url,
    transcriptStatus: c.transcript_status as any,
    summaryStatus: c.summary_status as any,
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
    status: l.status as any,
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
    ringStrategy: g.ring_strategy as any,
  }));
}

/* ─── DID Mappings ─── */

export async function fetchDIDMappings(): Promise<DIDMapping[]> {
  const { data, error } = await supabase.from('did_mappings').select('*');
  if (error) throw new Error(error.message);
  return (data || []).map((d) => ({
    did: d.did,
    tenantId: d.tenant_id,
    queueId: d.queue_id,
    label: d.label,
  }));
}

/* ─── Incoming Calls (placeholder — will be driven by Yeastar in Phase 2) ─── */

export async function fetchIncomingCalls(_allowedQueueIds?: string[]): Promise<IncomingCall[]> {
  // Phase 2: Replace with real Yeastar PBX events
  return [];
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

export async function createClient(data: NewClientForm, createdBy: string): Promise<TenantOnboarding> {
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
    created_by: createdBy,
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

  const clients = await fetchClients(tenantId);
  return clients[0];
}

export async function advanceClientStage(
  clientId: string,
  _userId: string = 'unknown',
  _userName: string = 'Unknown',
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

    const updated = await fetchClients(clientId);
    return { client: updated[0], transition };
  }

  return { client, transition };
}

export async function regressClientStage(
  clientId: string,
  _userId: string = 'unknown',
  _userName: string = 'Unknown',
  _reason: string = '',
): Promise<TenantOnboarding | null> {
  await supabase
    .from('tenant_onboarding')
    .update({ onboarding_stage: 'needs-revision' })
    .eq('id', clientId);

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
