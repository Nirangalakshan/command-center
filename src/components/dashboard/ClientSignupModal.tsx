import { useState } from 'react';
import type { NewClientForm } from '@/services/types';

const INDUSTRIES = ['Trades', 'Healthcare', 'Property', 'Finance', 'Other'];
const BRAND_COLORS = ['#00d4f5', '#34d399', '#a78bfa', '#fb923c', '#f43f5e', '#3b82f6', '#fbbf24', '#64748b'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewClientForm) => void;
}

const INITIAL: NewClientForm = {
  businessName: '',
  industry: 'Trades',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  brandColor: '#00d4f5',
  notes: '',
};

export function ClientSignupModal({ open, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<NewClientForm>({ ...INITIAL });
  const [error, setError] = useState('');

  if (!open) return null;

  const set = (key: keyof NewClientForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (form.businessName.trim().length > 100) {
      setError('Business name must be less than 100 characters');
      return;
    }
    onSubmit(form);
    setForm({ ...INITIAL });
    setError('');
    onClose();
  };

  const handleClose = () => {
    setForm({ ...INITIAL });
    setError('');
    onClose();
  };

  return (
    <div className="cc-modal-overlay" onClick={handleClose}>
      <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-header">
          <span className="cc-modal-title">SIGN UP NEW CLIENT</span>
          <button className="cc-modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="cc-modal-body">
          {error && <div className="cc-form-error">{error}</div>}

          <label className="cc-form-label">Business Name *</label>
          <input
            className="cc-form-input"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            placeholder="e.g. Melbourne Plumbing Co"
            maxLength={100}
          />

          <label className="cc-form-label">Industry</label>
          <select
            className="cc-form-select"
            value={form.industry}
            onChange={(e) => set('industry', e.target.value)}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>

          <label className="cc-form-label">Contact Name</label>
          <input
            className="cc-form-input"
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="Primary contact"
            maxLength={100}
          />

          <div className="cc-form-row">
            <div className="cc-form-field">
              <label className="cc-form-label">Phone</label>
              <input
                className="cc-form-input"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                placeholder="04XX XXX XXX"
                maxLength={20}
              />
            </div>
            <div className="cc-form-field">
              <label className="cc-form-label">Email</label>
              <input
                className="cc-form-input"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                placeholder="email@example.com"
                maxLength={255}
                type="email"
              />
            </div>
          </div>

          <label className="cc-form-label">Brand Color</label>
          <div className="cc-color-swatches">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                className={`cc-color-swatch ${form.brandColor === c ? 'cc-color-swatch-active' : ''}`}
                style={{ background: c }}
                onClick={() => set('brandColor', c)}
                type="button"
              />
            ))}
          </div>

          <label className="cc-form-label">Notes</label>
          <textarea
            className="cc-form-textarea"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any additional details..."
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="cc-modal-footer">
          <button className="cc-btn cc-btn-ghost" onClick={handleClose}>Cancel</button>
          <button className="cc-btn cc-btn-primary" onClick={handleSubmit}>Create Client</button>
        </div>
      </div>
    </div>
  );
}
