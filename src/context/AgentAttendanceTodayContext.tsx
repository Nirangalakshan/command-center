import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AgentAttendanceEventRow } from "@/services/attendanceApi";
import { fetchAttendanceEventsForDay, subscribeToMyAttendanceEvents } from "@/services/attendanceApi";
import { supabase } from "@/integrations/supabase/client";
import { getAustralianDateKey } from "@/utils/australianTime";

export type AgentAttendanceTodayContextValue = {
  /** Melbourne yyyy-MM-dd for `now`. */
  todayKey: string;
  todayEvents: AgentAttendanceEventRow[];
  todayLoading: boolean;
  todayError: string | null;
  supabaseUserId: string | null | undefined;
  /** Full reload with loading state (e.g. first paint). */
  refreshToday: () => Promise<void>;
  /**
   * Re-fetch today after clock in/out from navbar or attendance tab.
   * Keeps both UIs aligned if realtime is slow.
   */
  touchToday: () => Promise<void>;
};

const AgentAttendanceTodayContext = createContext<AgentAttendanceTodayContextValue | null>(null);

/**
 * Single source of truth for an agent’s **Melbourne today** attendance events.
 * Wrap dashboard main column so the header strip and Attendance tab stay in sync.
 */
export function AgentAttendanceTodayProvider({ now, children }: { now: number; children: ReactNode }) {
  const todayKey = useMemo(() => getAustralianDateKey(now), [now]);
  const [todayEvents, setTodayEvents] = useState<AgentAttendanceEventRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSupabaseUserId(s?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSupabaseUserId(s?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshToday = useCallback(async () => {
    if (supabaseUserId === undefined) return;
    if (supabaseUserId === null) {
      setTodayLoading(false);
      return;
    }
    setTodayLoading(true);
    setTodayError(null);
    try {
      const rows = await fetchAttendanceEventsForDay(supabaseUserId, todayKey);
      setTodayEvents(rows);
    } catch (e: unknown) {
      setTodayError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setTodayLoading(false);
    }
  }, [supabaseUserId, todayKey]);

  const touchToday = useCallback(async () => {
    if (supabaseUserId === undefined || supabaseUserId === null) return;
    setTodayError(null);
    try {
      const rows = await fetchAttendanceEventsForDay(supabaseUserId, todayKey);
      setTodayEvents(rows);
    } catch (e: unknown) {
      setTodayError(e instanceof Error ? e.message : "Could not load attendance.");
    }
  }, [supabaseUserId, todayKey]);

  useEffect(() => {
    void refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if (!supabaseUserId) return;
    const vk = todayKey;
    return subscribeToMyAttendanceEvents(
      supabaseUserId,
      (row) => {
        const rowDay = getAustralianDateKey(new Date(row.occurred_at).getTime());
        if (rowDay !== vk) return;
        setTodayEvents((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev;
          return [...prev, row].sort(
            (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
          );
        });
      },
      "melbourne-today",
    );
  }, [supabaseUserId, todayKey]);

  const value = useMemo(
    () => ({
      todayKey,
      todayEvents,
      todayLoading,
      todayError,
      supabaseUserId,
      refreshToday,
      touchToday,
    }),
    [todayKey, todayEvents, todayLoading, todayError, supabaseUserId, refreshToday, touchToday],
  );

  return (
    <AgentAttendanceTodayContext.Provider value={value}>{children}</AgentAttendanceTodayContext.Provider>
  );
}

export function useAgentAttendanceToday(): AgentAttendanceTodayContextValue {
  const v = useContext(AgentAttendanceTodayContext);
  if (!v) {
    throw new Error("useAgentAttendanceToday must be used inside AgentAttendanceTodayProvider");
  }
  return v;
}
