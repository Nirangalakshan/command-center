import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, Tenant } from "@/services/types";
import { formatDuration, formatTime } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveDot } from "@/components/dashboard/LiveDot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildAttendanceDaySegments,
  computeWorkedAndBreakMs,
  deriveAttendanceShiftStatus,
  fetchAllAttendanceEventsForDay,
  isSupabaseAuthUserId,
  subscribeToAllAttendanceInserts,
  type AgentAttendanceEventRow,
} from "@/services/attendanceApi";
import { format, startOfDay, addDays, endOfDay, parse } from "date-fns";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

interface SuperAdminAttendanceBoardProps {
  agents: Agent[];
  tenants: Tenant[];
  now: number;
}

function displayNameForUser(
  userId: string,
  events: AgentAttendanceEventRow[],
  agents: Agent[],
): string {
  const agentRow = agents.find((a) => a.userId === userId);
  if (agentRow?.name) return agentRow.name;
  for (let i = events.length - 1; i >= 0; i--) {
    const n = events[i].agent_display_name;
    if (n) return n;
  }
  return userId.slice(0, 8) + "…";
}

function tenantLabel(tenantId: string | null, tenants: Tenant[]): string {
  if (!tenantId) return "—";
  return tenants.find((t) => t.id === tenantId)?.name || tenantId.slice(0, 6);
}

function isCommandCentreAgent(a: Agent): boolean {
  return !String(a.bmsOwnerUid ?? "").trim();
}

