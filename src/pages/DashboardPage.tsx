import '@/styles/dashboard.css';

import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TenantOnboarding, NewClientForm, UserSession, Permissions } from '@/services/types';
import { useDashboard } from '@/context/DashboardDataContext';
import { useLiveClock } from '@/hooks/useLiveClock';
import { useFirebaseAuth } from '@/integrations/firebase/useFirebaseAuth';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AgentNavAttendanceActions } from '@/components/dashboard/AgentNavAttendanceActions';
import { AgentAttendanceTodayProvider } from '@/context/AgentAttendanceTodayContext';
import { SoftphoneWidget } from '@/components/dashboard/SoftphoneWidget';
import DashboardSidebar from '@/tabs/DashboardSidebar';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OverviewTab as RawOverviewTab } from '@/tabs/OverviewTab';
import { AgentsTab as RawAgentsTab } from '@/tabs/AgentsTab';
import { AgentPerformanceTab as RawAgentPerformanceTab } from '@/tabs/AgentPerformanceTab';
import { CallsTab as RawCallsTab } from '@/tabs/CallsTab';
import { SipLinesTab as RawSipLinesTab } from '@/tabs/SipLinesTab';
import { ClientsTab as RawClientsTab } from '@/tabs/ClientsTab';
import { AgentOnboardingTab as RawAgentOnboardingTab } from '@/tabs/AgentOnboardingTab';
import { AttendanceTab as RawAttendanceTab } from '@/tabs/AttendanceTab';
import { AuditLogsTab as RawAuditLogsTab } from '@/tabs/AuditLogsTab';
import { ChatTab as RawChatTab } from '@/tabs/ChatTab';
import { DIDMappingsTab as RawDIDMappingsTab } from '@/tabs/DIDMappingsTab';
import {
  SalesAgentSuburbAssignmentTab as RawSalesAgentSuburbAssignmentTab,
  SalesCallProgressTab as RawSalesCallProgressTab,
  SalesSuburbWorkshopsTab as RawSalesSuburbWorkshopsTab,
} from '@/tabs/sales-workspace/SalesWorkspaceAdminTabs';
import {
  AgentFollowUpsTab as RawAgentFollowUpsTab,
  AgentMyCallListTab as RawAgentMyCallListTab,
  AgentSalesHomeTab as RawAgentSalesHomeTab,
  AgentCompletedTab as RawAgentCompletedTab,
} from '@/tabs/sales-workspace/SalesWorkspaceAgentTabs';
import { memo } from 'react';

// Memoize tab components to prevent re-renders when irrelevant state (like the 1s clock) changes
// Note: OverviewTab still needs 'now', but other tabs might not.
const OverviewTab = memo(RawOverviewTab);
const AgentsTab = memo(RawAgentsTab);
const AgentPerformanceTab = memo(RawAgentPerformanceTab);
const CallsTab = memo(RawCallsTab);
const SipLinesTab = memo(RawSipLinesTab);
const ClientsTab = memo(RawClientsTab);
const AgentOnboardingTab = memo(RawAgentOnboardingTab);
const AttendanceTab = memo(RawAttendanceTab);
const AuditLogsTab = memo(RawAuditLogsTab);
const ChatTab = memo(RawChatTab);
const DIDMappingsTab = memo(RawDIDMappingsTab);
const SalesAgentSuburbAssignmentTab = memo(RawSalesAgentSuburbAssignmentTab);
const SalesCallProgressTab = memo(RawSalesCallProgressTab);
const SalesSuburbWorkshopsTab = memo(RawSalesSuburbWorkshopsTab);
const AgentFollowUpsTab = memo(RawAgentFollowUpsTab);
const AgentMyCallListTab = memo(RawAgentMyCallListTab);
const AgentSalesHomeTab = memo(RawAgentSalesHomeTab);
const AgentCompletedTab = memo(RawAgentCompletedTab);
import { fetchClients, createClient, advanceClientStage } from '@/services/dashboardApi';
import { fetchChats } from '@/services/chatApi';
import { 
  fetchAllLeaveRequests, 
  subscribeToAllLeaveRequestChanges,
  fetchMyLeaveRequests,
  subscribeToMyLeaveRequests 
} from '@/services/leaveRequestsApi';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SoftphoneCallLogContext } from '@/services/linkusCallLog';
import { cacheAgentSession } from '@/services/linkusCallLog';

interface DashboardPageProps {
  session: UserSession;
  permissions: Permissions;
  onSignOut: () => Promise<void>;
}

