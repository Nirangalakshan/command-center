import { useState, useMemo } from 'react';
import type { Agent, Queue, Tenant, Permissions } from '@/services/types';
import { formatDuration, formatPhone } from '@/utils/formatters';
import { StatusBadge, STATUS_MAP } from '@/components/dashboard/StatusBadge';
import { LiveDot } from '@/components/dashboard/LiveDot';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AgentsTabProps {
  agents: Agent[];
  queues: Queue[];
  tenants: Tenant[];
  permissions: Permissions;
  now: number;
}

export function AgentsTab({ agents, queues, tenants, permissions, now }: AgentsTabProps) {
  const [filterQueue, setFilterQueue] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Respect agent queue restrictions
  const visibleAgents = useMemo(() => {
    if (permissions.allowedQueueIds.length > 0) {
      return agents.filter((a) => a.queueIds.some((qid) => permissions.allowedQueueIds.includes(qid)));
    }
    return agents;
  }, [agents, permissions.allowedQueueIds]);

  const availableQueues = useMemo(() => {
    const qids = new Set(visibleAgents.flatMap((a) => a.queueIds));
    return queues.filter((q) => qids.has(q.id));
  }, [visibleAgents, queues]);

  const filtered = useMemo(() => {
    let list = visibleAgents;
    if (filterQueue !== 'all') list = list.filter((a) => a.queueIds.includes(filterQueue));
    if (filterStatus !== 'all') list = list.filter((a) => a.status === filterStatus);
    return list;
  }, [visibleAgents, filterQueue, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(STATUS_MAP).forEach((s) => {
      counts[s] = filtered.filter((a) => a.status === s).length;
    });
    return counts;
  }, [filtered]);

  return (
    <div className="cc-fade-in space-y-6">
      <Card className="border-border/80 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Filter by Queue
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterQueue === 'all' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setFilterQueue('all')}
              >
                All Queues
              </Button>
              {availableQueues.map((q) => (
                <Button
                  key={q.id}
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white"
                  onClick={() => setFilterQueue(q.id)}
                  style={filterQueue === q.id ? { borderColor: q.color, color: q.color, background: `${q.color}0a` } : {}}
                >
                  {q.icon} {q.name}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Filter by Status
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setFilterStatus('all')}
              >
                All Statuses
              </Button>
              {Object.entries(STATUS_MAP).map(([key, val]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white"
                  onClick={() => setFilterStatus(key)}
                  style={filterStatus === key ? { borderColor: val.color, color: val.color, background: val.bg } : {}}
                >
                  {val.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_MAP).map(([key, val]) => (
              <div key={key} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: val.color }} />
                <span className="text-muted-foreground">{val.label}</span>
                <span className="font-semibold" style={{ color: val.color }}>
                  {statusCounts[key] || 0}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState message="No agents match current filters" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => {
            const isLive = a.status === 'on-call' || a.status === 'ringing';
            return (
              <Card key={a.id} className="overflow-hidden border-border/80 bg-white shadow-sm">
                {isLive && <div className="h-1 w-full bg-rose-500" />}
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-950">{a.name}</div>
                      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {a.queueName} · Ext {a.extension}
                      {permissions.canViewTenantNames && <> · {a.tenantName}</>}
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                {isLive && a.callStartTime && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-2">
                      <span className="font-mono text-xs text-slate-700">{formatPhone(a.currentCaller)}</span>
                      <span className="inline-flex items-center font-mono text-xs font-semibold text-rose-600">
                      <LiveDot /> {formatDuration(now - a.callStartTime)}
                      </span>
                    </div>
                )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
