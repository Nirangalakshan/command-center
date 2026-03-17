import type {
  Tenant, Queue, Agent, Call, SipLine, DashboardSummary, UserSession,
  AgentStatus, CallResult, TranscriptStatus, SipLineStatus,
  TenantOnboarding, NewClientForm, OnboardingStage,
} from './types';
import { getCurrentSession } from './mockSession';

/* ═══════════════════════════════════════════════════════════════
   Mock API Service Layer
   
   Each function mirrors a real REST endpoint.
   Replace function bodies with fetch() calls to your backend.
   
   GET /api/session
   GET /api/tenants
   GET /api/dashboard/summary?tenantId=xxx
   GET /api/queues?tenantId=xxx
   GET /api/agents?tenantId=xxx
   GET /api/calls?tenantId=xxx
   GET /api/sip-lines?tenantId=xxx
   ═══════════════════════════════════════════════════════════════ */

const API_LATENCY = 200;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─── Seed Data ─── */

const TENANTS: Tenant[] = [
  { id: 't-001', name: 'Melbourne Plumbing Co', industry: 'Trades', status: 'active', brandColor: '#00d4f5' },
  { id: 't-002', name: 'Sunrise Dental Group', industry: 'Healthcare', status: 'active', brandColor: '#34d399' },
  { id: 't-003', name: 'Apex Real Estate', industry: 'Property', status: 'active', brandColor: '#a78bfa' },
  { id: 't-004', name: 'Coastal Insurance', industry: 'Finance', status: 'active', brandColor: '#fb923c' },
];

const QUEUES: Queue[] = [
  { id: 'q-s1', tenantId: 't-001', name: 'Sales', type: 'inbound', color: '#00d4f5', icon: '📞', activeCalls: 1, waitingCalls: 2, availableAgents: 2, totalAgents: 4, avgWaitSeconds: 28, slaPercent: 87 },
  { id: 'q-h1', tenantId: 't-001', name: 'Support', type: 'inbound', color: '#a78bfa', icon: '🎧', activeCalls: 0, waitingCalls: 1, availableAgents: 2, totalAgents: 3, avgWaitSeconds: 18, slaPercent: 92 },
  { id: 'q-b1', tenantId: 't-001', name: 'Bookings', type: 'inbound', color: '#34d399', icon: '📅', activeCalls: 1, waitingCalls: 0, availableAgents: 0, totalAgents: 2, avgWaitSeconds: 12, slaPercent: 95 },
  { id: 'q-s2', tenantId: 't-002', name: 'New Patients', type: 'inbound', color: '#00d4f5', icon: '📞', activeCalls: 2, waitingCalls: 1, availableAgents: 1, totalAgents: 3, avgWaitSeconds: 22, slaPercent: 84 },
  { id: 'q-h2', tenantId: 't-002', name: 'Existing Patients', type: 'inbound', color: '#a78bfa', icon: '🎧', activeCalls: 0, waitingCalls: 0, availableAgents: 1, totalAgents: 2, avgWaitSeconds: 14, slaPercent: 96 },
  { id: 'q-s3', tenantId: 't-003', name: 'Buyer Enquiries', type: 'inbound', color: '#00d4f5', icon: '🏠', activeCalls: 1, waitingCalls: 1, availableAgents: 1, totalAgents: 3, avgWaitSeconds: 32, slaPercent: 78 },
  { id: 'q-h3', tenantId: 't-003', name: 'Seller Support', type: 'inbound', color: '#34d399', icon: '📋', activeCalls: 0, waitingCalls: 0, availableAgents: 2, totalAgents: 2, avgWaitSeconds: 10, slaPercent: 98 },
  { id: 'q-s4', tenantId: 't-004', name: 'Quotes', type: 'inbound', color: '#fb923c', icon: '📊', activeCalls: 1, waitingCalls: 2, availableAgents: 0, totalAgents: 2, avgWaitSeconds: 45, slaPercent: 72 },
  { id: 'q-h4', tenantId: 't-004', name: 'Claims', type: 'inbound', color: '#f43f5e', icon: '🛡️', activeCalls: 1, waitingCalls: 1, availableAgents: 1, totalAgents: 3, avgWaitSeconds: 38, slaPercent: 76 },
];

