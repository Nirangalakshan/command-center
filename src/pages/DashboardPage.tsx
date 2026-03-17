import '@/styles/dashboard.css';

import { useState, useCallback } from 'react';
import type { TabDef, TenantOnboarding, NewClientForm } from '@/services/types';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLiveClock } from '@/hooks/useLiveClock';
import { usePermissions } from '@/hooks/usePermissions';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { OverviewTab } from '@/tabs/OverviewTab';
import { AgentsTab } from '@/tabs/AgentsTab';
import { CallsTab } from '@/tabs/CallsTab';
import { SipLinesTab } from '@/tabs/SipLinesTab';
import { ClientsTab } from '@/tabs/ClientsTab';
import { fetchClients, createClient, advanceClientStage } from '@/services/dashboardApi';
import { useEffect } from 'react';

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: '◉' },
  { key: 'agents', label: 'Agents', icon: '◎' },
  { key: 'calls', label: 'Calls', icon: '◈' },
  { key: 'sip', label: 'SIP Lines', icon: '◇' },
  { key: 'clients', label: 'Clients', icon: '◆' },
];

export default function DashboardPage() {
  const d = useDashboardData();
  const { formatted: clockStr } = useLiveClock();
  const permissions = usePermissions(d.session);
  const [clients, setClients] = useState<TenantOnboarding[]>([]);

  useEffect(() => {
    fetchClients(d.selectedTenant).then(setClients);
  }, [d.selectedTenant]);

  const handleCreateClient = useCallback(async (data: NewClientForm) => {
    if (!d.session) return;
    await createClient(data, d.session.userId);
    const updated = await fetchClients(d.selectedTenant);
    setClients(updated);
  }, [d.session, d.selectedTenant]);

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
        displayName={d.session?.displayName || ''}
        currentRole={d.session?.role || 'super-admin'}
        onRoleChange={d.switchRole}
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
                session={d.session}
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
