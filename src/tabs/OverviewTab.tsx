import { useMemo } from 'react';
import type { DashboardSummary, Queue, Agent, Tenant, Permissions, UserSession, AgentGroup, IncomingCall } from '@/services/types';
import { formatDuration, formatPhone } from '@/utils/formatters';
import { formatSeconds } from '@/utils/formatters';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { QueueSummaryCard } from '@/components/dashboard/QueueSummaryCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { LiveDot } from '@/components/dashboard/LiveDot';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { AgentShiftPanel } from '@/components/dashboard/AgentShiftPanel';

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

export function OverviewTab({ summary, queues, agents, tenants, permissions, now, session, agentGroups, incomingCalls }: OverviewTabProps) {
  const liveAgents = useMemo(() => agents.filter((a) => a.status === 'on-call'), [agents]);

  if (!summary) return <LoadingSkeleton />;

  return (
    <div className="cc-fade-in">
      {/* Agent Shift Panel */}
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
      <div className="cc-metrics">
        <MetricCard label="Active Calls" value={summary.activeCalls} accent="var(--cc-color-red)" sub="live now" />
        <MetricCard label="Calls Waiting" value={summary.queuedCalls} accent="var(--cc-color-amber)" sub="in queue" />
        <MetricCard label="Agents Online" value={summary.onlineAgents} accent="var(--cc-color-cyan)" sub={`${summary.availableAgents} available`} />
        <MetricCard label="Calls Today" value={summary.totalCallsToday} accent="var(--cc-color-cyan)" />
        <MetricCard label="Answer Rate" value={`${summary.answerRate}%`} accent="var(--cc-color-green)" />
        <MetricCard label="Abandon Rate" value={`${summary.abandonRate}%`} accent="var(--cc-color-red)" />
        <MetricCard label="Avg Handle" value={formatSeconds(summary.avgHandleTime)} accent="var(--cc-color-purple)" />
        <MetricCard label="SLA %" value={`${summary.slaPercent}%`} accent="var(--cc-color-green)" />
      </div>

      {/* Queue Summary Cards */}
      <div className="cc-section-head">
        <LiveDot color="var(--cc-color-cyan)" /> Queue Status
      </div>
      <div className="cc-queues">
        {queues.map((q) => {
          const tenant = tenants.find((t) => t.id === q.tenantId);
          return (
            <QueueSummaryCard
              key={q.id}
              queue={q}
              tenant={tenant}
              showTenant={permissions.canViewTenantNames}
            />
          );
        })}
      </div>

      {/* Live Calls Table */}
      <div className="cc-section-head">
        <LiveDot /> Live Calls
      </div>
      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th>Agent</th>
              {permissions.canViewTenantNames && <th>Client</th>}
              <th>Queue</th>
              <th>Ext</th>
              <th>Caller</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {liveAgents.length === 0 && (
              <tr>
                <td colSpan={permissions.canViewTenantNames ? 6 : 5}>
                  <EmptyState message="No active calls" />
                </td>
              </tr>
            )}
            {liveAgents.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                {permissions.canViewTenantNames && <td className="cc-table-muted">{a.tenantName}</td>}
                <td>
                  <span
                    className="cc-badge cc-badge-queue"
                    style={{
                      color: queues.find((q) => a.queueIds.includes(q.id))?.color || 'var(--cc-color-cyan)',
                      background: `${queues.find((q) => a.queueIds.includes(q.id))?.color || 'var(--cc-color-cyan)'}18`,
                    }}
                  >
                    {a.queueName}
                  </span>
                </td>
                <td className="cc-table-mono">{a.extension}</td>
                <td className="cc-table-mono">{formatPhone(a.currentCaller)}</td>
                <td className="cc-table-mono" style={{ color: 'var(--cc-color-red)' }}>
                  <LiveDot /> {a.callStartTime ? formatDuration(now - a.callStartTime) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
