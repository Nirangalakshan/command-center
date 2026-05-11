import { useState, useEffect, useCallback } from "react";
import { isValidCallerNumber } from "@/utils/formatters";
import type {
  Tenant,
  Queue,
  Agent,
  Call,
  SipLine,
  DashboardSummary,
  UserSession,
  ConnectionStatus,
  AgentGroup,
  IncomingCall,
  AgentOnboarding,
} from "@/services/types";
import {
  fetchTenants,
  fetchSummary,
  fetchQueues,
  fetchAgents,
  fetchCalls,
  fetchSipLines,
  fetchAgentGroups,
  fetchIncomingCalls,
  subscribeToIncomingCalls,
  subscribeToAgents,
  subscribeToCalls,
} from "@/services/dashboardApi";
import { fetchAgentOnboarding } from "@/services/agentOnboardingApi";
import { DASHBOARD_REFRESH_REQUEST_EVENT } from "@/services/linkusCallLog";

const POLL_INTERVAL = 8000;
/** Full `loadData` on this schedule keeps supervisor boards fresh. Agents in CRM tabs rarely need it that often. */
const POLL_INTERVAL_AGENT_MS = 120_000;
const INCOMING_CALLS_STORAGE_KEY = "cc_incoming_calls";

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

export function useDashboardData({
  session,
}: UseDashboardDataProps): DashboardData {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connected");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [sipLines, setSipLines] = useState<SipLine[]>([]);
  const [agentGroups, setAgentGroups] = useState<AgentGroup[]>([]);
  const [agentOnboarding, setAgentOnboarding] = useState<AgentOnboarding[]>([]);
  // Restore incoming calls from sessionStorage if available (survives navigation)
  const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>(() => {
    try {
      const saved = sessionStorage.getItem(INCOMING_CALLS_STORAGE_KEY);
      // console.log("[useDashboardData] Init incomingCalls. Saved data:", saved);
      if (saved) return JSON.parse(saved) as IncomingCall[];
    } catch {
      // console.error(
      //   "[useDashboardData] Failed to parse saved incoming calls:",
      //   e,
      // );
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Keep sessionStorage in sync whenever incomingCalls changes
  useEffect(() => {
    try {
      // console.log(
      //   "[useDashboardData] incomingCalls changed:",
      //   incomingCalls.length,
      // );
      if (incomingCalls.length > 0) {
        sessionStorage.setItem(
          INCOMING_CALLS_STORAGE_KEY,
          JSON.stringify(incomingCalls),
        );
      } else {
        sessionStorage.removeItem(INCOMING_CALLS_STORAGE_KEY);
      }
    } catch {
      /* ignore quota errors */
    }
  }, [incomingCalls]);

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
      const isAgent = session.role === "agent";
      const [t, s, q, a, c, sl, ag, ic, ao] = await Promise.all([
        fetchTenants(),
        fetchSummary(tid),
        fetchQueues(tid),
        fetchAgents(tid),
        fetchCalls(tid),
        fetchSipLines(tid),
        fetchAgentGroups(tid),
        isAgent
          ? fetchIncomingCalls(session.allowedQueueIds)
          : Promise.resolve([]),
        fetchAgentOnboarding(tid),
      ]);
      setTenants(t);
      setSummary(s);
      setQueues(q);
      setAgents(a);
      setCalls(c);
      setSipLines(sl);
      setAgentGroups(ag);
      setAgentOnboarding(ao);
      setConnectionStatus("connected");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data",
      );
      setConnectionStatus("disconnected");
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
    const onRefresh = () => {
      void loadData();
    };
    window.addEventListener(DASHBOARD_REFRESH_REQUEST_EVENT, onRefresh);
    return () =>
      window.removeEventListener(DASHBOARD_REFRESH_REQUEST_EVENT, onRefresh);
  }, [session, loadData]);

  // Reconcile incoming calls against the CDR table. CDRs are the definitive
  // end-of-call signal — once `handleNewCdr` writes a row, the call is over
  // regardless of whether the browser heard the matching CallHangup
  // broadcast (e.g. because the dashboard was unmounted during navigation,
  // or Yeastar fires BYE without a corresponding CallHangup event).
  //
  // We try two match strategies:
  //   1. Exact callid match (`incoming-<id>` ↔ `yeastar-<id>`).
  //   2. Fuzzy match by tenant + caller number + time window — covers the
  //      case where Yeastar emits different callid formats between
  //      IncomingCall and NewCdr payloads.
  //
  // Clock-skew tolerance: `waitingSince` is set in the BROWSER when the
  // Supabase Realtime broadcast is received — always slightly later than
  // the actual PBX wall-clock start time. For short calls (caller hangs up
  // immediately), the CDR end_time (= PBX startTime + 0 s) can be *before*
  // waitingSince. We allow 90 s of skew so these calls are correctly evicted.
  useEffect(() => {
    setIncomingCalls((prev) => {
      if (prev.length === 0) return prev;
      const RING_MATCH_WINDOW_MS = 5 * 60_000; // 5 min
      // Allow up to 90 s of clock skew between PBX time and browser time.
      const CLOCK_SKEW_TOLERANCE_MS = 90_000;

      const fresh = prev.filter((ic) => {
        const callid = ic.id.replace(/^incoming-/, "");
        const normalizedIcCaller = (ic.callerNumber ?? "").replace(/\D/g, "");

        const cdrEndedAfter = (endTimeIso: string | null): boolean => {
          if (!endTimeIso) return false;
          const endMs = new Date(endTimeIso).getTime();
          if (!Number.isFinite(endMs)) return false;
          // Accept if CDR endTime >= (waitingSince - tolerance).
          // This handles short calls where PBX clock is behind browser clock.
          return endMs >= ic.waitingSince - CLOCK_SKEW_TOLERANCE_MS;
        };

        const directMatch = calls.find((c) => c.id === `yeastar-${callid}`);
        if (directMatch && cdrEndedAfter(directMatch.endTime)) {
          // console.log(
          //   `[useDashboardData] Evicting ${ic.id} (direct callid match) — ` +
          //     `CDR ended ${directMatch.endTime} (ring started ${new Date(ic.waitingSince).toISOString()})`,
          // );
          return false;
        }

        if (normalizedIcCaller) {
          const fuzzyMatch = calls.find((c) => {
            if (c.tenantId !== ic.tenantId) return false;
            if (!c.endTime) return false;
            const normalizedCdrCaller = (c.callerNumber ?? "").replace(
              /\D/g,
              "",
            );
            if (!normalizedCdrCaller) return false;
            // Phone-number suffix match (handles with/without country code).
            const sharesSuffix =
              normalizedCdrCaller.endsWith(normalizedIcCaller) ||
              normalizedIcCaller.endsWith(normalizedCdrCaller);
            if (!sharesSuffix) return false;
            const startMs = new Date(c.startTime).getTime();
            if (!Number.isFinite(startMs)) return false;
            // The CDR must belong to this specific ring — started within
            // a few minutes of waitingSince (either side, to tolerate
            // clock skew between the PBX and the browser).
            return Math.abs(startMs - ic.waitingSince) < RING_MATCH_WINDOW_MS;
          });
          if (fuzzyMatch && cdrEndedAfter(fuzzyMatch.endTime)) {
            // console.log(
            //   `[useDashboardData] Evicting ${ic.id} (caller+time match) — ` +
            //     `CDR ${fuzzyMatch.id} ended ${fuzzyMatch.endTime} ` +
            //     `(caller ${ic.callerNumber}, ring started ${new Date(ic.waitingSince).toISOString()})`,
            // );
            return false;
          }
        }

        return true;
      });
      return fresh.length === prev.length ? prev : fresh;
    });
  }, [calls]);

  // Evict stale incoming-call entries that have been sitting around for too
  // long (last-resort fallback in case Realtime events were dropped).
  // Reduced from 2 minutes to 45 seconds — the new BYE detection in the
  // webhook means legitimate long-ring calls are handled correctly and no
  // longer need a 2-minute grace period.
  const STALE_INCOMING_MS = 45_000; // 45 seconds
  useEffect(() => {
    setIncomingCalls((prev) => {
      if (prev.length === 0) return prev;
      const fresh = prev.filter((c) => {
        const age = now - c.waitingSince;
        const keep = age < STALE_INCOMING_MS;
        if (!keep) {
          // console.log(
          //   `[useDashboardData] Evicting stale call ${c.id}. Age: ${age}ms`,
          // );
        }
        return keep;
      });
      if (fresh.length !== prev.length) {
        // console.log(
        //   `[useDashboardData] Evicted ${prev.length - fresh.length} stale calls`,
        // );
      }
      return fresh.length === prev.length ? prev : fresh;
    });
  }, [now]);

  useEffect(() => {
    if (!session) return;
    const pollMs = session.role === "agent" ? POLL_INTERVAL_AGENT_MS : POLL_INTERVAL;
    const interval = setInterval(loadData, pollMs);

    // Real-time subscriptions
    const unsubCalls = subscribeToIncomingCalls(
      session.role === "super-admin" ? [] : session.allowedQueueIds,
      (call) => {
        // Drop internal extensions and numbers from unrecognised countries.
        // Accept: +94/94 (Sri Lanka), +61/61 (Australia), or local 0… numbers.
        const effectiveNumber = call.callerNumber;
        if (!isValidCallerNumber(effectiveNumber)) {
          // console.log(
          //   `[useDashboardData] Dropping call ${call.id} — unrecognised caller number: "${effectiveNumber}"`,
          // );
          return;
        }
        setIncomingCalls((prev) => {
          const existing = prev.find((c) => c.id === call.id);
          // Yeastar re-ring events often arrive without callfrom — preserve the
          // caller number and name from the first broadcast so they are never lost.
          const merged: IncomingCall =
            existing && !call.callerNumber && existing.callerNumber
              ? {
                  ...call,
                  callerNumber: existing.callerNumber,
                  callerName: call.callerName ?? existing.callerName,
                }
              : call;
          return [merged, ...prev.filter((c) => c.id !== call.id)];
        });
      },
      (callId) =>
        setIncomingCalls((prev) => prev.filter((c) => c.id !== callId)),
    );

    const unsubAgents = subscribeToAgents(effectiveTenant, loadData);
    const unsubCallLog = subscribeToCalls(effectiveTenant, loadData);

    return () => {
      clearInterval(interval);
      unsubCalls();
      unsubAgents();
      unsubCallLog();
    };
  }, [loadData, session, effectiveTenant]);

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
    loading,
    error,
    now,
    refresh: loadData,
  };
}
