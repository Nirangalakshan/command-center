import '@/styles/dashboard.css';

import { useState, useCallback } from 'react';
import type { TabDef, TenantOnboarding, NewClientForm, UserSession, Permissions } from '@/services/types';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLiveClock } from '@/hooks/useLiveClock';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OverviewTab } from '@/tabs/OverviewTab';
import { AgentsTab } from '@/tabs/AgentsTab';
import { CallsTab } from '@/tabs/CallsTab';
import { SipLinesTab } from '@/tabs/SipLinesTab';
import { ClientsTab } from '@/tabs/ClientsTab';
import { AgentOnboardingTab } from '@/tabs/AgentOnboardingTab';
import { fetchClients, createClient, advanceClientStage } from '@/services/dashboardApi';
import { useEffect } from 'react';

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: '◉' },
  { key: 'agents', label: 'Agents', icon: '◎' },
  { key: 'agent-onboarding', label: 'Agent Onboarding', icon: '⊕' },
  { key: 'calls', label: 'Calls', icon: '◈' },
  { key: 'sip', label: 'SIP Lines', icon: '◇' },
  { key: 'clients', label: 'Clients', icon: '◆' },
];

interface DashboardPageProps {
  session: UserSession;
  permissions: Permissions;
  onSignOut: () => Promise<void>;
}

export default function DashboardPage({ session, permissions, onSignOut }: DashboardPageProps) {
  const d = useDashboardData({ session });
  const { formatted: clockStr } = useLiveClock();
  const [clients, setClients] = useState<TenantOnboarding[]>([]);

  useEffect(() => {
    fetchClients(d.selectedTenant).then(setClients).catch(() => {});
  }, [d.selectedTenant]);

  const handleCreateClient = useCallback(async (data: NewClientForm) => {
    if (!session) return;
    await createClient(data, session.userId);
    const updated = await fetchClients(d.selectedTenant);
    setClients(updated);
  }, [session, d.selectedTenant]);

  const handleAdvanceStage = useCallback(async (clientId: string) => {
    await advanceClientStage(clientId);
    const updated = await fetchClients(d.selectedTenant);
    setClients(updated);
  }, [d.selectedTenant]);

  return (
    <div className="cc-root">
      <DashboardHeader
        tenants={d.tenants}
        selectedTenant={d.selectedTenant}
        onSelectTenant={d.setSelectedTenant}
        connectionStatus={d.connectionStatus}
        clockStr={clockStr}
        permissions={permissions}
        displayName={session.displayName}
        currentRole={session.role}
        onSignOut={onSignOut}
      />

      <DashboardTabs
        tabs={TABS}
        selectedTab={d.selectedTab}
        onSelect={d.setSelectedTab}
        permissions={permissions}
      />

      <main className="cc-main">
        {d.error && (
          <div className="cc-error-banner">
            <span>⚠ {d.error}</span>
            <button className="cc-error-retry" onClick={d.refresh}>Retry</button>
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
              />
            )}
            {d.selectedTab === 'agent-onboarding' && (
              <AgentOnboardingTab
                agentOnboarding={d.agentOnboarding}
                tenants={d.tenants}
                queues={d.queues}
                agentGroups={d.agentGroups}
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
          </>
        )}
      </main>
    </div>
  );
}
