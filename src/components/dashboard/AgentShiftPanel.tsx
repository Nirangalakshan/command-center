import { useMemo } from 'react';
import type { UserSession, Tenant, Queue, AgentGroup, IncomingCall } from '@/services/types';
import { formatDuration } from '@/utils/formatters';
import { LiveDot } from './LiveDot';

interface AgentShiftPanelProps {
  session: UserSession;
  tenants: Tenant[];
  queues: Queue[];
  agentGroups: AgentGroup[];
  incomingCalls: IncomingCall[];
  now: number;
}

export function AgentShiftPanel({
  session, tenants, queues, agentGroups, incomingCalls, now,
}: AgentShiftPanelProps) {
  // Determine which tenants this agent serves based on their allowed queues
  const assignedTenants = useMemo(() => {
    const tenantIds = new Set<string>();
    for (const q of queues) {
      if (session.allowedQueueIds.includes(q.id)) {
        tenantIds.add(q.tenantId);
      }
    }
    return tenants.filter((t) => tenantIds.has(t.id));
  }, [session.allowedQueueIds, queues, tenants]);

  // Group queues by tenant for the agent
  const tenantQueues = useMemo(() => {
    const map = new Map<string, Queue[]>();
    for (const t of assignedTenants) {
      map.set(
        t.id,
        queues.filter((q) => q.tenantId === t.id && session.allowedQueueIds.includes(q.id)),
      );
    }
    return map;
  }, [assignedTenants, queues, session.allowedQueueIds]);

  // Filter incoming calls to this agent's groups
  const myGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of agentGroups) {
      if (session.allowedQueueIds.includes(g.queueId)) {
        ids.add(g.id);
      }
    }
    return ids;
  }, [agentGroups, session.allowedQueueIds]);

  const myIncomingCalls = useMemo(
    () => incomingCalls.filter((c) => myGroupIds.has(c.groupId)),
    [incomingCalls, myGroupIds],
  );

  return (
    <div className="cc-shift-panel cc-fade-in">
      {/* Header */}
      <div className="cc-shift-header">
        <div className="cc-shift-title">
          <span className="cc-shift-label">MY SHIFT</span>
          <span className="cc-shift-agent-name">{session.displayName}</span>
          <span className="cc-shift-meta">
            <LiveDot color="var(--cc-color-green)" /> Available
          </span>
        </div>
      </div>

      {/* Assigned Clients Grid */}
      <div className="cc-shift-clients">
        {assignedTenants.map((t) => {
          const tQueues = tenantQueues.get(t.id) || [];
          const totalWaiting = tQueues.reduce((s, q) => s + q.waitingCalls, 0);
          const totalActive = tQueues.reduce((s, q) => s + q.activeCalls, 0);
          return (
            <div
              key={t.id}
              className="cc-client-card"
              style={{ borderColor: `${t.brandColor}40` }}
            >
              <div className="cc-client-card-header">
                <span
                  className="cc-company-pill"
                  style={{
                    color: t.brandColor,
                    borderColor: `${t.brandColor}40`,
                    background: `${t.brandColor}12`,
                  }}
                >
                  <span className="cc-company-pill-dot" style={{ background: t.brandColor }} />
                  {t.name}
                </span>
              </div>
              <div className="cc-client-card-queues">
                {tQueues.map((q) => (
                  <span key={q.id} className="cc-client-queue-tag">
                    {q.icon} {q.name}
                  </span>
                ))}
              </div>
              <div className="cc-client-card-stats">
                <span className="cc-client-stat">
                  <span className="cc-client-stat-value" style={{ color: 'var(--cc-color-red)' }}>{totalActive}</span>
                  <span className="cc-client-stat-label">active</span>
                </span>
                <span className="cc-client-stat">
                  <span className="cc-client-stat-value" style={{ color: 'var(--cc-color-amber)' }}>{totalWaiting}</span>
                  <span className="cc-client-stat-label">waiting</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Incoming Calls */}
      {myIncomingCalls.length > 0 && (
        <>
          <div className="cc-shift-section-head">
            <LiveDot color="var(--cc-color-red)" /> INCOMING CALLS
            <span className="cc-shift-call-count">{myIncomingCalls.length}</span>
          </div>
          <div className="cc-incoming-calls">
            {myIncomingCalls.map((call) => (
              <div
                key={call.id}
                className={`cc-incoming-call-row ${call.status === 'ringing' ? 'cc-incoming-ringing' : ''}`}
                style={{ borderLeftColor: call.tenantBrandColor }}
              >
                <div className="cc-incoming-call-top">
                  <span
                    className="cc-company-pill"
                    style={{
                      color: call.tenantBrandColor,
                      borderColor: `${call.tenantBrandColor}40`,
                      background: `${call.tenantBrandColor}12`,
                    }}
                  >
                    <span className="cc-company-pill-dot" style={{ background: call.tenantBrandColor }} />
                    {call.tenantName}
                  </span>
                  <span className="cc-incoming-did">DID: {call.did}</span>
                  <span className="cc-incoming-did-label">{call.didLabel}</span>
                </div>
                <div className="cc-incoming-call-mid">
                  <span className="cc-incoming-caller">
                    📞 {call.callerNumber}
                    {call.callerName && <span className="cc-incoming-caller-name"> ({call.callerName})</span>}
                  </span>
                </div>
                <div className="cc-incoming-call-bottom">
                  <span className="cc-incoming-meta">
                    Queue: {call.queueName} · Group: {call.groupName}
                  </span>
                  <span className="cc-incoming-wait" style={{ color: 'var(--cc-color-red)' }}>
                    <LiveDot color="var(--cc-color-red)" />
                    {formatDuration(now - call.waitingSince)}
                  </span>
                  <button className="cc-incoming-answer">ANSWER</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
