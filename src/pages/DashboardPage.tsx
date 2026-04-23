import '@/styles/dashboard.css';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TenantOnboarding, NewClientForm, UserSession, Permissions } from '@/services/types';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLiveClock } from '@/hooks/useLiveClock';
import { useFirebaseAuth } from '@/integrations/firebase/useFirebaseAuth';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SoftphoneWidget } from '@/components/dashboard/SoftphoneWidget';
import DashboardSidebar from '@/tabs/DashboardSidebar';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OverviewTab } from '@/tabs/OverviewTab';
import { AgentsTab } from '@/tabs/AgentsTab';
import { CallsTab } from '@/tabs/CallsTab';
import { SipLinesTab } from '@/tabs/SipLinesTab';
import { ClientsTab } from '@/tabs/ClientsTab';
import { AgentOnboardingTab } from '@/tabs/AgentOnboardingTab';
import { AuditLogsTab } from '@/tabs/AuditLogsTab';
import { DIDMappingsTab } from '@/tabs/DIDMappingsTab';
// import { BookingsTab } from '@/tabs/BookingsTab';
import { fetchClients, createClient, advanceClientStage } from '@/services/dashboardApi';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SoftphoneCallLogContext } from '@/services/linkusCallLog';

interface DashboardPageProps {
  session: UserSession;
  permissions: Permissions;
  onSignOut: () => Promise<void>;
}

export default function DashboardPage({ session, permissions, onSignOut }: DashboardPageProps) {
  const d = useDashboardData({ session });
  const { formatted: clockStr } = useLiveClock();
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
      if (key === 'agents') return permissions.canViewAgentsTab;
      if (key === 'agent-onboarding') return permissions.canViewAgentOnboardingTab;
      if (key === 'sip') return permissions.canViewSipTab;
      if (key === 'clients') return permissions.canViewClientsTab;
      if (key === 'did-mappings') return permissions.canManageDIDMappings;
      if (key === 'audit-logs') return permissions.canViewAuditLogs;
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

  // Resolve the email used to register with the Linkus softphone.
  //   • Agents  → use their record in the agents table (per-agent Yeastar extension)
  //   • Super admin → use VITE_YEASTAR_ADMIN_EMAIL if set (dedicated admin extension),
  //                   otherwise fall back to the Firebase login email
  //   • Other roles (client-admin, supervisor) → no softphone
  const adminExtEmail = (import.meta.env.VITE_YEASTAR_ADMIN_EMAIL as string | undefined)?.trim();

  let softphoneEmail: string | null = null;
  if (session.role === 'agent') {
    const currentAgent = d.agents.find((a) => a.userId === session.userId);
    softphoneEmail = currentAgent?.email ?? null;
  } else if (session.role === 'super-admin') {
    softphoneEmail = adminExtEmail || firebaseUser?.email || null;
  }

  const softphoneCallLogContext = useMemo((): SoftphoneCallLogContext | null => {
    if (!softphoneEmail) return null;
    const tid =
      session.tenantId ?? d.selectedTenant ?? d.tenants[0]?.id ?? null;
    if (!tid) return null;
    const tenant = d.tenants.find((t) => t.id === tid);
    const agent = d.agents.find((a) => a.userId === session.userId);
    const qid = agent?.queueIds?.[0] ?? 'unknown';
    const queue = d.queues.find((q) => q.id === qid);
    return {
      tenantId: tid,
      tenantName: tenant?.name ?? tid,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? session.displayName,
      queueId: qid,
      queueName: queue?.name ?? 'Queue',
    };
  }, [
    softphoneEmail,
    session.tenantId,
    session.userId,
    session.displayName,
    d.selectedTenant,
    d.tenants,
    d.agents,
    d.queues,
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950">
      {/* Floating softphone widget — visible for agents and super admins */}
      <SoftphoneWidget
        agentEmail={softphoneEmail}
        callLogContext={softphoneCallLogContext}
      />

      {/* Sidebar */}
      <DashboardSidebar
        selectedTab={d.selectedTab}
        onSelect={handleSelectTab}
        permissions={permissions}
        displayName={session.displayName}
        currentRole={session.role}
        onSignOut={onSignOut}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <DashboardHeader connectionStatus={d.connectionStatus} clockStr={clockStr} />

        {/* Scrollable tab content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
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
              {d.selectedTab === 'agent-onboarding' && (
                <AgentOnboardingTab
                  agentOnboarding={d.agentOnboarding}
                  permissions={permissions}
                  onRefresh={d.refresh}
                />
              )}
              {d.selectedTab === 'calls' && (
                <CallsTab
                  calls={d.calls}
                  queues={d.queues}
                  tenants={d.tenants}
                  permissions={permissions}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
