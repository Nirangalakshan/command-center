import type { AgentStatus } from '@/services/types';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: AgentStatus;
}

const STATUS_MAP: Record<AgentStatus, { label: string; color: string; bg: string }> = {
  'ringing':   { label: 'Ringing',   color: 'var(--cc-color-amber)',    bg: 'rgba(251,191,36,0.12)' },
  'on-call':   { label: 'On Call',   color: 'var(--cc-color-red)',      bg: 'rgba(244,63,94,0.12)' },
  'available': { label: 'Available', color: 'var(--cc-color-green)',    bg: 'rgba(52,211,153,0.12)' },
  'wrap-up':   { label: 'Wrap-Up',   color: 'var(--cc-color-amber)',   bg: 'rgba(251,191,36,0.12)' },
  'break':     { label: 'Break',     color: 'var(--cc-color-slate)',   bg: 'rgba(100,116,139,0.12)' },
  'offline':   { label: 'Offline',   color: 'var(--cc-color-slate)', bg: 'rgba(100,116,139,0.16)' },
};

export { STATUS_MAP };

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_MAP[status] || STATUS_MAP['offline'];
  return (
    <Badge
      variant="outline"
      className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </Badge>
  );
}
