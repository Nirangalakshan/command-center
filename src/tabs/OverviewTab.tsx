import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DashboardSummary,
  Queue,
  Agent,
  Call,
  Tenant,
  Permissions,
  UserSession,
  AgentGroup,
  IncomingCall,
} from "@/services/types";
import {
  formatDuration,
  formatPhone,
  formatSeconds,
  formatTime,
} from "@/utils/formatters";
import {
  buildIncomingCallSnapshot,
  buildLiveCallSnapshot,
  CallDetailsSheet,
  restoreCallDetailFromSession,
  clearCallDetailSession,
  type CallDetailSnapshot,
} from "@/components/dashboard/CallDetailsSheet";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QueueSummaryCard } from "@/components/dashboard/QueueSummaryCard";
import { LiveDot } from "@/components/dashboard/LiveDot";
import { LoadingSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { AgentShiftPanel } from "@/components/dashboard/AgentShiftPanel";
import { NotificationsCard } from "@/tabs/NotificationsCard";
import { ResultBadge } from "@/components/dashboard/ResultBadge";
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
  calls: Call[];
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
  calls,
  tenants,
  permissions,
  now,
  session,
  agentGroups,
  incomingCalls,
}: OverviewTabProps) {
  const isAgentOverview = session?.role === "agent";
  const seenIncomingIdsRef = useRef<Set<string>>(new Set());
  const audioUnlockedRef = useRef(false);

  const myAnsweredCallsCount = useMemo(() => {
    if (!isAgentOverview || !session) return 0;
    const me = agents.find((a) => a.userId === session.userId);
    if (!me) return 0;
    return calls.filter((c) => c.agentId === me.id && c.result === "answered")
      .length;
  }, [isAgentOverview, session, agents, calls]);

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
  const restoredFromSession = useRef(false);

  // Restore call detail saved before navigating away (Book Now / Booking Details)
  useEffect(() => {
    const restored = restoreCallDetailFromSession();
    if (restored) {
      restoredFromSession.current = true;
      setSelectedCall(restored);
      clearCallDetailSession();
    }
  }, []);

  useEffect(() => {
    if (!selectedCall) return;
    // Skip auto-clear for calls restored from session (they may not appear in live data)
    if (restoredFromSession.current) return;

    const isStillActive =
      selectedCall.mode === "incoming"
        ? (incomingCalls || []).some((call) => call.id === selectedCall.id)
        : agents.some(
            (agent) =>
              agent.id === selectedCall.id &&
              (agent.status === "on-call" || agent.status === "ringing"),
          );

    if (!isStillActive) {
      setSelectedCall(null);
    }
  }, [selectedCall, incomingCalls, agents]);

  useEffect(() => {
    const unlockAudio = () => {
      audioUnlockedRef.current = true;
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const currentIncoming = incomingCalls || [];
    const nextIds = new Set(currentIncoming.map((call) => call.id));
    const seenIds = seenIncomingIdsRef.current;
    const hasNewIncoming = currentIncoming.some(
      (call) => !seenIds.has(call.id),
    );

    if (hasNewIncoming && audioUnlockedRef.current) {
      playIncomingAlertTone();
    }

    seenIncomingIdsRef.current = nextIds;
  }, [incomingCalls]);

  const queueCallDetails = useMemo(() => {
    const map = new Map<
      string,
      {
        detail: CallDetailSnapshot;
        hint: string;
        isIncoming: boolean;
        isLive: boolean;
        incomingCallers: Array<{
          number: string;
          name: string | null;
          waitingSince?: number | null;
          detail?: CallDetailSnapshot;
        }>;
      }
    >();

    for (const queue of queues) {
      // --- Build the best snapshot from all available sources ---
      //
      // The agent DB state (ringing / on-call + current_caller) is the most
      // stable source — it persists across polls and CDC refreshes.
      // The realtime IncomingCall broadcast is fast but volatile.
      //
      // Once an agent answers the call, Yeastar does NOT fire CallHangup
      // (the call is still live), so the IncomingCall entry lingers in
      // `incomingCalls`. To prevent the card from staying amber after
      // answer, we exclude any incoming whose caller number matches a
      // live agent's currentCaller in this queue.

      const liveAgentForQueue = liveAgents.find((agent) =>
        agent.queueIds.includes(queue.id),
      );
      const answeredNumbersForQueue = new Set<string>();
      if (liveAgentForQueue?.currentCaller) {
        answeredNumbersForQueue.add(
          normalizeNumber(liveAgentForQueue.currentCaller),
        );
      }

      const allIncomingForQueue = (incomingCalls || []).filter(
        (call) => call.queueId === queue.id && call.callerNumber,
      );
      const unansweredIncoming = allIncomingForQueue.filter(
        (call) =>
          !answeredNumbersForQueue.has(normalizeNumber(call.callerNumber)),
      );
      const incomingCallers = unansweredIncoming.map((c) => ({
        number: c.callerNumber,
        name: c.callerName || null,
        waitingSince: c.waitingSince,
        detail: buildIncomingCallSnapshot(c, now),
      }));

      if (unansweredIncoming.length > 0) {
        map.set(queue.id, {
          detail: buildIncomingCallSnapshot(unansweredIncoming[0], now),
          hint:
            unansweredIncoming.length > 1
              ? "Click a caller below to see their details."
              : "Click to open the incoming caller details.",
          isIncoming: true,
          isLive: false,
          incomingCallers,
        });
        continue;
      }

      // Priority 2: ringing agent in DB (stable across Yeastar event churn).
      // Skip any ringing agent whose caller has already been answered by
      // the live agent in this queue (Yeastar can lag between ring → answer
      // events across agents in the same queue).
      const ringingAgentForQueue = ringingAgents.find((agent) => {
        if (!agent.queueIds.includes(queue.id)) return false;
        if (
          agent.currentCaller &&
          answeredNumbersForQueue.has(normalizeNumber(agent.currentCaller))
        ) {
          return false;
        }
        return true;
      });
      if (ringingAgentForQueue) {
        const cPhone = ringingAgentForQueue.currentCaller;
        const detail = buildLiveOrIncomingDetail(
          "incoming",
          null,
          ringingAgentForQueue,
          queues,
          tenants,
          incomingCalls || [],
          now,
        );
        map.set(queue.id, {
          detail,
          hint: "Click to open the incoming caller details.",
          isIncoming: true,
          isLive: false,
          incomingCallers: cPhone
            ? [{ number: cPhone, name: null, waitingSince: null, detail }]
            : [],
        });
        continue;
      }

      // Priority 3: agent on-call (answered) in this queue.
      if (liveAgentForQueue) {
        const detail = buildLiveOrIncomingDetail(
          "live",
          null,
          liveAgentForQueue,
          queues,
          tenants,
          incomingCalls || [],
          now,
        );
        const incomingMatch = findIncomingCallForAgent(liveAgentForQueue, incomingCalls || []);
        const cPhone = liveAgentForQueue.currentCaller || incomingMatch?.callerNumber || "Unknown";
        const cName = incomingMatch?.callerName || `Agent: ${liveAgentForQueue.name}`;

        map.set(queue.id, {
          detail,
          hint: "Click to open the live caller details.",
          isIncoming: false,
          isLive: true,
          incomingCallers: [{ number: cPhone, name: cName, waitingSince: null, detail }],
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
          isIncoming: true,
          isLive: false,
          incomingCallers: [],
        });
      }
    }

    return map;
  }, [incomingCalls, liveAgents, ringingAgents, now, queues, tenants]);

  const visibleQueues = useMemo(
    () =>
      queues
        .filter(
          (q) =>
            permissions.allowedQueueIds.length === 0 ||
            permissions.allowedQueueIds.includes(q.id),
        )
        .sort((a, b) => {
          const aIncoming = Boolean(queueCallDetails.get(a.id)?.isIncoming);
          const bIncoming = Boolean(queueCallDetails.get(b.id)?.isIncoming);
          if (aIncoming !== bIncoming) return bIncoming ? 1 : -1;

          const waitDelta = b.avgWaitSeconds - a.avgWaitSeconds;
          if (waitDelta !== 0) return waitDelta;

          return b.waitingCalls - a.waitingCalls;
        }),
    [queues, permissions.allowedQueueIds, queueCallDetails],
  );

  if (!summary) return <LoadingSkeleton />;

  return (
    <div className="cc-fade-in space-y-8">
      {/* Queue Status — top of screen, full width */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          <LiveDot color="var(--cc-color-cyan)" />
          Queue Status
        </div>
        <div className="grid gap-4">
          {visibleQueues.map((q) => {
            const tenant = tenants.find((t) => t.id === q.tenantId);
            const queueDetail = queueCallDetails.get(q.id);
            const incomingRows = queueDetail?.incomingCallers ?? [];
            const selectableIncomingCount = incomingRows.filter(
              (c) => c.detail,
            ).length;
            const multipleIncomingPickers =
              Boolean(queueDetail?.isIncoming) && selectableIncomingCount > 1;

            return (
              <QueueSummaryCard
                key={q.id}
                queue={q}
                tenant={tenant}
                showTenant={permissions.canViewTenantNames}
                interactive={Boolean(queueDetail) && !multipleIncomingPickers}
                isIncoming={queueDetail?.isIncoming}
                isLive={queueDetail?.isLive}
                incomingCallers={queueDetail?.incomingCallers}
                now={now}
                callHint={queueDetail?.hint}
                onClick={
                  queueDetail && !multipleIncomingPickers
                    ? () => setSelectedCall(queueDetail.detail)
                    : undefined
                }
                onIncomingCallerClick={
                  selectableIncomingCount > 0
                    ? (d) => setSelectedCall(d)
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      {/* Metrics (left) + Notifications (right) — two-column row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Metric Cards */}
        <div>
          {isAgentOverview ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Answered Calls"
                value={myAnsweredCallsCount}
                accent="var(--cc-color-green)"
                sub="your calls"
              />
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
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
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
          )}
        </div>

        {/* Right: Notifications Card */}
        <div>
          <NotificationsCard
            queues={queues}
            agents={agents}
            summary={summary}
            session={session}
          />
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
                  <TableHead>Time</TableHead>
                  <TableHead>Caller</TableHead>
                  {permissions.canViewTenantNames && (
                    <TableHead>Client</TableHead>
                  )}
                  <TableHead>Queue</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveAgents.map((a) => {
                  const queueColor =
                    queues.find((q) => a.queueIds.includes(q.id))?.color ||
                    "var(--cc-color-cyan)";
                  const incoming = findIncomingCallForAgent(
                    a,
                    incomingCalls || [],
                  );
                  const callerNum =
                    a.currentCaller || incoming?.callerNumber || "";
                  const tenant = tenants.find((t) => t.id === a.tenantId);
                  const brandColor =
                    tenant?.brandColor || "var(--cc-color-cyan)";

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
                            incomingCall: incoming,
                            now,
                          }),
                        )
                      }
                    >
                      <TableCell className="font-mono text-xs">
                        {a.callStartTime
                          ? formatTime(new Date(a.callStartTime))
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatPhone(callerNum)}
                        {incoming?.callerName && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {incoming.callerName}
                          </div>
                        )}
                      </TableCell>
                      {permissions.canViewTenantNames && (
                        <TableCell>
                          <span
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold"
                            style={{
                              color: brandColor,
                              borderColor: `${brandColor}40`,
                              background: `${brandColor}12`,
                            }}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: brandColor }}
                            />
                            {a.tenantName ?? "—"}
                          </span>
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
                      <TableCell className="font-medium text-slate-900">
                        {a.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-rose-600">
                        <span className="inline-flex items-center">
                          <LiveDot />
                          {a.callStartTime
                            ? formatDuration(now - a.callStartTime)
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ResultBadge result="answered" />
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
          if (!open) {
            setSelectedCall(null);
            restoredFromSession.current = false;
            clearCallDetailSession();
          }
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

/** Strip non-digit chars so "+94 77 123 4567" and "0771234567" match. */
function normalizeNumber(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
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

function playIncomingAlertTone(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(ctx.destination);

    const pulse = (start: number, frequency: number, duration = 0.11) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    pulse(now + 0.01, 880);
    pulse(now + 0.18, 1046);

    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    window.setTimeout(() => {
      void ctx.close();
    }, 700);
  } catch {
    // Audio failures are non-critical (autoplay policy/device limitations).
  }
}
