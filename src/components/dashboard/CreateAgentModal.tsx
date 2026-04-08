import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAgentData) => Promise<void>;
}

export interface CreateAgentData {
  name: string;
  email: string;
  phone: string;
  password: string;
  extension: string;
  notes: string;
}

export function CreateAgentModal({ open, onClose, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [extension, setExtension] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = name.trim() && email.trim() && password.length >= 6;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name, email, phone, password, extension, notes });
      resetAndClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setExtension('');
    setNotes('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) resetAndClose(); }}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>
            Create an agent account. You can assign tenants and queues later.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agentName">Full Name *</Label>
            <Input id="agentName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentEmail">Email *</Label>
            <Input id="agentEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentPhone">Phone</Label>
            <Input id="agentPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+61 400 000 000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentPassword">Temporary Password *</Label>
            <Input id="agentPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extension">Extension</Label>
            <Input id="extension" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="e.g. 8001" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentNotes">Notes</Label>
            <Textarea id="agentNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button disabled={!canSubmit || submitting} onClick={handleSubmit}>
            {submitting ? 'Creating...' : 'Create Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
