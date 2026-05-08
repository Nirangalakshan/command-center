import { endOfDay, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { AgentShiftSchedule } from "./types";

export const ATTENDANCE_EVENT_TYPES = [
  "clock_in",
  "break_start",
  "break_end",
  "clock_out",
] as const;

export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export type AgentAttendanceEventRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  agent_display_name: string | null;
  event_type: string;
  occurred_at: string;
  created_at: string;
};

export type AttendanceShiftStatus = "off_clock" | "working" | "on_break";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupabaseAuthUserId(id: string | null | undefined): boolean {
  if (!id) return false;
  return UUID_RE.test(id);
}

export function attendanceDayRange(day: Date): { startIso: string; endIso: string } {
  return {
    startIso: startOfDay(day).toISOString(),
    endIso: endOfDay(day).toISOString(),
  };
}

export function deriveAttendanceShiftStatus(
  events: Pick<AgentAttendanceEventRow, "event_type" | "occurred_at">[],
): {
  status: AttendanceShiftStatus;
  shiftStartedAt: number | null;
  breakStartedAt: number | null;
} {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  let status: AttendanceShiftStatus = "off_clock";
  let shiftStartedAt: number | null = null;
  let breakStartedAt: number | null = null;

  for (const e of sorted) {
    const t = new Date(e.occurred_at).getTime();
    switch (e.event_type) {
      case "clock_in":
        status = "working";
        shiftStartedAt = t;
        breakStartedAt = null;
        break;
      case "break_start":
        if (status === "working") {
          status = "on_break";
          breakStartedAt = t;
        }
        break;
      case "break_end":
        if (status === "on_break") {
          status = "working";
          breakStartedAt = null;
        }
        break;
      case "clock_out":
        status = "off_clock";
        shiftStartedAt = null;
        breakStartedAt = null;
        break;
      default:
        break;
    }
  }

  return { status, shiftStartedAt, breakStartedAt };
}

/** Worked time excludes active break; includes in-progress work segment to `nowMs`. */
export function computeWorkedAndBreakMs(
  events: Pick<AgentAttendanceEventRow, "event_type" | "occurred_at">[],
  nowMs: number,
): { workedMs: number; breakMs: number } {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  let worked = 0;
  let onBreak = 0;
  let shiftOpen = false;
  let workSegmentStart: number | null = null;
  let breakStart: number | null = null;

  const closeWorkTo = (t: number) => {
    if (workSegmentStart !== null) {
      worked += t - workSegmentStart;
      workSegmentStart = null;
    }
  };

  for (const e of sorted) {
    const t = new Date(e.occurred_at).getTime();
    switch (e.event_type) {
      case "clock_in":
        shiftOpen = true;
        workSegmentStart = t;
        breakStart = null;
        break;
      case "break_start":
        if (shiftOpen && workSegmentStart !== null) {
          closeWorkTo(t);
          breakStart = t;
        }
        break;
      case "break_end":
        if (breakStart !== null) {
          onBreak += t - breakStart;
          breakStart = null;
          workSegmentStart = t;
        }
        break;
      case "clock_out":
        if (breakStart !== null) {
          onBreak += t - breakStart;
          breakStart = null;
        }
        closeWorkTo(t);
        shiftOpen = false;
        break;
      default:
        break;
    }
  }

  if (shiftOpen) {
    if (breakStart !== null) {
      onBreak += nowMs - breakStart;
    } else if (workSegmentStart !== null) {
      worked += nowMs - workSegmentStart;
    }
  }

  return { workedMs: worked, breakMs: onBreak };
}

/** One row per clock_in → clock_out (or open shift to `nowMs`). */
export type AttendanceDaySegment = {
  clockInMs: number;
  clockOutMs: number | null;
  breakMs: number;
  workedMs: number;
};

/**
 * Build shift segments for a single day from events. Each segment starts at `clock_in` and ends at
 * `clock_out`, or is still open (clockOutMs null) until `nowMs`.
 */
export function buildAttendanceDaySegments(
  events: Pick<AgentAttendanceEventRow, "event_type" | "occurred_at">[],
  nowMs: number,
): AttendanceDaySegment[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  const segments: AttendanceDaySegment[] = [];
  let shiftStart: number | null = null;
  let breakAccum = 0;
  let breakOpen: number | null = null;

  const pushOpenShiftTo = (endT: number) => {
    if (shiftStart === null) return;
    let b = breakAccum;
    if (breakOpen !== null) b += endT - breakOpen;
    const span = endT - shiftStart;
    const worked = Math.max(0, span - b);
    segments.push({
      clockInMs: shiftStart,
      clockOutMs: null,
      breakMs: b,
      workedMs: worked,
    });
  };

  const closeShiftAt = (endT: number) => {
    if (shiftStart === null) return;
    let b = breakAccum;
    if (breakOpen !== null) {
      b += endT - breakOpen;
      breakOpen = null;
    }
    const span = endT - shiftStart;
    const worked = Math.max(0, span - b);
    segments.push({
      clockInMs: shiftStart,
      clockOutMs: endT,
      breakMs: b,
      workedMs: worked,
    });
    shiftStart = null;
    breakAccum = 0;
  };

  for (const e of sorted) {
    const t = new Date(e.occurred_at).getTime();
    switch (e.event_type) {
      case "clock_in":
        if (shiftStart !== null) {
          closeShiftAt(t);
        }
        shiftStart = t;
        breakAccum = 0;
        breakOpen = null;
        break;
      case "break_start":
        if (shiftStart !== null && breakOpen === null) breakOpen = t;
        break;
      case "break_end":
        if (breakOpen !== null) {
          breakAccum += t - breakOpen;
          breakOpen = null;
        }
        break;
      case "clock_out":
        closeShiftAt(t);
        break;
      default:
        break;
    }
  }

  if (shiftStart !== null) {
    pushOpenShiftTo(nowMs);
  }

  return segments;
}

