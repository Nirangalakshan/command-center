import { useState, useEffect, useCallback } from 'react';
import type {
  Tenant, Queue, Agent, Call, SipLine,
  DashboardSummary, UserSession, ConnectionStatus, UserRole,
  AgentGroup, IncomingCall,
} from '@/services/types';
import {
  fetchSession, fetchTenants, fetchSummary,
  fetchQueues, fetchAgents, fetchCalls, fetchSipLines,
  fetchAgentGroups, fetchIncomingCalls,
} from '@/services/dashboardApi';
import { getSessionByRole } from '@/services/mockSession';

const POLL_INTERVAL = 8000;

export interface DashboardData {
  session: UserSession | null;
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
  incomingCalls: IncomingCall[];
  loading: boolean;
  error: string | null;
  now: number;
  refresh: () => void;
  switchRole: (role: UserRole) => void;
}

export function useDashboardData(): DashboardData {
  const [session, setSession] = useState<UserSession | null>(null);
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
  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Live timer — ticks every second
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch session on mount
  useEffect(() => {
    fetchSession().then((s) => {
      setSession(s);
      if (s.tenantId) {
        setSelectedTenant(s.tenantId);
      }
    });
  }, []);

  // Effective tenant: respect session lock (agents with null tenantId see multi-tenant)
  const effectiveTenant = session?.tenantId || selectedTenant;

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const tid = effectiveTenant || null;
      const isAgent = session?.role === 'agent';
      const [t, s, q, a, c, sl, ag, ic] = await Promise.all([
        fetchTenants(),
        fetchSummary(tid),
        fetchQueues(tid),
        fetchAgents(tid),
        fetchCalls(tid),
        fetchSipLines(tid),
        fetchAgentGroups(tid),
        isAgent ? fetchIncomingCalls(session?.allowedQueueIds) : Promise.resolve([]),
      ]);
      setTenants(t);
      setSummary(s);
      setQueues(q);
      setAgents(a);
      setCalls(c);
      setSipLines(sl);
      setAgentGroups(ag);
      setIncomingCalls(ic);
      setConnectionStatus('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
    }
  }, [effectiveTenant, session?.role, session?.allowedQueueIds]);

  // Load on mount and when tenant changes
  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  const switchRole = useCallback((role: UserRole) => {
    const newSession = getSessionByRole(role);
    setSession(newSession);
    setSelectedTenant(newSession.tenantId);
    setSelectedTab('overview');
    setLoading(true);
  }, []);

  return {
    session,
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
    switchRole,
  };
}
