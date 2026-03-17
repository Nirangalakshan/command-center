/* ═══════════════════════════════════════════════════════════════
   Domain Model — Multi-Tenant Call Centre
   Every entity carries tenantId for strict isolation.
   ═══════════════════════════════════════════════════════════════ */

export type UserRole = 'super-admin' | 'client-admin' | 'agent';

export type AgentStatus = 'on-call' | 'available' | 'wrap-up' | 'break' | 'offline';

export type CallResult = 'answered' | 'abandoned' | 'missed' | 'voicemail';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type TranscriptStatus = 'pending' | 'processing' | 'ready' | 'none';

export type SipLineStatus = 'active' | 'idle' | 'error';

export interface Tenant {
  id: string;
  name: string;
  industry: string;
  status: 'active' | 'inactive';
  brandColor: string;
}

export interface Queue {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  activeCalls: number;
  waitingCalls: number;
  availableAgents: number;
  totalAgents: number;
  avgWaitSeconds: number;
  slaPercent: number;
}

export interface Agent {
  id: string;
  tenantId: string;
  queueIds: string[];
  name: string;
  extension: string;
  role: 'agent' | 'senior-agent' | 'team-lead';
  status: AgentStatus;
  currentCaller: string | null;
  callStartTime: number | null;
  allowedQueueIds: string[];
  queueName?: string;
  tenantName?: string;
}

export interface Call {
  id: string;
  tenantId: string;
  queueId: string;
  agentId: string | null;
  callerNumber: string;
  callerName: string | null;
  startTime: string;
  answerTime: string | null;
  endTime: string | null;
  durationSeconds: number;
  result: CallResult;
  recordingUrl: string | null;
  transcriptStatus: TranscriptStatus;
  summaryStatus: 'pending' | 'ready' | 'none';
  agentName: string;
  queueName: string;
  tenantName: string;
}

export interface SipLine {
  id: string;
  tenantId: string | null;
  label: string;
  trunkName: string;
  status: SipLineStatus;
  activeCaller: string | null;
  activeSince: number | null;
  tenantName?: string;
}

export interface UserSession {
  userId: string;
  role: UserRole;
  tenantId: string | null;
  allowedQueueIds: string[];
  displayName: string;
}

export interface DashboardSummary {
  activeCalls: number;
  queuedCalls: number;
  availableAgents: number;
  onlineAgents: number;
  totalCallsToday: number;
  answerRate: number;
  abandonRate: number;
  avgHandleTime: number;
  slaPercent: number;
}

export type OnboardingStage =
  | 'signup'
  | 'tenant-created'
  | 'phone-setup'
  | 'business-config'
  | 'call-flow-design'
  | 'agent-training'
  | 'soft-launch'
  | 'go-live'
  | 'monitoring';

export interface TenantOnboarding extends Tenant {
  onboardingStage: OnboardingStage;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  createdBy: string;
  createdAt: string;
  notes: string;
}

export interface NewClientForm {
  businessName: string;
  industry: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  brandColor: string;
  notes: string;
}

export interface Permissions {
  canViewAllTenants: boolean;
  canSwitchTenant: boolean;
  canViewSipInfrastructure: boolean;
  canViewTenantNames: boolean;
  canViewCallsTab: boolean;
  canViewAgentsTab: boolean;
  canViewOverviewTab: boolean;
  canViewSipTab: boolean;
  canViewClientsTab: boolean;
  canSignUpClients: boolean;
  canAdvanceOnboarding: boolean;
  allowedTenantId: string | null;
  allowedQueueIds: string[];
}

export interface TabDef {
  key: string;
  label: string;
  icon: string;
}
