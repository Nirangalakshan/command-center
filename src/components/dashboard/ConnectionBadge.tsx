import type { ConnectionStatus } from '@/services/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

const LABELS: Record<ConnectionStatus, string> = {
  connected: 'CONNECTED',
  reconnecting: 'RECONNECTING',
  disconnected: 'DISCONNECTED',
};

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; badge: string }> = {
  connected: {
    dot: 'var(--cc-color-green)',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  },
  reconnecting: {
    dot: 'var(--cc-color-amber)',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  },
  disconnected: {
    dot: 'var(--cc-color-red)',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  },
};

export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  const style = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn('rounded-full border-0 px-3 py-1 text-[11px] font-semibold tracking-wide', style.badge)}>
      <span className="mr-2 inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} />
      {LABELS[status]}
    </Badge>
  );
}
