import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserSession } from "@/services/types";
import { formatDuration } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveDot } from "@/components/dashboard/LiveDot";
import {
  computeWorkedAndBreakMs,
  deriveAttendanceShiftStatus,
  fetchAttendanceEventsForDay,
  insertAttendanceEvent,
  subscribeToMyAttendanceEvents,
  type AgentAttendanceEventRow,
  type AttendanceEventType,
} from "@/services/attendanceApi";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Coffee, LogIn, LogOut, Timer } from "lucide-react";

interface AgentAttendanceCardProps {
  session: UserSession;
  now: number;
}

function statusLabel(status: string): string {
  switch (status) {
    case "working":
      return "Working";
    case "on_break":
      return "On break";
    default:
      return "Off shift";
  }
}

function statusDotColor(status: string): string {
  switch (status) {
    case "working":
      return "var(--cc-color-green)";
    case "on_break":
      return "var(--cc-color-amber)";
    default:
      return "var(--cc-color-slate, #94a3b8)";
  }
}

export function AgentAttendanceCard({ session, now }: AgentAttendanceCardProps) {
  const [events, setEvents] = useState<AgentAttendanceEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null | undefined>(undefined);

  const dayKey = format(new Date(now), "yyyy-MM-dd");

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

  const reload = useCallback(async () => {
    if (supabaseUserId === undefined) return;
    if (supabaseUserId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAttendanceEventsForDay(supabaseUserId, new Date());
      setEvents(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, [supabaseUserId]);

  useEffect(() => {
    void reload();
  }, [reload, dayKey]);

  useEffect(() => {
    if (!supabaseUserId) return;
    return subscribeToMyAttendanceEvents(supabaseUserId, (row) => {
      setEvents((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev;
        return [...prev, row].sort(
          (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
        );
      });
    });
  }, [supabaseUserId]);

  const { status, shiftStartedAt, breakStartedAt } = useMemo(
    () => deriveAttendanceShiftStatus(events),
    [events],
  );

  const { workedMs, breakMs } = useMemo(
    () => computeWorkedAndBreakMs(events, now),
    [events, now],
  );

  if (supabaseUserId === undefined) {
    return (
      <Card className="border-border/80 bg-white/80 shadow-sm">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading attendance…
        </CardContent>
      </Card>
    );
  }

  if (supabaseUserId === null) {
    return (
      <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-amber-950">Attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-amber-900/90">
          <p>
            No Supabase session detected. Sign in with your <strong>Command Centre email and password</strong> (the
            same one used for this dashboard) so attendance can be saved.
          </p>
          <p className="text-amber-900/80">
            If you only use a legacy Firebase-only agent login, ask your admin to provision a dashboard account and
            link it to your agent profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  const uid = supabaseUserId;

  const fireEvent = async (eventType: AttendanceEventType) => {
    setSubmitting(true);
    setError(null);
    try {
      await insertAttendanceEvent(eventType, {
        userId: uid,
        tenantId: session.tenantId,
        displayName: session.displayName,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

  const onClockIn = () => void fireEvent("clock_in");

  const onTakeBreak = () => void fireEvent("break_start");

  const onEndBreak = () => void fireEvent("break_end");

  const onClockOut = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { status: s } = deriveAttendanceShiftStatus(events);
      if (s === "on_break") {
        await insertAttendanceEvent("break_end", {
          userId: uid,
          tenantId: session.tenantId,
          displayName: session.displayName,
        });
      }
      await insertAttendanceEvent("clock_out", {
        userId: uid,
        tenantId: session.tenantId,
        displayName: session.displayName,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="cc-fade-in border-border/80 bg-gradient-to-br from-white via-white to-emerald-50/30 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-700">
              Attendance
            </div>
            <CardTitle className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950">
              <Timer className="h-5 w-5 text-emerald-600" />
              Today · {format(new Date(now), "EEE d MMM")}
            </CardTitle>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-border/60"
            style={{ color: status === "off_clock" ? "#475569" : undefined }}
          >
            <LiveDot color={statusDotColor(status)} />
            {statusLabel(status)}
          </div>
        </div>
        {(shiftStartedAt || breakStartedAt) && (
          <div className="font-mono text-xs text-muted-foreground">
            {status === "on_break" && breakStartedAt
              ? `Break since ${format(new Date(breakStartedAt), "HH:mm")}`
              : shiftStartedAt
                ? `Shift since ${format(new Date(shiftStartedAt), "HH:mm")}`
                : null}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-white p-4 shadow-sm">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Worked (net)
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-emerald-700">
              {loading ? "…" : workedMs > 0 ? formatDuration(workedMs) : "0:00"}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-white p-4 shadow-sm">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Break time
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-amber-700">
              {loading ? "…" : breakMs > 0 ? formatDuration(breakMs) : "0:00"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={
              submitting || loading || status === "working" || status === "on_break"
            }
            onClick={onClockIn}
          >
            <LogIn className="h-4 w-4" />
            Clock in
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={submitting || loading || status !== "working"}
            onClick={onTakeBreak}
          >
            <Coffee className="h-4 w-4" />
            Take break
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={submitting || loading || status !== "on_break"}
            onClick={onEndBreak}
          >
            End break
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={submitting || loading || status === "off_clock"}
            onClick={() => void onClockOut()}
          >
            <LogOut className="h-4 w-4" />
            Clock out
          </Button>
        </div>

        {events.length > 0 && (
          <div className="rounded-xl border border-dashed border-border/80 bg-slate-50/50 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Log
            </div>
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-slate-700">
              {[...events]
                .sort(
                  (a, b) =>
                    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
                )
                .map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 font-mono">
                    <span className="text-muted-foreground">
                      {format(new Date(e.occurred_at), "HH:mm:ss")}
                    </span>
                    <span className="font-medium capitalize">
                      {e.event_type.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