export async function fetchAttendanceEventsForDay(
  userId: string,
  day: Date,
): Promise<AgentAttendanceEventRow[]> {
  const { startIso, endIso } = attendanceDayRange(day);
  const { data, error } = await supabase
    .from("agent_attendance_events")
    .select(
      "id,user_id,tenant_id,agent_display_name,event_type,occurred_at,created_at",
    )
    .eq("user_id", userId)
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as AgentAttendanceEventRow[];
}

export async function fetchAllAttendanceEventsForDay(
  day: Date,
): Promise<AgentAttendanceEventRow[]> {
  const { startIso, endIso } = attendanceDayRange(day);
  const { data, error } = await supabase
    .from("agent_attendance_events")
    .select(
      "id,user_id,tenant_id,agent_display_name,event_type,occurred_at,created_at",
    )
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as AgentAttendanceEventRow[];
}

/** Fetch all attendance events for any arbitrary date range (used for weekly/monthly views). */
export async function fetchAllAttendanceEventsForRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<AgentAttendanceEventRow[]> {
  const { data, error } = await supabase
    .from("agent_attendance_events")
    .select(
      "id,user_id,tenant_id,agent_display_name,event_type,occurred_at,created_at",
    )
    .gte("occurred_at", startOfDay(rangeStart).toISOString())
    .lte("occurred_at", endOfDay(rangeEnd).toISOString())
    .order("occurred_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as AgentAttendanceEventRow[];
}

export async function insertAttendanceEvent(
  eventType: AttendanceEventType,
  opts: {
    userId: string;
    tenantId: string | null;
    displayName: string;
  },
): Promise<void> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData.user || authData.user.id !== opts.userId) {
    throw new Error("Sign in with your dashboard account to record attendance.");
  }

  const { error } = await supabase.from("agent_attendance_events").insert({
    user_id: opts.userId,
    tenant_id: opts.tenantId,
    agent_display_name: opts.displayName || null,
    event_type: eventType,
  });

  if (error) throw new Error(error.message);
}

export async function ensureClockedOut(opts: {
  userId: string;
  tenantId: string | null;
  displayName: string;
}): Promise<void> {
  const { data: events, error: fetchErr } = await supabase
    .from("agent_attendance_events")
    .select("event_type, occurred_at")
    .eq("user_id", opts.userId)
    .gte("occurred_at", startOfDay(new Date()).toISOString())
    .order("occurred_at", { ascending: true });

  if (fetchErr) return; // Silent fail if we can't check

  const { status } = deriveAttendanceShiftStatus(events || []);
  if (status === "off_clock") return;

  if (status === "on_break") {
    await supabase.from("agent_attendance_events").insert({
      user_id: opts.userId,
      tenant_id: opts.tenantId,
      agent_display_name: opts.displayName || null,
      event_type: "break_end",
    });
  }

  await supabase.from("agent_attendance_events").insert({
    user_id: opts.userId,
    tenant_id: opts.tenantId,
    agent_display_name: opts.displayName || null,
    event_type: "clock_out",
  });
}


export function subscribeToMyAttendanceEvents(
  userId: string,
  onEvent: (row: AgentAttendanceEventRow) => void,
): () => void {
  const channel = supabase
    .channel(`attendance-self-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "agent_attendance_events",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as AgentAttendanceEventRow;
        if (row) onEvent(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToAllAttendanceInserts(
  onInsert: (row: AgentAttendanceEventRow) => void,
): () => void {
  const channel = supabase
    .channel("attendance-super-admin")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "agent_attendance_events",
      },
      (payload) => {
        const row = payload.new as AgentAttendanceEventRow;
        if (row) onInsert(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchAgentShiftSchedules(): Promise<AgentShiftSchedule[]> {
  const { data, error } = await supabase
    .from("agent_shift_schedules")
    .select("*");

  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id,
    agentId: row.agent_id,
    monday: row.monday,
    tuesday: row.tuesday,
    wednesday: row.wednesday,
    thursday: row.thursday,
    friday: row.friday,
    saturday: row.saturday,
    sunday: row.sunday,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchMyShiftSchedule(agentId: string): Promise<AgentShiftSchedule | null> {
  const { data, error } = await supabase
    .from("agent_shift_schedules")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    agentId: data.agent_id,
    monday: data.monday,
    tuesday: data.tuesday,
    wednesday: data.wednesday,
    thursday: data.thursday,
    friday: data.friday,
    saturday: data.saturday,
    sunday: data.sunday,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function upsertAgentShiftSchedule(
  schedule: Partial<AgentShiftSchedule> & { agentId: string },
): Promise<void> {
  const payload = {
    agent_id: schedule.agentId,
    monday: schedule.monday,
    tuesday: schedule.tuesday,
    wednesday: schedule.wednesday,
    thursday: schedule.thursday,
    friday: schedule.friday,
    saturday: schedule.saturday,
    sunday: schedule.sunday,
  };

  const { error } = await supabase
    .from("agent_shift_schedules")
    .upsert(payload, { onConflict: "agent_id" });

  if (error) throw new Error(error.message);
}
