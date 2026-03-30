import type { AgentOnboardingStage } from '@/services/types';
import { Badge } from '@/components/ui/badge';

const STAGE_CONFIG: Record<AgentOnboardingStage, { label: string; color: string }> = {
  'invited':          { label: 'Invited',         color: 'var(--cc-color-cyan)' },
  'account-created':  { label: 'Account Created', color: '#3b82f6' },
  'training':         { label: 'Training',        color: 'var(--cc-color-amber)' },
  'shadowing':        { label: 'Shadowing',       color: 'var(--cc-color-purple)' },
  'live':             { label: 'Live',            color: 'var(--cc-color-green)' },
};

interface Props {
  stage: AgentOnboardingStage;
}

export function AgentOnboardingStageBadge({ stage }: Props) {
  const cfg = STAGE_CONFIG[stage];
  return (
    <Badge
      variant="outline"
      className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
      }}
    >
      {stage === 'live' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />}
      {cfg.label.toUpperCase()}
    </Badge>
  );
}
