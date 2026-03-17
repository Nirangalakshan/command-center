import type { OnboardingStage } from '@/services/types';

const STAGE_CONFIG: Record<OnboardingStage, { label: string; color: string }> = {
  'signup':          { label: 'Signup',         color: 'var(--cc-color-cyan)' },
  'tenant-created':  { label: 'Tenant Created', color: '#3b82f6' },
  'phone-setup':     { label: 'Phone Setup',    color: 'var(--cc-color-purple)' },
  'business-config': { label: 'Biz Config',     color: 'var(--cc-color-amber)' },
  'call-flow-design':{ label: 'Call Flow',       color: 'var(--cc-color-orange)' },
  'agent-training':  { label: 'Training',        color: 'var(--cc-color-slate)' },
  'soft-launch':     { label: 'Soft Launch',     color: 'var(--cc-color-amber)' },
  'go-live':         { label: 'Go Live',         color: 'var(--cc-color-green)' },
  'monitoring':      { label: 'Monitoring',      color: 'var(--cc-color-green)' },
};

interface Props {
  stage: OnboardingStage;
}

export function OnboardingStageBadge({ stage }: Props) {
  const cfg = STAGE_CONFIG[stage];
  return (
    <span
      className="cc-badge"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
      }}
    >
      {stage === 'monitoring' && <span className="cc-live-dot-inline" />}
      {cfg.label.toUpperCase()}
    </span>
  );
}
