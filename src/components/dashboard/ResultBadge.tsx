import type { CallResult } from '@/services/types';
import { Badge } from '@/components/ui/badge';

interface ResultBadgeProps {
  result: CallResult;
}

const RESULT_MAP: Record<CallResult, { label: string; color: string; bg: string }> = {
  answered:  { label: 'Answered',  color: 'var(--cc-color-green)',  bg: 'rgba(52,211,153,0.12)' },
  abandoned: { label: 'Abandoned', color: 'var(--cc-color-red)',    bg: 'rgba(244,63,94,0.12)' },
  missed:    { label: 'Missed',    color: 'var(--cc-color-amber)',  bg: 'rgba(251,191,36,0.12)' },
  voicemail: { label: 'Voicemail', color: 'var(--cc-color-purple)', bg: 'rgba(167,139,250,0.12)' },
};

export { RESULT_MAP };

export function ResultBadge({ result }: ResultBadgeProps) {
  const r = RESULT_MAP[result] || RESULT_MAP['missed'];
  return (
    <Badge
      variant="outline"
      className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: r.color, background: r.bg }}
    >
      {r.label}
    </Badge>
  );
}
