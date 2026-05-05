import { useState } from "react";
import type { UserSession } from "@/services/types";
import { Button } from "@/components/ui/button";
import { LiveDot } from "@/components/dashboard/LiveDot";
import { deriveAttendanceShiftStatus, insertAttendanceEvent, type AttendanceEventType } from "@/services/attendanceApi";
import { useAgentAttendanceToday } from "@/context/AgentAttendanceTodayContext";
import { Coffee, LogIn, LogOut, Timer } from "lucide-react";

interface AgentNavAttendanceActionsProps {
  session: UserSession;
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

function statusLabel(status: string): string {
  switch (status) {
    case "working":
      return "On shift";
    case "on_break":
      return "Break";
    default:
      return "Off shift";
  }
}

/**
 * Compact clock in / break / clock out for the top bar (Melbourne “today” only).
 */
export function AgentNavAttendanceActions({ session }: AgentNavAttendanceActionsProps) {
  const { supabaseUserId, todayEvents, todayLoading, todayError, touchToday } = useAgentAttendanceToday();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const events = todayEvents;
  const loading = todayLoading;

  if (supabaseUserId === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Timer className="h-4 w-4 shrink-0" />
        Attendance…
      </div>
    );
  }

  if (supabaseUserId === null) {
    return (
      <div className="max-w-[200px] text-[11px] leading-snug text-amber-800" title="Use Command Centre email and password so Supabase session is active.">
        <span className="font-medium">Attendance</span>: sign in with your dashboard account to clock in here.
      </div>
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
      await touchToday();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

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
      await touchToday();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  };

  const { status } = deriveAttendanceShiftStatus(events);
  const bannerError = error ?? todayError;

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Shift</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
          title="Melbourne today"
        >
          <LiveDot color={statusDotColor(status)} />
          {loading && events.length === 0 ? "…" : statusLabel(status)}
        </span>
      </div>
      {bannerError ? (
        <span className="text-[11px] text-rose-700 sm:max-w-[220px] sm:truncate" title={bannerError}>
          {bannerError}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {status === "off_clock" ? (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={submitting || loading}
            onClick={() => void fireEvent("clock_in")}
          >
            <LogIn className="h-3.5 w-3.5" />
            Clock in
          </Button>
        ) : status === "working" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={submitting || loading}
            onClick={() => void fireEvent("break_start")}
          >
            <Coffee className="h-3.5 w-3.5" />
            Break
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            disabled={submitting || loading}
            onClick={() => void fireEvent("break_end")}
          >
            <LogIn className="h-3.5 w-3.5" />
            End break
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 px-2.5 text-xs"
          disabled={submitting || loading || status === "off_clock"}
          onClick={() => void onClockOut()}
        >
          <LogOut className="h-3.5 w-3.5" />
          Clock out
        </Button>
      </div>
    </div>
  );
}
