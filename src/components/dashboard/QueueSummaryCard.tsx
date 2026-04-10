import type { Queue, Tenant } from '@/services/types';
import { Card, CardContent } from '@/components/ui/card';
import { PhoneIncoming, Clock, Users, PhoneCall, HeadphonesIcon } from 'lucide-react';
import { formatPhone } from '@/utils/formatters';

export interface IncomingCallerContext {
  number: string;
  name: string | null;
}

interface QueueSummaryCardProps {
  queue: Queue;
  tenant?: Tenant;
  showTenant: boolean;
  interactive?: boolean;
  isIncoming?: boolean;
  incomingCallers?: IncomingCallerContext[];
  callHint?: string;
  onClick?: () => void;
}

export function QueueSummaryCard({ 
  queue, 
  tenant, 
  showTenant, 
  interactive = false, 
  isIncoming = false, 
  incomingCallers, 
  callHint, 
  onClick 
}: QueueSummaryCardProps) {
  const stats = [
    {
      label: 'Active',
      value: queue.activeCalls,
      color: queue.activeCalls > 0 ? 'var(--cc-color-red)' : 'var(--cc-color-slate)',
      icon: PhoneCall,
    },
    {
      label: 'Waiting',
      value: queue.waitingCalls,
      color: queue.waitingCalls > 0 ? 'var(--cc-color-amber)' : 'var(--cc-color-slate)',
      icon: Clock,
    },
    {
      label: 'Ready',
      value: queue.availableAgents,
      color: 'var(--cc-color-green)',
      icon: HeadphonesIcon,
    },
    {
      label: 'Avg',
      value: `${queue.avgWaitSeconds}s`,
      color: 'var(--cc-color-slate)',
      icon: Users,
    },
  ];

  return (
    <Card
      className={`group relative overflow-hidden bg-white transition-all duration-300 ${
        interactive ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : 'shadow-sm'
      } ${isIncoming ? 'ring-1 ring-[var(--cc-color-amber)] ring-offset-2' : 'border-border/80'}`}
      onClick={interactive ? onClick : undefined}
    >
      {/* Background glow effect for incoming calls */}
      {isIncoming && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--cc-color-amber)]/20 to-transparent pointer-events-none" />
      )}

      {/* Glossy top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-white/0 via-white/80 to-white/0" />

      <CardContent className="relative space-y-5 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div 
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl shadow-inner ring-1 ring-slate-200/50"
            >
              {queue.icon}
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="truncate text-[15px] font-semibold tracking-tight text-slate-900 group-hover:text-amber-700 transition-colors" style={{ color: queue.color }}>
                {queue.name}
              </div>
              {showTenant && tenant && (
                <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
                  {tenant.name}
                </div>
              )}
            </div>
          </div>
          
          {/* Animated dot indicator */}
          <div className="flex items-center gap-2">
           {isIncoming && (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
              </span>
            )}
           {!isIncoming && queue.activeCalls > 0 && (
             <span className="relative flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
           )}
          </div>
        </div>

        {/* Incoming Callers List */}
        {isIncoming && incomingCallers && incomingCallers.length > 0 && (
          <div className="flex flex-col gap-2">
            {incomingCallers.map((caller, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 p-2.5 ring-1 ring-amber-200/50 shadow-sm transition-all hover:bg-amber-100/50">
                <div className="absolute -right-4 -top-4 opacity-10">
                  <PhoneIncoming size={56} />
                </div>
                <div className="relative flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-amber-200 shadow-sm">
                    <PhoneIncoming className="h-[14px] w-[14px] animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-amber-950 leading-tight">
                      {caller.name || 'Unknown Caller'}
                    </div>
                    <div className="truncate font-mono text-[11px] font-semibold text-amber-700/80">
                      {formatPhone(caller.number)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div 
                key={stat.label} 
                className="relative overflow-hidden rounded-xl bg-slate-50 p-3 transition-all hover:bg-slate-100/80 ring-1 ring-slate-900/5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    {stat.label}
                  </div>
                  <Icon className="h-3.5 w-3.5 opacity-30 text-slate-500" />
                </div>
                <div 
                  className="font-sans text-xl font-bold tracking-tight" 
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
              </div>
            );
          })}
        </div>

        {/* Subtle Hint */}
        {callHint && !isIncoming && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50/50 px-3 py-2 text-[12px] font-medium text-slate-500 ring-1 ring-slate-100 transition-colors group-hover:bg-slate-50">
            {callHint}
            <div className="ml-auto opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
              →
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
