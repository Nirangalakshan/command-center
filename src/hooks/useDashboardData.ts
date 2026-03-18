import { useState, useEffect, useCallback } from 'react';
import type {
  Tenant, Queue, Agent, Call, SipLine,
  DashboardSummary, UserSession, ConnectionStatus,
  AgentGroup, IncomingCall, AgentOnboarding,
} from '@/services/types';
import {
  fetchTenants, fetchSummary,
  fetchQueues, fetchAgents, fetchCalls, fetchSipLines,
  fetchAgentGroups, fetchIncomingCalls,
} from '@/services/dashboardApi';
import { fetchAgentOnboarding } from '@/services/agentOnboardingApi';

const POLL_INTERVAL = 8000;

export interface DashboardData {
  selectedTenant: string | null;
  setSelectedTenant: (id: string | null) => void;
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
  connectionStatus: ConnectionStatus;
  tenants: Tenant[];
  summary: DashboardSummary | null;
  queues: Queue[];
  agents: Agent[];
  calls: Call[];
  sipLines: SipLine[];
  agentGroups: AgentGroup[];
  agentOnboarding: AgentOnboarding[];
  incomingCalls: IncomingCall[];
  loading: boolean;
  error: string | null;
  now: number;
  refresh: () => void;
}

interface UseDashboardDataProps {
  session: UserSession | null;
}

export function useDashboardData({ session }: UseDashboardDataProps): DashboardData {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [sipLines, setSipLines] = useState<SipLine[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroup[]>([]);
  const [agentOnboarding, setAgentOnboarding] = useState<AgentOnboarding[]>([]);
  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Set tenant from session
  useEffect(() => {
    if (session?.tenantId) {
      setSelectedTenant(session.tenantId);
    }
  }, [session?.tenantId]);

  // Live timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const effectiveTenant = session?.tenantId || selectedTenant;

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const tid = effectiveTenant || null;
      const isAgent = session.role === 'agent';
      const [t, s, q, a, c, sl, ag, ic, ao] = await Promise.all([
        fetchTenants(),
        fetchSummary(tid),
        fetchQueues(tid),
        fetchAgents(tid),
        fetchCalls(tid),
        fetchSipLines(tid),
        fetchAgentGroups(tid),
        isAgent ? fetchIncomingCalls(session.allowedQueueIds) : Promise.resolve([]),
        fetchAgentOnboarding(tid),
      ]);
      setTenants(t);
      setSummary(s);
      setQueues(q);
      setAgents(a);
      setCalls(c);
      setSipLines(sl);
      setAgentGroups(ag);
      setIncomingCalls(ic);
      setAgentOnboarding(ao);
      setConnectionStatus('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
    }
  }, [effectiveTenant, session]);

  useEffect(() => {
    if (session) {
      setLoading(true);
      loadData();
    }
  }, [loadData, session]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData, session]);

  return {
    selectedTenant: effectiveTenant,
    setSelectedTenant,
    selectedTab,
    setSelectedTab,
    connectionStatus,
    tenants,
    summary,
    queues,
    agents,
    calls,
    sipLines,
    agentGroups,
    incomingCalls,
    loading,
    error,
    now,
    refresh: loadData,
  };
}
