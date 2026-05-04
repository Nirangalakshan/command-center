import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, Tenant } from "@/services/types";
import { formatDuration } from "@/utils/formatters";
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
  computeWorkedAndBreakMs,
  deriveAttendanceShiftStatus,
  fetchAllAttendanceEventsForDay,
  isSupabaseAuthUserId,
  subscribeToAllAttendanceInserts,
  type AgentAttendanceEventRow,
} from "@/services/attendanceApi";
import { format } from "date-fns";
import { Users } from "lucide-react";

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

  const dayKey = format(new Date(now), "yyyy-MM-dd");

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
      const rows = await fetchAllAttendanceEventsForDay(new Date());
      setEvents(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, dayKey]);

  useEffect(() => {
    return subscribeToAllAttendanceInserts((row) => {
      if (!commandCentreUserIds.has(row.user_id)) return;
      const rowDay = format(new Date(row.occurred_at), "yyyy-MM-dd");
      if (rowDay !== dayKey) return;
      setEvents((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev;
        return [...prev, row].sort(
          (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
        );
      });
    });
  }, [dayKey, commandCentreUserIds]);

  const rows = useMemo(() => {
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
        const { status } = deriveAttendanceShiftStatus(sorted);
        const { workedMs, breakMs } = computeWorkedAndBreakMs(sorted, now);
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
  }, [events, commandCentreAgents, commandCentreUserIds, now]);

  return (
    <Card className="border-violet-200/60 bg-gradient-to-br from-white via-violet-50/25 to-white shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
          <Users className="h-5 w-5 text-violet-600" />
          Agent attendance — Command center
          <span className="font-mono text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
            {format(new Date(now), "EEE d MMM")}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Workshop agents are excluded. Updates in real time when command center agents clock in, break, or clock out.
        </p>
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
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <LiveDot
                          color={
                            r.status === "working"
                              ? "var(--cc-color-green)"
                              : r.status === "on_break"
                                ? "var(--cc-color-amber)"
                                : "#94a3b8"
                          }
                        />
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
