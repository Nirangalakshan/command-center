import { useState } from 'react';
import type { NewClientForm } from '@/services/types';
import { isValidEmail, isValidPhone } from '@/utils/onboardingValidation';

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
  const [errors, setErrors] = useState<string[]>([]);

  if (!open) return null;

  const set = (key: keyof NewClientForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    const validationErrors: string[] = [];

    if (!form.businessName.trim()) {
      validationErrors.push('Business name is required');
    } else if (form.businessName.trim().length > 100) {
      validationErrors.push('Business name must be less than 100 characters');
    }

    if (!form.contactName.trim()) {
      validationErrors.push('Contact name is required');
    }

    if (!form.contactPhone.trim() && !form.contactEmail.trim()) {
      validationErrors.push('At least one contact method (phone or email) is required');
    }

    if (form.contactPhone.trim() && !isValidPhone(form.contactPhone)) {
      validationErrors.push('Phone number format is invalid');
    }

    if (form.contactEmail.trim() && !isValidEmail(form.contactEmail)) {
      validationErrors.push('Email address format is invalid');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSubmit(form);
    setForm({ ...INITIAL });
    setErrors([]);
    onClose();
  };

  const handleClose = () => {
    setForm({ ...INITIAL });
    setErrors([]);
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
          {errors.length > 0 && (
            <div className="cc-form-error">
              {errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}

          <label className="cc-form-label">Business Name *</label>
          <input
            className="cc-form-input"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            placeholder="e.g. Melbourne Plumbing Co"
            maxLength={100}
          />

          <label className="cc-form-label">Industry *</label>
          <select
            className="cc-form-select"
            value={form.industry}
            onChange={(e) => set('industry', e.target.value)}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>

          <label className="cc-form-label">Contact Name *</label>
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
