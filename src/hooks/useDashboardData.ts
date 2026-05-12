import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTenants,
  fetchAgents,
  fetchQueues,
  fetchCalls,
  fetchSummary,
  fetchSipLines,
  fetchAgentGroups,
  subscribeToAgents,
  subscribeToCalls,
  subscribeToIncomingCalls,
} from "@/services/dashboardApi";
import { fetchAgentOnboarding } from "@/services/agentOnboardingApi";
import { isValidCallerNumber } from "@/utils/formatters";
import { 
  getAustralianDateKey, 
  attendanceDayRangeAustralianYmd 
} from "@/utils/australianTime";
import type {
  Tenant,
  Agent,
  Queue,
  Call,
  DashboardSummary,
  SipLine,
  AgentGroup,
  AgentOnboarding,
  IncomingCall,
  UserSession,
} from "@/services/types";

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

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
  callDate: string;
  setCallDate: (ymd: string) => void;
  refresh: () => void;
  pendingInternalChatAgentId: string | null;
  setPendingInternalChatAgentId: (id: string | null) => void;
  startInternalChat: (agentId: string) => void;
}

const POLL_INTERVAL = 8000;
const POLL_INTERVAL_AGENT_MS = 15000;
const INCOMING_CALLS_STORAGE_KEY = "cc_incoming_calls_v1";
const DASHBOARD_REFRESH_REQUEST_EVENT = "cc-dashboard-refresh-request";

interface UseDashboardDataProps {
  session: UserSession | null;
}

