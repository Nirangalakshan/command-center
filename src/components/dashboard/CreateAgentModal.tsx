import { useState } from 'react';
import type { Tenant, Queue, AgentGroup } from '@/services/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAgentData) => Promise<void>;
  tenants: Tenant[];
  queues: Queue[];
  agentGroups: AgentGroup[];
}

export interface CreateAgentData {
  name: string;
  email: string;
  phone: string;
  password: string;
  tenantId: string;
  queueIds: string[];
  groupIds: string[];
  extension: string;
  notes: string;
}

export function CreateAgentModal({ open, onClose, onSubmit, tenants, queues, agentGroups }: Props) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [extension, setExtension] = useState('');
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const tenantQueues = queues.filter((q) => q.tenantId === tenantId);
  const tenantGroups = agentGroups.filter((g) => g.tenantId === tenantId);
  const selectedTenant = tenants.find((t) => t.id === tenantId);

  const canStep2 = name.trim() && email.trim() && password.length >= 6;
  const canStep3 = !!tenantId;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name, email, phone, password, tenantId, queueIds, groupIds, extension, notes });
      resetAndClose();
    } catch (e: any) {
      setError(e.message || 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setTenantId(''); setQueueIds([]); setGroupIds([]);
    setExtension(''); setNotes(''); setError('');
    onClose();
  };

  const toggleQueue = (id: string) => {
    setQueueIds((prev) => prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]);
  };

  const toggleGroup = (id: string) => {
    setGroupIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  return (
    <div className="cc-modal-overlay" onClick={resetAndClose}>
      <div className="cc-modal cc-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-header">
          <span className="cc-modal-title">ADD NEW AGENT</span>
          <button className="cc-modal-close" onClick={resetAndClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div className="cc-steps">
          {['Personal Details', 'Assignments', 'Review'].map((label, i) => (
            <div key={label} className={`cc-step ${step === i + 1 ? 'cc-step-active' : step > i + 1 ? 'cc-step-done' : ''}`}>
              <span className="cc-step-num">{i + 1}</span>
              <span className="cc-step-label">{label}</span>
            </div>
          ))}
        </div>

        {error && <div className="cc-modal-error">{error}</div>}

        {/* Step 1: Personal Details */}
        {step === 1 && (
          <div className="cc-modal-body">
            <div className="cc-form-grid">
              <div className="cc-form-field">
                <label className="cc-form-label">Full Name *</label>
                <input className="cc-form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="cc-form-field">
                <label className="cc-form-label">Email *</label>
                <input className="cc-form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div className="cc-form-field">
                <label className="cc-form-label">Phone</label>
                <input className="cc-form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 400 000 000" />
              </div>
              <div className="cc-form-field">
                <label className="cc-form-label">Temporary Password *</label>
                <input className="cc-form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
            </div>
            <div className="cc-modal-footer">
              <button className="cc-btn cc-btn-ghost" onClick={resetAndClose}>Cancel</button>
              <button className="cc-btn cc-btn-primary" disabled={!canStep2} onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 2: Assignments */}
        {step === 2 && (
          <div className="cc-modal-body">
            <div className="cc-form-grid">
              <div className="cc-form-field cc-form-full">
                <label className="cc-form-label">Tenant *</label>
                <select className="cc-form-select" value={tenantId} onChange={(e) => { setTenantId(e.target.value); setQueueIds([]); setGroupIds([]); }}>
                  <option value="">Select tenant...</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="cc-form-field">
                <label className="cc-form-label">Extension</label>
                <input className="cc-form-input" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="e.g. 8001" />
              </div>
              <div className="cc-form-field">
                <label className="cc-form-label">Notes</label>
                <textarea className="cc-form-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
              </div>
            </div>
            {tenantId && (
              <>
                <div className="cc-form-section-label">QUEUES</div>
                <div className="cc-checkbox-grid">
                  {tenantQueues.length === 0 && <span className="cc-text-muted">No queues for this tenant</span>}
                  {tenantQueues.map((q) => (
                    <label key={q.id} className="cc-checkbox-label">
                      <input type="checkbox" checked={queueIds.includes(q.id)} onChange={() => toggleQueue(q.id)} className="cc-training-checkbox" />
                      {q.icon} {q.name}
                    </label>
                  ))}
                </div>
                <div className="cc-form-section-label">GROUPS</div>
                <div className="cc-checkbox-grid">
                  {tenantGroups.length === 0 && <span className="cc-text-muted">No groups for this tenant</span>}
                  {tenantGroups.map((g) => (
                    <label key={g.id} className="cc-checkbox-label">
                      <input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} className="cc-training-checkbox" />
                      {g.name}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="cc-modal-footer">
              <button className="cc-btn cc-btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="cc-btn cc-btn-primary" disabled={!canStep3} onClick={() => setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="cc-modal-body">
            <div className="cc-review-section">
              <div className="cc-review-row"><span className="cc-review-label">Name</span><span>{name}</span></div>
              <div className="cc-review-row"><span className="cc-review-label">Email</span><span>{email}</span></div>
              {phone && <div className="cc-review-row"><span className="cc-review-label">Phone</span><span>{phone}</span></div>}
              <div className="cc-review-row"><span className="cc-review-label">Tenant</span><span>{selectedTenant?.name}</span></div>
              {extension && <div className="cc-review-row"><span className="cc-review-label">Extension</span><span>{extension}</span></div>}
              <div className="cc-review-row"><span className="cc-review-label">Queues</span><span>{queueIds.length > 0 ? tenantQueues.filter((q) => queueIds.includes(q.id)).map((q) => q.name).join(', ') : 'None'}</span></div>
              <div className="cc-review-row"><span className="cc-review-label">Groups</span><span>{groupIds.length > 0 ? tenantGroups.filter((g) => groupIds.includes(g.id)).map((g) => g.name).join(', ') : 'None'}</span></div>
            </div>
            <div className="cc-modal-footer">
              <button className="cc-btn cc-btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="cc-btn cc-btn-primary" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