export function SuperAdminAttendanceBoard({
  agents,
  tenants,
  now,
}: SuperAdminAttendanceBoardProps) {
  const [events, setEvents] = useState<AgentAttendanceEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewDay, setViewDay] = useState(() => startOfDay(new Date()));

  const viewDayKey = format(viewDay, "yyyy-MM-dd");
  const todayKey = format(new Date(now), "yyyy-MM-dd");
  const isViewingToday = viewDayKey === todayKey;
  const segmentNowMs = isViewingToday ? now : endOfDay(viewDay).getTime();

  const commandCentreAgents = useMemo(
    () => agents.filter(isCommandCentreAgent),
    [agents],
  );

  const commandCentreUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of commandCentreAgents) {
      if (a.userId && isSupabaseAuthUserId(a.userId)) s.add(a.userId);
    }
    return s;
  }, [commandCentreAgents]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllAttendanceEventsForDay(viewDay);
      setEvents(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, [viewDay]);

  useEffect(() => {
    void reload();
  }, [reload, viewDayKey]);

  useEffect(() => {
    return subscribeToAllAttendanceInserts((row) => {
      if (!commandCentreUserIds.has(row.user_id)) return;
      const rowDay = format(new Date(row.occurred_at), "yyyy-MM-dd");
      if (rowDay !== viewDayKey) return;
      setEvents((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev;
        return [...prev, row].sort(
          (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
        );
      });
    });
  }, [viewDayKey, commandCentreUserIds]);

  type AgentAttendanceRow = {
    userId: string;
    name: string;
    tenantId: string | null;
    segments: ReturnType<typeof buildAttendanceDaySegments>;
    status: string;
    workedMs: number;
    breakMs: number;
    lastAt: number;
  };

  const rows: AgentAttendanceRow[] = useMemo(() => {
    const byUser = new Map<string, AgentAttendanceEventRow[]>();
    for (const e of events) {
      if (!commandCentreUserIds.has(e.user_id)) continue;
      const list = byUser.get(e.user_id) || [];
      list.push(e);
      byUser.set(e.user_id, list);
    }

    const rosterIds = [...commandCentreUserIds];

    return rosterIds
      .map((userId) => {
        const evs = byUser.get(userId) || [];
        const sorted = [...evs].sort(
          (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
        );
        const segments = buildAttendanceDaySegments(sorted, segmentNowMs);
        const { status } = deriveAttendanceShiftStatus(sorted);
        const { workedMs, breakMs } = computeWorkedAndBreakMs(sorted, segmentNowMs);
        const last = sorted[sorted.length - 1];
        const agentRow = commandCentreAgents.find((a) => a.userId === userId);
        const tenantId =
          agentRow?.tenantId ||
          last?.tenant_id ||
          evs.find((x) => x.tenant_id)?.tenant_id ||
          null;
        return {
          userId,
          name: displayNameForUser(userId, sorted, commandCentreAgents),
          tenantId,
          segments,
          status,
          workedMs,
          breakMs,
          lastAt: last ? new Date(last.occurred_at).getTime() : 0,
        };
      })
      .sort((a, b) => {
        const st = (s: string) => (s === "working" ? 0 : s === "on_break" ? 1 : 2);
        const d = st(a.status) - st(b.status);
        if (d !== 0) return d;
        return b.lastAt - a.lastAt;
      });
  }, [events, commandCentreAgents, commandCentreUserIds, segmentNowMs]);

  return (
    <Card className="border-violet-200/60 bg-gradient-to-br from-white via-violet-50/25 to-white shadow-sm">
      <CardHeader className="border-b border-border/60 space-y-4 pb-4">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <Users className="h-5 w-5 text-violet-600" />
            Agent attendance — Command center
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Workshop agents are excluded.
            {isViewingToday
              ? " Live updates when command center agents clock in, break, or clock out."
              : " Showing the selected day (not live)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Previous day"
            onClick={() => setViewDay((d) => startOfDay(addDays(d, -1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-sm font-semibold text-slate-900">
            {format(viewDay, "EEE d MMM yyyy")}
          </span>
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            value={viewDayKey}
            max={todayKey}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setViewDay(startOfDay(parse(v, "yyyy-MM-dd", new Date())));
            }}
            aria-label="Pick a date"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Next day"
            disabled={viewDayKey >= todayKey}
            onClick={() => {
              if (viewDayKey >= todayKey) return;
              setViewDay((d) => startOfDay(addDays(d, 1)));
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
              onClick={() => setViewDay(startOfDay(new Date(now)))}
            >
              Today
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-4">
        {error && (
          <div className="px-4 py-3 text-sm text-rose-700 sm:px-0">{error}</div>
        )}
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No command center agents with a dashboard login (`user_id`) yet. Workshop-linked agents are not listed
            here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="whitespace-nowrap">Clock in</TableHead>
                  <TableHead className="whitespace-nowrap">Clock out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead className="text-right">Break</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenantLabel(r.tenantId, tenants)}
                    </TableCell>
                    <TableCell className="align-top text-xs tabular-nums">
                      {r.segments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {r.segments.map((s, i) => (
                            <span key={i}>
                              {formatTime(new Date(s.clockInMs))}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs tabular-nums">
                      {r.segments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {r.segments.map((s, i) => (
                            <span
                              key={i}
                              className={
                                s.clockOutMs == null ? "text-amber-700" : ""
                              }
                            >
                              {s.clockOutMs == null
                                ? "Open"
                                : formatTime(new Date(s.clockOutMs))}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {isViewingToday ? (
                          <LiveDot
                            color={
                              r.status === "working"
                                ? "var(--cc-color-green)"
                                : r.status === "on_break"
                                  ? "var(--cc-color-amber)"
                                  : "#94a3b8"
                            }
                          />
                        ) : (
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                r.status === "working"
                                  ? "var(--cc-color-green)"
                                  : r.status === "on_break"
                                    ? "var(--cc-color-amber)"
                                    : "#94a3b8",
                            }}
                            aria-hidden
                          />
                        )}
                        {r.status === "working"
                          ? "Working"
                          : r.status === "on_break"
                            ? "On break"
                            : "Off shift"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.workedMs > 0 ? formatDuration(r.workedMs) : "0:00"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-800/90">
                      {r.breakMs > 0 ? formatDuration(r.breakMs) : "0:00"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