export function useDashboardData({
  session,
}: UseDashboardDataProps): DashboardData {
  const queryClient = useQueryClient();
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [callDate, setCallDate] = useState<string>(() => getAustralianDateKey(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [pendingInternalChatAgentId, setPendingInternalChatAgentId] = useState<string | null>(null);

  // Set tenant from session
  useEffect(() => {
    if (session?.tenantId) {
      setSelectedTenant(session.tenantId);
    }
  }, [session?.tenantId]);

  // Live timer for relative time displays (isolated to avoid re-fetching data)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const effectiveTenant = session?.tenantId || selectedTenant;
  const isAgent = session?.role === "agent";
  const refreshInterval = isAgent ? POLL_INTERVAL_AGENT_MS : POLL_INTERVAL;

  // --- React Query Definitions ---

  const { data: tenants = [], error: tenantsErr, isPending: isPendingTenants } = useQuery({
    queryKey: ["tenants"],
    queryFn: fetchTenants,
    enabled: !!session,
    staleTime: 60000,
  });

  const { data: agents = [], error: agentsErr, isPending: isPendingAgents } = useQuery({
    queryKey: ["agents", effectiveTenant],
    queryFn: () => fetchAgents(effectiveTenant),
    enabled: !!session,
    refetchInterval: refreshInterval,
  });

  const { data: queues = [], error: queuesErr, isPending: isPendingQueues } = useQuery({
    queryKey: ["queues", effectiveTenant],
    queryFn: () => fetchQueues(effectiveTenant),
    enabled: !!session,
    refetchInterval: refreshInterval,
  });

  const { data: calls = [], error: callsErr } = useQuery({
    queryKey: ["calls", effectiveTenant, callDate],
    queryFn: () => {
      const { startIso, endIso } = attendanceDayRangeAustralianYmd(callDate);
      return fetchCalls(effectiveTenant, 500, startIso, endIso);
    },
    enabled: !!session,
    refetchInterval: refreshInterval,
  });

  // Summary depends on agents, queues, and calls. 
  // We compute it using the already fetched data to avoid extra network requests.
  const { data: summary = null, error: summaryErr } = useQuery({
    queryKey: ["summary", effectiveTenant, callDate],
    queryFn: () => fetchSummary(effectiveTenant, { agents, queues, calls }),
    enabled: !!session && agents.length > 0,
  });

  const { data: sipLines = [], error: sipLinesErr } = useQuery({
    queryKey: ["sipLines", effectiveTenant],
    queryFn: () => fetchSipLines(effectiveTenant),
    enabled: !!session && !isAgent,
    refetchInterval: refreshInterval * 2,
  });

  const { data: agentGroups = [], error: agentGroupsErr } = useQuery({
    queryKey: ["agentGroups", effectiveTenant],
    queryFn: () => fetchAgentGroups(effectiveTenant),
    enabled: !!session,
    staleTime: 30000,
  });

  const { data: agentOnboarding = [], error: onboardingErr } = useQuery({
    queryKey: ["agentOnboarding", effectiveTenant],
    queryFn: () => fetchAgentOnboarding(effectiveTenant),
    enabled: !!session && !isAgent,
    staleTime: 60000,
  });

  // --- Incoming Calls Logic (Manual State) ---

  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>(() => {
    try {
      const saved = sessionStorage.getItem(INCOMING_CALLS_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as IncomingCall[];
    } catch { /* ignore */ }
    return [];
  });

  useEffect(() => {
    try {
      if (incomingCalls.length > 0) {
        sessionStorage.setItem(INCOMING_CALLS_STORAGE_KEY, JSON.stringify(incomingCalls));
      } else {
        sessionStorage.removeItem(INCOMING_CALLS_STORAGE_KEY);
      }
    } catch { /* ignore quota errors */ }
  }, [incomingCalls]);

  // Reconcile incoming calls against CDRs
  useEffect(() => {
    if (calls.length === 0 || incomingCalls.length === 0) return;
    
    setIncomingCalls((prev) => {
      const RING_MATCH_WINDOW_MS = 5 * 60_000;
      const CLOCK_SKEW_TOLERANCE_MS = 90_000;

      const fresh = prev.filter((ic) => {
        const callid = ic.id.replace(/^incoming-/, "");
        const normalizedIcCaller = (ic.callerNumber ?? "").replace(/\D/g, "");

        const cdrEndedAfter = (endTimeIso: string | null): boolean => {
          if (!endTimeIso) return false;
          const endMs = new Date(endTimeIso).getTime();
          return Number.isFinite(endMs) && endMs >= ic.waitingSince - CLOCK_SKEW_TOLERANCE_MS;
        };

        const directMatch = calls.find((c) => c.id === `yeastar-${callid}`);
        if (directMatch && cdrEndedAfter(directMatch.endTime)) return false;

        if (normalizedIcCaller) {
          const fuzzyMatch = calls.find((c) => {
            if (c.tenantId !== ic.tenantId || !c.endTime) return false;
            const normalizedCdrCaller = (c.callerNumber ?? "").replace(/\D/g, "");
            const sharesSuffix = normalizedCdrCaller.endsWith(normalizedIcCaller) || normalizedIcCaller.endsWith(normalizedCdrCaller);
            if (!sharesSuffix) return false;
            const startMs = new Date(c.startTime).getTime();
            return Number.isFinite(startMs) && Math.abs(startMs - ic.waitingSince) < RING_MATCH_WINDOW_MS;
          });
          if (fuzzyMatch && cdrEndedAfter(fuzzyMatch.endTime)) return false;
        }
        return true;
      });
      return fresh.length === prev.length ? prev : fresh;
    });
  }, [calls]);

  // Evict stale calls
  const STALE_INCOMING_MS = 45_000;
  useEffect(() => {
    if (incomingCalls.length === 0) return;
    setIncomingCalls((prev) => {
      const fresh = prev.filter((c) => (now - c.waitingSince) < STALE_INCOMING_MS);
      return fresh.length === prev.length ? prev : fresh;
    });
  }, [now]);

  // --- Subscriptions ---

  useEffect(() => {
    if (!session) return;

    const unsubCalls = subscribeToIncomingCalls(
      session.role === "super-admin" ? [] : session.allowedQueueIds,
      (call) => {
        if (!isValidCallerNumber(call.callerNumber)) return;
        setIncomingCalls((prev) => {
          const existing = prev.find((c) => c.id === call.id);
          const merged: IncomingCall = existing && !call.callerNumber && existing.callerNumber
            ? { ...call, callerNumber: existing.callerNumber, callerName: call.callerName ?? existing.callerName }
            : call;
          return [merged, ...prev.filter((c) => c.id !== call.id)];
        });
      },
      (callId) => setIncomingCalls((prev) => prev.filter((c) => c.id !== callId)),
    );

    const triggerRefetch = () => {
      queryClient.invalidateQueries({ queryKey: ["agents", effectiveTenant] });
      queryClient.invalidateQueries({ queryKey: ["calls", effectiveTenant] });
      queryClient.invalidateQueries({ queryKey: ["queues", effectiveTenant] });
      queryClient.invalidateQueries({ queryKey: ["summary", effectiveTenant] });
    };

    const unsubAgents = subscribeToAgents(effectiveTenant, triggerRefetch);
    const unsubCallLog = subscribeToCalls(effectiveTenant, triggerRefetch);

    return () => {
      unsubCalls();
      unsubAgents();
      unsubCallLog();
    };
  }, [session, effectiveTenant, queryClient]);

  // Handle manual refresh requests
  useEffect(() => {
    if (!session) return;
    const onRefresh = () => {
      queryClient.invalidateQueries();
    };
    window.addEventListener(DASHBOARD_REFRESH_REQUEST_EVENT, onRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_REQUEST_EVENT, onRefresh);
  }, [session, queryClient]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  const startInternalChat = useCallback((agentId: string) => {
    setPendingInternalChatAgentId(agentId);
    setSelectedTab("chat");
  }, []);

  // Derive loading and error states
  const isInitialLoading = !session || (isPendingTenants && isPendingAgents && isPendingQueues);
  const error = (tenantsErr || agentsErr || queuesErr || callsErr || summaryErr)?.toString() || null;
  const connectionStatus: ConnectionStatus = error ? "disconnected" : "connected";

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
    agentOnboarding,
    incomingCalls,
    loading: isInitialLoading,
    error,
    now,
    callDate,
    setCallDate,
    refresh,
    pendingInternalChatAgentId,
    setPendingInternalChatAgentId,
    startInternalChat,
  };
}
