import type { ConnectionStatus } from '@/services/types';
import { ConnectionBadge } from './ConnectionBadge';

interface DashboardHeaderProps {
  connectionStatus: ConnectionStatus;
  clockStr: string;
}

export function DashboardHeader({ connectionStatus, clockStr }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="text-lg font-semibold tracking-tight text-slate-950"></div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBadge status={connectionStatus} />
          <div className="rounded-full border border-border bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            {clockStr}
          </div>
        </div>
      </div>
    </header>
  );
}
