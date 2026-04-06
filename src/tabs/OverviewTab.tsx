import { useMemo, useState } from "react";
import type {
  DashboardSummary,
  Queue,
  Agent,
  Tenant,
  Permissions,
  UserSession,
  AgentGroup,
  IncomingCall,
} from "@/services/types";
import { formatDuration, formatPhone } from "@/utils/formatters";
import { formatSeconds } from "@/utils/formatters";
import {
  buildIncomingCallSnapshot,
  buildLiveCallSnapshot,
  CallDetailsSheet,
  type CallDetailSnapshot,
} from "@/components/dashboard/CallDetailsSheet";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QueueSummaryCard } from "@/components/dashboard/QueueSummaryCard";
import { LiveDot } from "@/components/dashboard/LiveDot";
import { LoadingSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { AgentShiftPanel } from "@/components/dashboard/AgentShiftPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OverviewTabProps {
  summary: DashboardSummary | null;
  queues: Queue[];
  agents: Agent[];
  tenants: Tenant[];
  permissions: Permissions;
  now: number;
  session?: UserSession | null;
  agentGroups?: AgentGroup[];
  incomingCalls?: IncomingCall[];
}

export function OverviewTab({
  summary,
  queues,
  agents,
  tenants,
  permissions,
  now,
  session,
  agentGroups,
  incomingCalls,
}: OverviewTabProps) {
  const liveAgents = useMemo(
    () => agents.filter((a) => a.status === "on-call"),
    [agents],
  );
  const ringingAgents = useMemo(
    () => agents.filter((a) => a.status === "ringing"),
    [agents],
  );
  const [selectedCall, setSelectedCall] = useState<CallDetailSnapshot | null>(
    null,
  );
  const queueCallDetails = useMemo(() => {
    const map = new Map<string, { detail: CallDetailSnapshot; hint: string }>();

    for (const queue of queues) {
      // --- Build the best snapshot from all available sources ---
      //
      // The agent DB state (ringing / on-call + current_caller) is the most
      // stable source — it persists across polls and CDC refreshes.
      // The realtime IncomingCall broadcast is fast but volatile.
      // We try broadcast first (fastest), then agent DB fallback.

      const incomingForQueue = (incomingCalls || []).find(
        (call) => call.queueId === queue.id && call.callerNumber,
      );
      //  const incomingForQueue = true;

      // Priority 1: broadcast with a caller number
      if (incomingForQueue) {
        map.set(queue.id, {
          detail: buildLiveOrIncomingDetail(
            "incoming",
            incomingForQueue,
            null,
            queues,
            tenants,
            incomingCalls || [],
            now,
          ),
          hint: "Click to open the incoming caller details.",
        });
        continue;
      }

      // Priority 2: ringing agent in DB (stable across Yeastar event churn)
      const ringingAgentForQueue = ringingAgents.find((agent) =>
        agent.queueIds.includes(queue.id),
      );
      if (ringingAgentForQueue) {
        map.set(queue.id, {
          detail: buildLiveOrIncomingDetail(
            "incoming",
            null,
            ringingAgentForQueue,
            queues,
            tenants,
            incomingCalls || [],
            now,
          ),
          hint: "Click to open the incoming caller details.",
        });
        continue;
      }

      // Priority 3: agent on-call (answered) in this queue
      const liveAgentForQueue = liveAgents.find((agent) =>
        agent.queueIds.includes(queue.id),
      );
      if (liveAgentForQueue) {
        map.set(queue.id, {
          detail: buildLiveOrIncomingDetail(
            "live",
            null,
            liveAgentForQueue,
            queues,
            tenants,
            incomingCalls || [],
            now,
          ),
          hint: "Click to open the live caller details.",
        });
        continue;
      }

      // Priority 4: broadcast exists but without caller number — still show button
      const anyBroadcastForQueue = (incomingCalls || []).find(
        (call) => call.queueId === queue.id,
      );
      if (anyBroadcastForQueue) {
        map.set(queue.id, {
          detail: buildLiveOrIncomingDetail(
            "incoming",
            anyBroadcastForQueue,
            null,
            queues,
            tenants,
            incomingCalls || [],
            now,
          ),
          hint: "Click to open the incoming caller details.",
        });
      }
    }

    return map;
  }, [incomingCalls, liveAgents, ringingAgents, now, queues, tenants]);

  if (!summary) return <LoadingSkeleton />;

  return (
    <div className="cc-fade-in space-y-8">
      {permissions.canViewShiftPanel && session && (
        <AgentShiftPanel
          session={session}
          tenants={tenants}
          queues={queues}
          agentGroups={agentGroups || []}
          incomingCalls={incomingCalls || []}
          now={now}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          label="Active Calls"
          value={summary.activeCalls}
          accent="var(--cc-color-red)"
          sub="live now"
        />
        <MetricCard
          label="Calls Waiting"
          value={summary.queuedCalls}
          accent="var(--cc-color-amber)"
          sub="in queue"
        />
        <MetricCard
          label="Agents Online"
          value={summary.onlineAgents}
          accent="var(--cc-color-cyan)"
          sub={`${summary.availableAgents} available`}
        />
        <MetricCard
          label="Calls Today"
          value={summary.totalCallsToday}
          accent="var(--cc-color-cyan)"
        />
        <MetricCard
          label="Answer Rate"
          value={`${summary.answerRate}%`}
          accent="var(--cc-color-green)"
        />
        <MetricCard
          label="Abandon Rate"
          value={`${summary.abandonRate}%`}
          accent="var(--cc-color-red)"
        />
        <MetricCard
          label="Avg Handle"
          value={formatSeconds(summary.avgHandleTime)}
          accent="var(--cc-color-purple)"
        />
        <MetricCard
          label="SLA %"
          value={`${summary.slaPercent}%`}
          accent="var(--cc-color-green)"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          <LiveDot color="var(--cc-color-cyan)" />
          Queue Status
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {queues
            .filter(
              (q) =>
                permissions.allowedQueueIds.length === 0 ||
                permissions.allowedQueueIds.includes(q.id),
            )
            .map((q) => {
              const tenant = tenants.find((t) => t.id === q.tenantId);
              const queueDetail = queueCallDetails.get(q.id);
              return (
                <QueueSummaryCard
                  key={q.id}
                  queue={q}
                  tenant={tenant}
                  showTenant={permissions.canViewTenantNames}
                  interactive={Boolean(queueDetail)}
                  callHint={queueDetail?.hint}
                  onClick={
                    queueDetail
                      ? () => setSelectedCall(queueDetail.detail)
                      : undefined
                  }
                />
              );
            })}
        </div>
      </div>

      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LiveDot />
            Live Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liveAgents.length === 0 ? (
            <EmptyState message="No active calls" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  {permissions.canViewTenantNames && (
                    <TableHead>Client</TableHead>
                  )}
                  <TableHead>Queue</TableHead>
                  <TableHead>Ext</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveAgents.map((a) => {
                  const queueColor =
                    queues.find((q) => a.queueIds.includes(q.id))?.color ||
                    "var(--cc-color-cyan)";

                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() =>
                        setSelectedCall(
                          buildLiveCallSnapshot({
                            agent: a,
                            queues,
                            tenants,
                            incomingCall: findIncomingCallForAgent(
                              a,
                              incomingCalls || [],
                            ),
                            now,
                          }),
                        )
                      }
                    >
                      <TableCell className="font-medium text-slate-900">
                        {a.name}
                      </TableCell>
                      {permissions.canViewTenantNames && (
                        <TableCell className="text-muted-foreground">
                          {a.tenantName}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            color: queueColor,
                            background: `${queueColor}18`,
                          }}
                        >
                          {a.queueName}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.extension}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatPhone(
                          a.currentCaller ||
                            findIncomingCallForAgent(a, incomingCalls || [])
                              ?.callerNumber ||
                            "",
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-rose-600">
                        <span className="inline-flex items-center">
                          <LiveDot />
                          {a.callStartTime
                            ? formatDuration(now - a.callStartTime)
                            : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CallDetailsSheet
        detail={selectedCall}
        open={Boolean(selectedCall)}
        onOpenChange={(open) => {
          if (!open) setSelectedCall(null);
        }}
      />
    </div>
  );
}

function buildLiveOrIncomingDetail(
  kind: "incoming" | "live",
  incomingCall: IncomingCall | null,
  agent: Agent | null,
  queues: Queue[],
  tenants: Tenant[],
  incomingCalls: IncomingCall[],
  now: number,
): CallDetailSnapshot {
  if (kind === "incoming" && incomingCall) {
    return buildIncomingCallSnapshot(incomingCall, now);
  }

  if (agent) {
    return buildLiveCallSnapshot({
      agent,
      queues,
      tenants,
      incomingCall: findIncomingCallForAgent(agent, incomingCalls),
      now,
    });
  }

  throw new Error("Queue detail requested without an active call.");
}

function findIncomingCallForAgent(
  agent: Agent,
  incomingCalls: IncomingCall[],
): IncomingCall | null {
  if (!Array.isArray(incomingCalls)) return null;
  const agentQueueIds = new Set(agent.queueIds);
  return (
    incomingCalls.find(
      (call) =>
        call.tenantId === agent.tenantId && agentQueueIds.has(call.queueId),
    ) ||
    incomingCalls.find((call) => call.tenantId === agent.tenantId) ||
    null
  );
}
