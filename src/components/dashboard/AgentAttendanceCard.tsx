import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserSession } from "@/services/types";
import { useAgentAttendanceToday } from "@/context/AgentAttendanceTodayContext";
import { formatDuration } from "@/utils/formatters";
import {
  addAustralianCalendarDays,
  endOfAustralianDayMs,
  formatAustralianDayHeading,
  formatAustralianDayShort,
  formatTimeAu,
  getAustralianDateKey,
} from "@/utils/australianTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LiveDot } from "@/components/dashboard/LiveDot";
import {
  buildAttendanceDaySegments,
  computeWorkedAndBreakMs,
  deriveAttendanceShiftStatus,
  fetchAttendanceEventsForDay,
  insertAttendanceEvent,
  subscribeToMyAttendanceEvents,
  type AgentAttendanceEventRow,
  type AttendanceEventType,
} from "@/services/attendanceApi";
import { ChevronLeft, ChevronRight, Coffee, LogIn, LogOut, Timer } from "lucide-react";

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
  const { supabaseUserId, todayKey, todayEvents, todayLoading, todayError, touchToday } =
    useAgentAttendanceToday();
  const [pastEvents, setPastEvents] = useState<AgentAttendanceEventRow[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewDayKey, setViewDayKey] = useState(() => getAustralianDateKey(now));

  const isViewingToday = viewDayKey === todayKey;
  /** For past days, cap open-shift math at end of that Melbourne calendar day. */
  const segmentNowMs = isViewingToday ? now : endOfAustralianDayMs(viewDayKey);

  const events = isViewingToday ? todayEvents : pastEvents;
  const loading = isViewingToday ? todayLoading : pastLoading;
  const fetchError = isViewingToday ? todayError : pastError;

  const reloadPast = useCallback(async () => {
    if (supabaseUserId === undefined || supabaseUserId === null) return;
    setPastLoading(true);
    setPastError(null);
    try {
      const rows = await fetchAttendanceEventsForDay(supabaseUserId, viewDayKey);
      setPastEvents(rows);
    } catch (e: unknown) {
      setPastError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setPastLoading(false);
    }
  }, [supabaseUserId, viewDayKey]);

  useEffect(() => {
    if (isViewingToday) return;
    void reloadPast();
  }, [isViewingToday, reloadPast]);

  useEffect(() => {
    if (!supabaseUserId || isViewingToday) return;
    const vk = viewDayKey;
    return subscribeToMyAttendanceEvents(
      supabaseUserId,
      (row) => {
        const rowDay = getAustralianDateKey(new Date(row.occurred_at).getTime());
        if (rowDay !== vk) return;
        setPastEvents((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev;
          return [...prev, row].sort(
            (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
          );
        });
      },
      `past-${vk}`,
    );
  }, [supabaseUserId, isViewingToday, viewDayKey]);

  const { status, shiftStartedAt, breakStartedAt } = useMemo(
    () => deriveAttendanceShiftStatus(events),
    [events],
  );

  const { workedMs, breakMs } = useMemo(
    () => computeWorkedAndBreakMs(events, segmentNowMs),
    [events, segmentNowMs],
  );

  const segments = useMemo(
    () => buildAttendanceDaySegments(events, segmentNowMs),
    [events, segmentNowMs],
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
    setMutationError(null);
    try {
      await insertAttendanceEvent(eventType, {
        userId: uid,
        tenantId: session.tenantId,
        displayName: session.displayName,
      });
      await touchToday();
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

  const onClockIn = () => void fireEvent("clock_in");

  const onTakeBreak = () => void fireEvent("break_start");

  const onEndBreak = () => void fireEvent("break_end");

  const onClockOut = async () => {
    setSubmitting(true);
    setMutationError(null);
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
      await touchToday();
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = mutationError ?? fetchError;

  return (
    <Card className="cc-fade-in border-border/80 bg-gradient-to-br from-white via-white to-emerald-50/30 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-700">
                Attendance
              </div>
              <CardTitle className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950">
                <Timer className="h-5 w-5 shrink-0 text-emerald-600" />
                Shifts by day
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Previous day"
                onClick={() => setViewDayKey((k) => addAustralianCalendarDays(k, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">
                  {formatAustralianDayHeading(viewDayKey)}
                </span>
                <input
                  type="date"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                  value={viewDayKey}
                  max={todayKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setViewDayKey(v);
                  }}
                  aria-label="Pick a date"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Next day"
                disabled={viewDayKey >= todayKey}
                onClick={() => {
                  if (viewDayKey >= todayKey) return;
                  setViewDayKey((k) => addAustralianCalendarDays(k, 1));
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isViewingToday && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={() => setViewDayKey(getAustralianDateKey(now))}
                >
                  Today
                </Button>
              )}
            </div>
          </div>
          {isViewingToday ? (
            <div
              className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-border/60"
              style={{ color: status === "off_clock" ? "#475569" : undefined }}
            >
              <LiveDot color={statusDotColor(status)} />
              {statusLabel(status)}
            </div>
          ) : (
            <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
              Viewing history
            </div>
          )}
        </div>
        {isViewingToday && (shiftStartedAt || breakStartedAt) && (
          <div className="font-mono text-xs text-muted-foreground">
            {status === "on_break" && breakStartedAt
              ? `Break since ${formatTimeAu(new Date(breakStartedAt))}`
              : shiftStartedAt
                ? `Shift since ${formatTimeAu(new Date(shiftStartedAt))}`
                : null}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        {displayError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {displayError}
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

        {!isViewingToday && (
          <p className="text-xs text-muted-foreground">
            Clock in / out and breaks are only available when today is selected.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {!isViewingToday ? (
            <>
              <Button type="button" size="sm" className="gap-1.5" disabled>
                <LogIn className="h-4 w-4" />
                Clock in
              </Button>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled>
                <LogOut className="h-4 w-4" />
                Clock out
              </Button>
            </>
          ) : (
            <>
              {status === "off_clock" ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={submitting || loading}
                  onClick={onClockIn}
                >
                  <LogIn className="h-4 w-4" />
                  Clock in
                </Button>
              ) : status === "working" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={submitting || loading}
                  onClick={onTakeBreak}
                >
                  <Coffee className="h-4 w-4" />
                  Take break
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={submitting || loading}
                  onClick={onEndBreak}
                >
                  <LogIn className="h-4 w-4" />
                  Clock in
                </Button>
              )}
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
            </>
          )}
        </div>

        <div className="rounded-xl border border-border/80 bg-white shadow-sm">
          <div className="border-b border-border/60 bg-slate-50/80 px-4 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Shifts · {formatAustralianDayShort(viewDayKey)}
            </div>
          </div>
          {loading && events.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : segments.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {isViewingToday
                ? "Clock in to see clock in, clock out, breaks, and working hours in the table below."
                : "No attendance recorded for this day."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Clock in
                    </TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Clock out
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Break
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Working hours
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments.map((seg, i) => (
                    <TableRow key={`${seg.clockInMs}-${i}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatTimeAu(new Date(seg.clockInMs))}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {seg.clockOutMs == null ? (
                          <span className="text-amber-700">Open</span>
                        ) : (
                          formatTimeAu(new Date(seg.clockOutMs))
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-amber-800/90">
                        {seg.breakMs > 0 ? formatDuration(seg.breakMs) : "0:00"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium text-emerald-800">
                        {seg.workedMs > 0 ? formatDuration(seg.workedMs) : "0:00"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border/80 bg-slate-50/60 font-medium hover:bg-slate-50/60">
                    <TableCell colSpan={3} className="text-right text-sm text-slate-700">
                      Totals · {formatAustralianDayShort(viewDayKey)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-800/90">
                      {breakMs > 0 ? formatDuration(breakMs) : "0:00"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-800">
                      {workedMs > 0 ? formatDuration(workedMs) : "0:00"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
