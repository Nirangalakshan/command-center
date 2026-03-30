import type { Queue, Tenant } from '@/services/types';
import { Card, CardContent } from '@/components/ui/card';

interface QueueSummaryCardProps {
  queue: Queue;
  tenant?: Tenant;
  showTenant: boolean;
  interactive?: boolean;
  callHint?: string;
  onClick?: () => void;
}

export function QueueSummaryCard({ queue, tenant, showTenant, interactive = false, callHint, onClick }: QueueSummaryCardProps) {
  const stats = [
    {
      label: 'Active',
      value: queue.activeCalls,
      color: queue.activeCalls > 0 ? 'var(--cc-color-red)' : 'var(--cc-color-slate)',
    },
    {
      label: 'Waiting',
      value: queue.waitingCalls,
      color: queue.waitingCalls > 0 ? 'var(--cc-color-amber)' : 'var(--cc-color-slate)',
    },
    {
      label: 'Ready',
      value: queue.availableAgents,
      color: 'var(--cc-color-green)',
    },
    {
      label: 'Avg Wait',
      value: `${queue.avgWaitSeconds}s`,
      color: 'var(--cc-color-slate)',
    },
  ];

  return (
    <Card
      className={`border-border/80 bg-white shadow-sm transition-shadow hover:shadow-md ${interactive ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      onClick={interactive ? onClick : undefined}
    >
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl">{queue.icon}</span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold" style={{ color: queue.color }}>
              {queue.name}
            </div>
          {showTenant && tenant && (
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {tenant.name}
              </div>
          )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-slate-50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {stat.label}
              </div>
              <div className="mt-2 text-xl font-semibold" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
        {callHint && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {callHint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