function AgentAttendanceShell({
  enabled,
  now,
  children,
}: {
  enabled: boolean;
  now: number;
  children: ReactNode;
}) {
  if (enabled) {
    return <AgentAttendanceTodayProvider now={now}>{children}</AgentAttendanceTodayProvider>;
  }
  return <>{children}</>;
}

export default function DashboardPage({ session, permissions, onSignOut }: DashboardPageProps) {
  const d = useDashboard();
  const { formattedDate: clockDate, formattedTime: clockTime } = useLiveClock();
  const { firebaseUser } = useFirebaseAuth();
  const [clients, setClients] = useState<TenantOnboarding[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchClients(d.selectedTenant).then(setClients).catch(() => {});
  }, [d.selectedTenant]);

  useEffect(() => {
    if (session?.role === 'agent') {
      sessionStorage.removeItem('agent_booking_expiry');
    }
  }, [session?.role]);

  // If the current tab becomes unavailable due to role changes, fall back safely.
  useEffect(() => {
    const isAllowed = (key: string) => {
      if (key === 'overview') return permissions.canViewOverviewTab;
      if (key === 'calls') return permissions.canViewCallsTab;
      if (key === 'bookings') return permissions.canViewBookingsTab;
      if (key === 'agents' || key === 'agent-performance') return permissions.canViewAgentsTab;
      if (key === 'chat') return permissions.canViewChatTab;
      if (key === 'agent-onboarding') return permissions.canViewAgentOnboardingTab;
      if (key === 'sip') return permissions.canViewSipTab;
      if (key === 'clients') return permissions.canViewClientsTab;
      if (key === 'did-mappings') return permissions.canManageDIDMappings;
      if (key === 'audit-logs') return permissions.canViewAuditLogs;
      if (key === 'attendance' || key === 'leave-requests' || key === 'shift-schedule') return permissions.canViewAttendanceTab;
      if (
        key === 'sales-suburbs' ||
        key === 'sales-workshops' ||
        key === 'sales-progress'
      ) {
        return permissions.canViewSalesAdminSuite;
      }
      if (
        key === 'agent-sales-home' ||
        key === 'agent-my-calls' ||
        key === 'agent-followups' ||
        key === 'agent-completed'
      ) {
        return permissions.canViewSalesAgentSuite;
      }
      return false;
    };

    if (!isAllowed(d.selectedTab)) {
      d.setSelectedTab('overview');
    }
  }, [d.selectedTab, d.setSelectedTab, permissions]);

  const handleSelectTab = useCallback((tab: string) => {
    if (tab === 'bookings') {
      navigate('/bookings/dashboard');
      return;
    }
    d.setSelectedTab(tab);
  }, [d.setSelectedTab, navigate]);

  const handleCreateClient = useCallback(async (data: NewClientForm) => {
    if (!session) return;
    await createClient(data, session);
    const updated = await fetchClients(d.selectedTenant);
    setClients(updated);
  }, [session, d.selectedTenant]);

  const handleAdvanceStage = useCallback(async (clientId: string) => {
    if (!session) return;
    await advanceClientStage(clientId, session);
    const updated = await fetchClients(d.selectedTenant);
    setClients(updated);
  }, [session, d.selectedTenant]);


  /** BMS chat list needs a tenant scope; super-admins often have no row in the switcher — fall back like softphone context. */
  const effectiveChatTenantId = useMemo(
    () => d.selectedTenant ?? session.tenantId ?? d.tenants[0]?.id ?? null,
    [d.selectedTenant, session.tenantId, d.tenants],
  );

  const chatWorkshopOwnerUid = useMemo(() => {
    const tid = effectiveChatTenantId;
    if (!tid) return null;
    const ou = d.tenants.find((t) => t.id === tid)?.bmsOwnerUid?.trim();
    return ou || null;
  }, [effectiveChatTenantId, d.tenants]);

  /**
   * Match `useDashboardData` tenant (`session.tenantId || selectedTenant`) so CRM
   * pickers align with agents already fetched. Fallback: first tenant (super-admin).
   */
  const effectiveSalesTenantId =
    session.tenantId || d.selectedTenant || d.tenants[0]?.id || null;

  const currentAgentDbId = useMemo(
    () => d.agents.find((a) => a.userId === session.userId)?.id ?? null,
    [d.agents, session.userId],
  );

  const [chatNavUnreadCount, setChatNavUnreadCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    if (!permissions.canViewChatTab) return;
    if (d.selectedTab === 'chat') return;
    if (!effectiveChatTenantId) return;

    let cancelled = false;
    const run = async () => {
      try {
        const rows = await fetchChats({
          tenantId: effectiveChatTenantId,
          ownerUid: chatWorkshopOwnerUid,
        });
        if (!cancelled) {
          setChatNavUnreadCount(rows.filter((c) => c.unreadForAgent).length);
        }
      } catch {
        /* ignore */
      }
    };

    void run();
    const id = setInterval(run, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [
    permissions.canViewChatTab,
    d.selectedTab,
    effectiveChatTenantId,
    chatWorkshopOwnerUid,
  ]);

  useEffect(() => {
    if (session.role !== 'super-admin') return;

    let cancelled = false;
    const loadLeaves = async () => {
      try {
        const rows = await fetchAllLeaveRequests();
        if (cancelled) return;

        const ccUserIds = new Set(
          d.agents
            .filter((a) => !String(a.bmsOwnerUid ?? '').trim() && a.userId && a.userId.length >= 36)
            .map((a) => a.userId)
        );

        const pending = rows.filter((r) => r.status === 'pending' && ccUserIds.has(r.user_id)).length;
        setPendingLeaveCount(pending);
      } catch {
        /* ignore */
      }
    };

    void loadLeaves();

    const unsub = subscribeToAllLeaveRequestChanges((row, event) => {
      // Re-fetch on any change so we don't have to keep a full list in memory just to maintain the count.
      void loadLeaves();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [session.role, d.agents]);

  // For agents: Show a notification badge if a leave request was reviewed (approved/rejected)
  // since the last time they viewed the leave-requests tab.
  useEffect(() => {
    if (session.role !== 'agent' || !session.userId) return;

    let cancelled = false;
    const LOCAL_STORAGE_KEY = 'last_seen_leave_reviews_at';

    const loadAgentLeaves = async () => {
      try {
        const rows = await fetchMyLeaveRequests(session.userId);
        if (cancelled) return;

        if (d.selectedTab === 'leave-requests') {
          localStorage.setItem(LOCAL_STORAGE_KEY, Date.now().toString());
          setPendingLeaveCount(0);
          return;
        }

        const lastSeenStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        const lastSeenMs = lastSeenStr ? parseInt(lastSeenStr, 10) : 0;

        const unseenCount = rows.filter((r) => {
          if (r.status === 'pending') return false;
          if (!r.reviewed_at) return false;
          return new Date(r.reviewed_at).getTime() > lastSeenMs;
        }).length;

        setPendingLeaveCount(unseenCount);
      } catch {
        /* ignore */
      }
    };

    void loadAgentLeaves();

    const unsub = subscribeToMyLeaveRequests(session.userId, () => {
      void loadAgentLeaves();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [session.role, session.userId, d.selectedTab]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950">

      {/* Sidebar */}
      <DashboardSidebar
        selectedTab={d.selectedTab}
        onSelect={handleSelectTab}
        permissions={permissions}
        displayName={session.displayName}
        currentRole={session.role}
        onSignOut={onSignOut}
        chatNavUnreadCount={chatNavUnreadCount}
        pendingLeaveCount={pendingLeaveCount}
        isCCAgent={
          session.role === 'agent' &&
          !!d.agents.find((a) => a.userId === session.userId && !String(a.bmsOwnerUid ?? '').trim())
        }
      />

      {/* Main content */}
      <AgentAttendanceShell enabled={session.role === 'agent' && permissions.canViewShiftPanel} now={d.now}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top header */}
          <DashboardHeader
            connectionStatus={d.connectionStatus}
            clockDate={clockDate}
            clockTime={clockTime}
            attendanceSlot={
              permissions.canViewShiftPanel && session.role === 'agent' ? (
                <AgentNavAttendanceActions session={session} />
              ) : undefined
            }
          />

        {/* Tab content: chat fills height and scrolls internally; other tabs scroll the main area */}
        <main
          className={
            d.selectedTab === 'chat'
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:px-8'
              : 'min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8'
          }
        >
          {d.error && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {d.error}
              </span>
              <Button variant="outline" size="sm" onClick={d.refresh} className="border-rose-200 bg-white text-rose-700 hover:bg-rose-100">
                Retry
              </Button>
            </div>
          )}

          {d.loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {d.selectedTab === 'overview' && (
                <OverviewTab
                  summary={d.summary}
                  queues={d.queues}
                  agents={d.agents}
                  calls={d.calls}
                  tenants={d.tenants}
                  permissions={permissions}
                  now={d.now}
                  session={session}
                  agentGroups={d.agentGroups}
                  incomingCalls={d.incomingCalls}
                  callDate={d.callDate}
                />
              )}
              {(d.selectedTab === 'attendance' || d.selectedTab === 'leave-requests' || d.selectedTab === 'shift-schedule') && (
                <AttendanceTab
                  session={session}
                  permissions={permissions}
                  agents={d.agents}
                  tenants={d.tenants}
                  now={d.now}
                  section={
                    d.selectedTab === 'leave-requests' 
                      ? 'leave' 
                      : d.selectedTab === 'shift-schedule'
                      ? 'shift-schedule'
                      : 'shifts'
                  }
                />
              )}
              {d.selectedTab === 'agents' && (
                <AgentsTab
                  agents={d.agents}
                  queues={d.queues}
                  tenants={d.tenants}
                  permissions={permissions}
                  now={d.now}
                  onRefresh={d.refresh}
                />
              )}
              {d.selectedTab === 'agent-performance' && (
                <AgentPerformanceTab
                  agents={d.agents}
                  calls={d.calls}
                  tenantId={effectiveSalesTenantId}
                />
              )}
              {d.selectedTab === 'agent-onboarding' && (
                <AgentOnboardingTab
                  agentOnboarding={d.agentOnboarding}
                  tenants={d.tenants}
                  permissions={permissions}
                  onRefresh={d.refresh}
                />
              )}
              {d.selectedTab === 'chat' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <ChatTab
                    session={session}
                    permissions={permissions}
                    listTenantId={effectiveChatTenantId}
                    workshopOwnerUid={chatWorkshopOwnerUid}
                    onInboxStatsChange={({ unreadCount }) =>
                      setChatNavUnreadCount(unreadCount)
                    }
                  />
                </div>
              )}
              {d.selectedTab === 'calls' && (
                <CallsTab
                  calls={d.calls}
                  queues={d.queues}
                  tenants={d.tenants}
                  permissions={permissions}
                  callDate={d.callDate}
                  onDateChange={d.setCallDate}
                />
              )}
              {/* {d.selectedTab === 'bookings' && (
                <BookingsTab
                  tenantId={d.selectedTenant}
                  permissions={permissions}
                />
              )} */}
              {d.selectedTab === 'sip' && (
                <SipLinesTab
                  sipLines={d.sipLines}
                  tenants={d.tenants}
                  permissions={permissions}
                  now={d.now}
                />
              )}
              {d.selectedTab === 'clients' && (
                <ClientsTab
                  clients={clients}
                  permissions={permissions}
                  onCreateClient={handleCreateClient}
                  onAdvanceStage={handleAdvanceStage}
                />
              )}
              {d.selectedTab === 'did-mappings' && (
                <DIDMappingsTab permissions={permissions} />
              )}
              {d.selectedTab === 'audit-logs' && (
                <AuditLogsTab />
              )}
              {d.selectedTab === 'sales-suburbs' && (
                <SalesAgentSuburbAssignmentTab
                  tenantId={effectiveSalesTenantId}
                  tenants={d.tenants}
                  agents={d.agents}
                  queues={d.queues}
                  permissions={permissions}
                  session={session}
                  onRefreshDashboard={d.refresh}
                />
              )}
              {d.selectedTab === 'sales-workshops' && (
                <SalesSuburbWorkshopsTab
                  tenantId={effectiveSalesTenantId}
                  tenants={d.tenants}
                  agents={d.agents}
                  queues={d.queues}
                  permissions={permissions}
                  session={session}
                  onRefreshDashboard={d.refresh}
                />
              )}
              {d.selectedTab === 'sales-progress' && (
                <SalesCallProgressTab
                  tenantId={effectiveSalesTenantId}
                  tenants={d.tenants}
                  agents={d.agents}
                  queues={d.queues}
                  permissions={permissions}
                  session={session}
                  onRefreshDashboard={d.refresh}
                />
              )}
              {d.selectedTab === 'agent-sales-home' && (
                <AgentSalesHomeTab
                  tenants={d.tenants}
                  agents={d.agents}
                  permissions={permissions}
                  session={session}
                  currentAgentDbId={currentAgentDbId}
                  onRefreshDashboard={d.refresh}
                />
              )}
              {d.selectedTab === 'agent-my-calls' && (
                <AgentMyCallListTab
                  tenants={d.tenants}
                  agents={d.agents}
                  permissions={permissions}
                  session={session}
                  currentAgentDbId={currentAgentDbId}
                  onRefreshDashboard={d.refresh}
                />
              )}
              {d.selectedTab === 'agent-followups' && (
                <AgentFollowUpsTab />
              )}
              {d.selectedTab === 'agent-completed' && (
                <AgentCompletedTab
                  tenants={d.tenants}
                  agents={d.agents}
                  permissions={permissions}
                  session={session}
                  currentAgentDbId={currentAgentDbId}
                  onRefreshDashboard={d.refresh}
                />
              )}
            </>
          )}
        </main>
        </div>
      </AgentAttendanceShell>
    </div>
  );
}
