import type { ConnectionStatus } from '@/services/types';
import type { ReactNode } from 'react';
import { ConnectionBadge } from './ConnectionBadge';

interface DashboardHeaderProps {
  connectionStatus: ConnectionStatus;
  clockDate: string;
  clockTime: string;
  /** e.g. agent clock in/out strip in the top bar */
  attendanceSlot?: ReactNode;
}

export function DashboardHeader({ connectionStatus, clockDate, clockTime, attendanceSlot }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        {attendanceSlot ? (
          <div className="order-2 flex min-w-0 flex-1 flex-wrap items-center gap-2 md:order-1">
            {attendanceSlot}
          </div>
        ) : null}
        <div
          className={`order-1 flex flex-wrap items-center justify-end gap-3 md:order-2 ${attendanceSlot ? 'w-full md:w-auto' : 'w-full md:ml-auto md:w-auto'}`}
        >
          <ConnectionBadge status={connectionStatus} />
          <div
            className="rounded-full border border-border bg-slate-50 px-3 py-2 text-right shadow-sm"
            title="Australia / Melbourne (business clock)"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Melbourne</div>
            <div className="font-mono text-[11px] leading-tight text-slate-600">{clockDate}</div>
            <div className="font-mono text-xs tabular-nums leading-tight text-slate-800">{clockTime}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
