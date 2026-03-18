import type { TrainingChecklist } from '@/services/types';

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
    <div className="cc-training-checklist">
      <div className="cc-training-header">
        <span className="cc-training-title">TRAINING CHECKLIST</span>
        <span className="cc-training-progress" style={{ color: progress === 100 ? 'var(--cc-color-green)' : 'var(--cc-text-secondary)' }}>
          {completedCount}/{ITEMS.length}
        </span>
      </div>
      <div className="cc-training-bar-bg">
        <div
          className="cc-training-bar-fill"
          style={{ width: `${progress}%`, background: progress === 100 ? 'var(--cc-color-green)' : 'var(--cc-color-cyan)' }}
        />
      </div>
      <div className="cc-training-items">
        {ITEMS.map((item) => (
          <label key={item.key} className={`cc-training-item ${readOnly ? 'cc-training-item-readonly' : ''}`}>
            <input
              type="checkbox"
              checked={checklist[item.key]}
              disabled={readOnly}
              onChange={() => {
                if (!readOnly) {
                  onChange({ ...checklist, [item.key]: !checklist[item.key] });
                }
              }}
              className="cc-training-checkbox"
            />
            <span className="cc-training-icon">{item.icon}</span>
            <span className={checklist[item.key] ? 'cc-training-done' : ''}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
