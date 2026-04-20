import type { Queue, Tenant } from '@/services/types';
import { Card, CardContent } from '@/components/ui/card';
import { PhoneIncoming, Clock, Users, PhoneCall, HeadphonesIcon, ChevronRight } from 'lucide-react';
import { formatPhone } from '@/utils/formatters';
import type { CallDetailSnapshot } from '@/components/dashboard/CallDetailsSheet';

export interface IncomingCallerContext {
  number: string;
  name: string | null;
  waitingSince?: number | null;
  /** When set, this row opens the details sheet for that specific call */
  detail?: CallDetailSnapshot;
}

interface QueueSummaryCardProps {
  queue: Queue;
  tenant?: Tenant;
  showTenant: boolean;
  now?: number;
  interactive?: boolean;
  isIncoming?: boolean;
  incomingCallers?: IncomingCallerContext[];
  callHint?: string;
  onClick?: () => void;
  onIncomingCallerClick?: (detail: CallDetailSnapshot) => void;
}

export function QueueSummaryCard({ 
  queue, 
  tenant, 
  showTenant, 
  now = Date.now(),
  interactive = false, 
  isIncoming = false, 
  incomingCallers, 
  callHint, 
  onClick,
  onIncomingCallerClick,
}: QueueSummaryCardProps) {
  const incomingCount = incomingCallers?.length ?? 0;
  const incomingSeverity =
    queue.avgWaitSeconds >= 45
      ? "critical"
      : queue.avgWaitSeconds >= 20
        ? "warning"
        : "normal";
  const incomingTone =
    incomingSeverity === "critical"
      ? "var(--cc-color-red)"
      : incomingSeverity === "warning"
        ? "var(--cc-color-amber)"
        : "var(--cc-color-cyan)";
  const incomingSurface =
    incomingSeverity === "critical"
      ? "linear-gradient(135deg, rgba(239,68,68,0.13), rgba(254,242,242,0.7))"
      : incomingSeverity === "warning"
        ? "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(255,247,237,0.7))"
        : "linear-gradient(135deg, rgba(6,182,212,0.12), rgba(236,254,255,0.65))";
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
      } ${isIncoming ? 'ring-2 ring-offset-2 shadow-lg' : 'border-border/80'}`}
      style={isIncoming ? { borderColor: `${incomingTone}55`, boxShadow: `0 0 0 1px ${incomingTone}33` } : undefined}
      onClick={interactive ? onClick : undefined}
    >
      {/* Background glow effect for incoming calls */}
      {isIncoming && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ background: incomingSurface }} />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1.5 animate-pulse"
            style={{ backgroundColor: incomingTone }}
          />
        </>
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
              {isIncoming && (
                <div className="mt-1.5 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ background: `${incomingTone}1a`, color: incomingTone }}>
                  <PhoneIncoming className="h-3 w-3" />
                  Incoming{incomingCount > 1 ? ` (${incomingCount})` : ""}
                </div>
              )}
            </div>
          </div>
          
          {/* Animated dot indicator */}
          <div className="flex items-center gap-2">
           {isIncoming && (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: incomingTone }}></span>
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: incomingTone }}></span>
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
            {incomingCallers.map((caller, i) => {
              const openDetail = caller.detail && onIncomingCallerClick;
              return (
                <div
                  key={caller.detail?.id ?? `${caller.number}-${i}`}
                  role={openDetail ? 'button' : undefined}
                  tabIndex={openDetail ? 0 : undefined}
                  onClick={
                    openDetail
                      ? (e) => {
                          e.stopPropagation();
                          onIncomingCallerClick(caller.detail!);
                        }
                      : undefined
                  }
                  onKeyDown={
                    openDetail
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onIncomingCallerClick(caller.detail!);
                          }
                        }
                      : undefined
                  }
                  className={`relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 p-2.5 ring-1 ring-amber-200/50 shadow-sm transition-all ${
                    openDetail
                      ? 'cursor-pointer hover:bg-amber-100/90 hover:ring-amber-300/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500'
                      : 'hover:bg-amber-100/70'
                  }`}
                >
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
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className="truncate font-mono text-[11px] font-semibold text-amber-700/80">
                          {formatPhone(caller.number)}
                        </div>
                        <div className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 ring-1 ring-amber-200/60">
                          Waiting{" "}
                          {formatPhoneDurationLabel(
                            caller.waitingSince
                              ? Math.max(0, now - caller.waitingSince)
                              : queue.avgWaitSeconds,
                          )}
                        </div>
                      </div>
                    </div>
                    {openDetail && (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-amber-700/60"
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
              );
            })}
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

        {/* Subtle Hint (live/ringing rows, or multiple incoming — pick a caller) */}
        {callHint &&
          (!isIncoming ||
            (incomingCallers && incomingCallers.length > 1)) && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50/50 px-3 py-2 text-[12px] font-medium text-slate-500 ring-1 ring-slate-100 transition-colors group-hover:bg-slate-50">
            {isIncoming ? "Select a caller to open full details." : callHint}
            <div className="ml-auto opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
              →
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatPhoneDurationLabel(totalMsOrSeconds: number): string {
  const normalizedSeconds =
    totalMsOrSeconds > 9999
      ? Math.floor(totalMsOrSeconds / 1000)
      : Math.floor(totalMsOrSeconds);
  const seconds = Math.max(0, normalizedSeconds);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
