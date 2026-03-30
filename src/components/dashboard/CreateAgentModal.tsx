import { useState } from 'react';
import type { Tenant, Queue, AgentGroup } from '@/services/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';

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
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setTenantId('');
    setQueueIds([]);
    setGroupIds([]);
    setExtension('');
    setNotes('');
    setError('');
    onClose();
  };

  const toggleQueue = (id: string) => {
    setQueueIds((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]));
  };

  const toggleGroup = (id: string) => {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) resetAndClose(); }}>
      <DialogContent className="max-w-3xl bg-white">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>
            Create an agent account, assign queues, and review the onboarding setup.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-2xl bg-slate-50 p-2 md:grid-cols-3">
          {['Personal Details', 'Assignments', 'Review'].map((label, index) => {
            const stepIndex = index + 1;

            return (
              <div
                key={label}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
                  step === stepIndex && 'bg-white text-slate-950 shadow-sm',
                  step > stepIndex && 'text-emerald-700',
                  step < stepIndex && 'text-muted-foreground',
                )}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-semibold">
                  {stepIndex}
                </span>
                <span className="font-medium">{label}</span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {step === 1 && (
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Tenant *</Label>
                <Select
                  value={tenantId || '__none__'}
                  onValueChange={(value) => {
                    const nextTenantId = value === '__none__' ? '' : value;
                    setTenantId(nextTenantId);
                    setQueueIds([]);
                    setGroupIds([]);
                  }}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select tenant...</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="extension">Extension</Label>
                <Input id="extension" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="e.g. 8001" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agentNotes">Notes</Label>
                <Textarea id="agentNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={3} />
              </div>
            </div>

            {tenantId && (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Queues</div>
                  <div className="space-y-2 rounded-2xl border border-border bg-slate-50/70 p-4">
                    {tenantQueues.length === 0 && <span className="text-sm text-muted-foreground">No queues for this tenant</span>}
                    {tenantQueues.map((queue) => (
                      <label key={queue.id} className="flex items-center gap-3 text-sm text-slate-700">
                        <Checkbox checked={queueIds.includes(queue.id)} onCheckedChange={() => toggleQueue(queue.id)} />
                        <span>{queue.icon} {queue.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Groups</div>
                  <div className="space-y-2 rounded-2xl border border-border bg-slate-50/70 p-4">
                    {tenantGroups.length === 0 && <span className="text-sm text-muted-foreground">No groups for this tenant</span>}
                    {tenantGroups.map((group) => (
                      <label key={group.id} className="flex items-center gap-3 text-sm text-slate-700">
                        <Checkbox checked={groupIds.includes(group.id)} onCheckedChange={() => toggleGroup(group.id)} />
                        <span>{group.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 rounded-2xl border border-border bg-slate-50/70 p-4">
            <ReviewRow label="Name" value={name} />
            <ReviewRow label="Email" value={email} />
            {phone && <ReviewRow label="Phone" value={phone} />}
            <ReviewRow label="Tenant" value={selectedTenant?.name || 'None'} />
            {extension && <ReviewRow label="Extension" value={extension} />}
            <ReviewRow
              label="Queues"
              value={queueIds.length > 0 ? tenantQueues.filter((queue) => queueIds.includes(queue.id)).map((queue) => queue.name).join(', ') : 'None'}
            />
            <ReviewRow
              label="Groups"
              value={groupIds.length > 0 ? tenantGroups.filter((group) => groupIds.includes(group.id)).map((group) => group.name).join(', ') : 'None'}
            />
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            {step === 1 ? (
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
            ) : (
              <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button disabled={step === 1 ? !canStep2 : !canStep3} onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <Button disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Creating...' : 'Create Agent'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-slate-700">{value}</span>
    </div>
  );
}
