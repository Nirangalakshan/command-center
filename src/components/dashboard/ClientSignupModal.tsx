import { useState } from 'react';
import type { NewClientForm } from '@/services/types';
import { isValidEmail, isValidPhone } from '@/utils/onboardingValidation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Sign Up New Client</DialogTitle>
          <DialogDescription>
            Add a new client and set the onboarding details used across the dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="businessName">Business Name *</Label>
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
                placeholder="e.g. Melbourne Plumbing Co"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Industry *</Label>
              <Select value={form.industry} onValueChange={(value) => set('industry', value)}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name *</Label>
              <Input
                id="contactName"
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                placeholder="Primary contact"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                placeholder="04XX XXX XXX"
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                placeholder="email@example.com"
                maxLength={255}
                type="email"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Brand Color</Label>
              <div className="flex flex-wrap gap-2">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Choose brand color ${color}`}
                    className="h-8 w-8 rounded-full ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    style={{
                      backgroundColor: color,
                      boxShadow: form.brandColor === color ? '0 0 0 3px white, 0 0 0 5px rgba(15, 23, 42, 0.18)' : 'none',
                    }}
                    onClick={() => set('brandColor', color)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Any additional details..."
                rows={4}
                maxLength={500}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Create Client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
