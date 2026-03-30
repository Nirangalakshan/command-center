import type { TrainingChecklist } from '@/services/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

interface Props {
  checklist: TrainingChecklist;
  onChange: (updated: TrainingChecklist) => void;
  readOnly?: boolean;
}

const ITEMS: { key: keyof TrainingChecklist; label: string; icon: string }[] = [
  { key: 'pbxLogin', label: 'PBX login verified', icon: '📞' },
  { key: 'scriptReview', label: 'Call scripts reviewed', icon: '📝' },
  { key: 'testCalls', label: '3 test calls completed', icon: '✅' },
  { key: 'systemNav', label: 'System navigation confirmed', icon: '🖥️' },
];

export function AgentTrainingChecklist({ checklist, onChange, readOnly }: Props) {
  const completedCount = ITEMS.filter((i) => checklist[i.key]).length;
  const progress = Math.round((completedCount / ITEMS.length) * 100);

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Training Checklist
        </span>
        <span className="text-sm font-semibold" style={{ color: progress === 100 ? 'var(--cc-color-green)' : 'var(--cc-color-slate)' }}>
          {completedCount}/{ITEMS.length}
        </span>
      </div>
      <Progress value={progress} className="mb-4 h-2 bg-slate-100" />
      <div className="space-y-3">
        {ITEMS.map((item) => (
          <label
            key={item.key}
            className={`flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm text-slate-700 ${
              readOnly ? 'cursor-default' : 'cursor-pointer'
            }`}
          >
            <Checkbox
              checked={checklist[item.key]}
              disabled={readOnly}
              onCheckedChange={() => {
                if (!readOnly) {
                  onChange({ ...checklist, [item.key]: !checklist[item.key] });
                }
              }}
            />
            <span>{item.icon}</span>
            <span className={checklist[item.key] ? 'text-muted-foreground line-through' : ''}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