const AGENTS: Agent[] = [
  { id: 'a-01', tenantId: 't-001', queueIds: ['q-s1'], name: 'Liam Chen', extension: '1001', role: 'senior-agent', status: 'on-call' as AgentStatus, currentCaller: '0412345678', callStartTime: Date.now() - 187000, allowedQueueIds: ['q-s1', 'q-h1'] },
  { id: 'a-02', tenantId: 't-001', queueIds: ['q-h1'], name: 'Priya Sharma', extension: '1002', role: 'agent', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h1'] },
  { id: 'a-03', tenantId: 't-001', queueIds: ['q-b1'], name: 'Jake Morrison', extension: '1003', role: 'agent', status: 'on-call' as AgentStatus, currentCaller: '0398765432', callStartTime: Date.now() - 423000, allowedQueueIds: ['q-b1'] },
  { id: 'a-04', tenantId: 't-001', queueIds: ['q-s1'], name: 'Anika Patel', extension: '1004', role: 'agent', status: 'wrap-up' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-s1'] },
  { id: 'a-05', tenantId: 't-001', queueIds: ['q-h1'], name: 'Tom Nguyen', extension: '1005', role: 'team-lead', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h1', 'q-b1'] },
  { id: 'a-06', tenantId: 't-001', queueIds: ['q-b1'], name: 'Sara Kim', extension: '1006', role: 'agent', status: 'break' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-b1'] },
  { id: 'a-07', tenantId: 't-002', queueIds: ['q-s2'], name: 'Ben Torres', extension: '2001', role: 'senior-agent', status: 'on-call' as AgentStatus, currentCaller: '0423456789', callStartTime: Date.now() - 98000, allowedQueueIds: ['q-s2', 'q-h2'] },
  { id: 'a-08', tenantId: 't-002', queueIds: ['q-h2'], name: 'Maya Singh', extension: '2002', role: 'agent', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h2'] },
  { id: 'a-09', tenantId: 't-002', queueIds: ['q-s2'], name: 'Alex Cruz', extension: '2003', role: 'agent', status: 'on-call' as AgentStatus, currentCaller: '0434567890', callStartTime: Date.now() - 312000, allowedQueueIds: ['q-s2'] },
  { id: 'a-10', tenantId: 't-002', queueIds: ['q-h2'], name: 'Nina Volkov', extension: '2004', role: 'agent', status: 'offline' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h2'] },
  { id: 'a-11', tenantId: 't-003', queueIds: ['q-s3'], name: 'Oscar Reyes', extension: '3001', role: 'agent', status: 'on-call' as AgentStatus, currentCaller: '0445678901', callStartTime: Date.now() - 67000, allowedQueueIds: ['q-s3'] },
  { id: 'a-12', tenantId: 't-003', queueIds: ['q-h3'], name: 'Isla Thompson', extension: '3002', role: 'agent', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h3'] },
  { id: 'a-13', tenantId: 't-003', queueIds: ['q-s3'], name: 'Ryan O\'Brien', extension: '3003', role: 'team-lead', status: 'wrap-up' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-s3', 'q-h3'] },
  { id: 'a-14', tenantId: 't-003', queueIds: ['q-h3'], name: 'Zara Ahmed', extension: '3004', role: 'agent', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h3'] },
  { id: 'a-15', tenantId: 't-004', queueIds: ['q-s4'], name: 'Leo Park', extension: '4001', role: 'senior-agent', status: 'on-call' as AgentStatus, currentCaller: '0456789012', callStartTime: Date.now() - 245000, allowedQueueIds: ['q-s4', 'q-h4'] },
  { id: 'a-16', tenantId: 't-004', queueIds: ['q-h4'], name: 'Freya Walsh', extension: '4002', role: 'agent', status: 'available' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-h4'] },
  { id: 'a-17', tenantId: 't-004', queueIds: ['q-s4'], name: 'Kai Tanaka', extension: '4003', role: 'agent', status: 'break' as AgentStatus, currentCaller: null, callStartTime: null, allowedQueueIds: ['q-s4'] },
  { id: 'a-18', tenantId: 't-004', queueIds: ['q-h4'], name: 'Ruby Santos', extension: '4004', role: 'agent', status: 'on-call' as AgentStatus, currentCaller: '0467890123', callStartTime: Date.now() - 156000, allowedQueueIds: ['q-h4'] },
];

function buildCallLog(): Call[] {
  const now = Date.now();
  const raw: Array<{
    tenantId: string; queueId: string; agentId: string | null;
    caller: string; callerName: string | null; result: CallResult; dur: number;
    transcript: TranscriptStatus;
  }> = [
    { tenantId: 't-001', queueId: 'q-s1', agentId: 'a-01', caller: '0412345678', callerName: 'David Brown', result: 'answered', dur: 187, transcript: 'ready' },
    { tenantId: 't-001', queueId: 'q-h1', agentId: 'a-02', caller: '0413456789', callerName: null, result: 'answered', dur: 342, transcript: 'processing' },
    { tenantId: 't-001', queueId: 'q-b1', agentId: 'a-03', caller: '0398765432', callerName: 'Emma White', result: 'answered', dur: 423, transcript: 'ready' },
    { tenantId: 't-001', queueId: 'q-s1', agentId: 'a-04', caller: '0414567890', callerName: null, result: 'abandoned', dur: 0, transcript: 'none' },
    { tenantId: 't-001', queueId: 'q-h1', agentId: null, caller: '0415678901', callerName: 'Mark Taylor', result: 'missed', dur: 0, transcript: 'none' },
    { tenantId: 't-001', queueId: 'q-b1', agentId: 'a-06', caller: '0416789012', callerName: null, result: 'answered', dur: 278, transcript: 'pending' },
    { tenantId: 't-002', queueId: 'q-s2', agentId: 'a-07', caller: '0423456789', callerName: 'Sophie Lee', result: 'answered', dur: 98, transcript: 'ready' },
    { tenantId: 't-002', queueId: 'q-h2', agentId: 'a-08', caller: '0424567890', callerName: null, result: 'answered', dur: 456, transcript: 'ready' },
    { tenantId: 't-002', queueId: 'q-s2', agentId: 'a-09', caller: '0434567890', callerName: 'James Park', result: 'answered', dur: 312, transcript: 'processing' },
    { tenantId: 't-002', queueId: 'q-h2', agentId: null, caller: '0425678901', callerName: null, result: 'voicemail', dur: 45, transcript: 'pending' },
    { tenantId: 't-002', queueId: 'q-s2', agentId: 'a-07', caller: '0426789012', callerName: 'Lisa Chen', result: 'answered', dur: 189, transcript: 'ready' },
    { tenantId: 't-003', queueId: 'q-s3', agentId: 'a-11', caller: '0445678901', callerName: null, result: 'answered', dur: 67, transcript: 'pending' },
    { tenantId: 't-003', queueId: 'q-h3', agentId: 'a-12', caller: '0446789012', callerName: 'Chris Evans', result: 'answered', dur: 234, transcript: 'ready' },
    { tenantId: 't-003', queueId: 'q-s3', agentId: null, caller: '0447890123', callerName: null, result: 'abandoned', dur: 0, transcript: 'none' },
    { tenantId: 't-003', queueId: 'q-h3', agentId: 'a-14', caller: '0448901234', callerName: 'Amy Watson', result: 'answered', dur: 156, transcript: 'ready' },
    { tenantId: 't-004', queueId: 'q-s4', agentId: 'a-15', caller: '0456789012', callerName: null, result: 'answered', dur: 245, transcript: 'processing' },
    { tenantId: 't-004', queueId: 'q-h4', agentId: 'a-16', caller: '0457890123', callerName: 'Tom Hardy', result: 'answered', dur: 189, transcript: 'ready' },
    { tenantId: 't-004', queueId: 'q-h4', agentId: 'a-18', caller: '0467890123', callerName: null, result: 'answered', dur: 156, transcript: 'pending' },
    { tenantId: 't-004', queueId: 'q-s4', agentId: null, caller: '0458901234', callerName: 'Jane Doe', result: 'missed', dur: 0, transcript: 'none' },
    { tenantId: 't-004', queueId: 'q-h4', agentId: 'a-16', caller: '0459012345', callerName: null, result: 'answered', dur: 312, transcript: 'ready' },
  ];

  return raw.map((e, i) => ({
    id: `call-${String(i + 1).padStart(4, '0')}`,
    tenantId: e.tenantId,
    queueId: e.queueId,
    agentId: e.agentId,
    callerNumber: e.caller,
    callerName: e.callerName,
    startTime: new Date(now - (raw.length - i) * 420000).toISOString(),
    answerTime: e.result === 'answered' ? new Date(now - (raw.length - i) * 420000 + 8000).toISOString() : null,
    endTime: e.dur > 0 ? new Date(now - (raw.length - i) * 420000 + e.dur * 1000).toISOString() : null,
    durationSeconds: e.dur,
    result: e.result,
    recordingUrl: e.result === 'answered' ? `/recordings/${e.tenantId}/${`call-${String(i + 1).padStart(4, '0')}`}.wav` : null,
    transcriptStatus: e.transcript,
    summaryStatus: e.transcript === 'ready' ? 'ready' as const : 'none' as const,
    agentName: e.agentId ? (AGENTS.find((a) => a.id === e.agentId)?.name ?? '—') : '—',
    queueName: QUEUES.find((q) => q.id === e.queueId)?.name ?? '—',
    tenantName: TENANTS.find((t) => t.id === e.tenantId)?.name ?? '—',
  }));
}

const CALLS = buildCallLog();

const SIP_LINES: SipLine[] = [
  { id: 'sip-01', label: 'SIP/01', trunkName: 'Trunk-A', status: 'active' as SipLineStatus, tenantId: 't-001', activeCaller: '0412345678', activeSince: Date.now() - 187000 },
  { id: 'sip-02', label: 'SIP/02', trunkName: 'Trunk-A', status: 'active' as SipLineStatus, tenantId: 't-001', activeCaller: '0398765432', activeSince: Date.now() - 423000 },
  { id: 'sip-03', label: 'SIP/03', trunkName: 'Trunk-A', status: 'idle' as SipLineStatus, tenantId: null, activeCaller: null, activeSince: null },
  { id: 'sip-04', label: 'SIP/04', trunkName: 'Trunk-B', status: 'active' as SipLineStatus, tenantId: 't-002', activeCaller: '0423456789', activeSince: Date.now() - 98000 },
  { id: 'sip-05', label: 'SIP/05', trunkName: 'Trunk-B', status: 'active' as SipLineStatus, tenantId: 't-002', activeCaller: '0434567890', activeSince: Date.now() - 312000 },
  { id: 'sip-06', label: 'SIP/06', trunkName: 'Trunk-B', status: 'idle' as SipLineStatus, tenantId: null, activeCaller: null, activeSince: null },
  { id: 'sip-07', label: 'SIP/07', trunkName: 'Trunk-C', status: 'active' as SipLineStatus, tenantId: 't-003', activeCaller: '0445678901', activeSince: Date.now() - 67000 },
  { id: 'sip-08', label: 'SIP/08', trunkName: 'Trunk-C', status: 'idle' as SipLineStatus, tenantId: null, activeCaller: null, activeSince: null },
  { id: 'sip-09', label: 'SIP/09', trunkName: 'Trunk-D', status: 'active' as SipLineStatus, tenantId: 't-004', activeCaller: '0456789012', activeSince: Date.now() - 245000 },
  { id: 'sip-10', label: 'SIP/10', trunkName: 'Trunk-D', status: 'active' as SipLineStatus, tenantId: 't-004', activeCaller: '0467890123', activeSince: Date.now() - 156000 },
  { id: 'sip-11', label: 'SIP/11', trunkName: 'Trunk-D', status: 'idle' as SipLineStatus, tenantId: null, activeCaller: null, activeSince: null },
  { id: 'sip-12', label: 'SIP/12', trunkName: 'Trunk-D', status: 'idle' as SipLineStatus, tenantId: null, activeCaller: null, activeSince: null },
];

/* ─── API Functions ─── */

export async function fetchSession(): Promise<UserSession> {
  await wait(API_LATENCY);
  return getCurrentSession();
}

export async function fetchTenants(): Promise<Tenant[]> {
  await wait(API_LATENCY);
  return [...TENANTS];
}

export async function fetchSummary(tenantId?: string | null): Promise<DashboardSummary> {
  await wait(API_LATENCY);
  const ag = tenantId ? AGENTS.filter((a) => a.tenantId === tenantId) : AGENTS;
  const cl = tenantId ? CALLS.filter((c) => c.tenantId === tenantId) : CALLS;
  const answered = cl.filter((c) => c.result === 'answered').length;
  const total = cl.length;
  const onCall = ag.filter((a) => a.status === 'on-call').length;
  const online = ag.filter((a) => a.status !== 'offline').length;
  const available = ag.filter((a) => a.status === 'available').length;
  const queued = tenantId
    ? QUEUES.filter((q) => q.tenantId === tenantId).reduce((s, q) => s + q.waitingCalls, 0)
    : QUEUES.reduce((s, q) => s + q.waitingCalls, 0);
  const avgHandle = answered > 0
    ? Math.round(cl.filter((c) => c.result === 'answered').reduce((s, c) => s + c.durationSeconds, 0) / answered)
    : 0;
  const sla = tenantId
    ? Math.round(QUEUES.filter((q) => q.tenantId === tenantId).reduce((s, q) => s + q.slaPercent, 0) / Math.max(1, QUEUES.filter((q) => q.tenantId === tenantId).length))
    : Math.round(QUEUES.reduce((s, q) => s + q.slaPercent, 0) / QUEUES.length);

  return {
    activeCalls: onCall,
    queuedCalls: queued,
    availableAgents: available,
    onlineAgents: online,
    totalCallsToday: total,
    answerRate: total > 0 ? Math.round((answered / total) * 1000) / 10 : 0,
    abandonRate: total > 0 ? Math.round((cl.filter((c) => c.result === 'abandoned').length / total) * 1000) / 10 : 0,
    avgHandleTime: avgHandle,
    slaPercent: sla,
  };
}

export async function fetchQueues(tenantId?: string | null): Promise<Queue[]> {
  await wait(API_LATENCY);
  return tenantId ? QUEUES.filter((q) => q.tenantId === tenantId) : [...QUEUES];
}

export async function fetchAgents(tenantId?: string | null): Promise<Agent[]> {
  await wait(API_LATENCY);
  const filtered = tenantId ? AGENTS.filter((a) => a.tenantId === tenantId) : AGENTS;
  return filtered.map((a) => ({
    ...a,
    queueName: QUEUES.find((q) => a.queueIds.includes(q.id))?.name ?? '—',
    tenantName: TENANTS.find((t) => t.id === a.tenantId)?.name ?? '—',
  }));
}

export async function fetchCalls(tenantId?: string | null): Promise<Call[]> {
  await wait(API_LATENCY);
  return tenantId ? CALLS.filter((c) => c.tenantId === tenantId) : [...CALLS];
}

export async function fetchSipLines(tenantId?: string | null): Promise<SipLine[]> {
  await wait(API_LATENCY);
  const lines = tenantId
    ? SIP_LINES.filter((l) => l.tenantId === tenantId || l.status === 'idle')
    : [...SIP_LINES];
  return lines.map((l) => ({
    ...l,
    tenantName: l.tenantId ? TENANTS.find((t) => t.id === l.tenantId)?.name : undefined,
  }));
}
