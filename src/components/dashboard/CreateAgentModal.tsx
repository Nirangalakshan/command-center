import { useState, useEffect, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fetchBmsWorkshopOptions } from '@/services/didMappingsApi';
import type { Tenant, WorkshopUserRole } from '@/services/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAgentData) => Promise<void>;
  /** Used only to auto-fill Supabase `tenant_id` when `bms_owner_uid` matches the workshop. */
  tenants: Tenant[];
}

export interface CreateAgentData {
  name: string;
  email: string;
  phone: string;
  password: string;
  extension: string;
  notes: string;
  /** `command-centre` agents are internal and not bound to a BMS workshop. */
  agentType: 'workshop' | 'command-centre';
  /** Set when a tenant row matches this workshop via `bms_owner_uid`. */
  tenantId?: string;
  workshopOwnerUid?: string;
  workshopName?: string;
  workshopBranchId?: string;
  workshopBranchName?: string;
  /** Set for workshop agents: BMS-side role at this extension. */
  workshopUserRole?: WorkshopUserRole;
}

export function CreateAgentModal({ open, onClose, onSubmit, tenants }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [extension, setExtension] = useState('');
  const [notes, setNotes] = useState('');
  const [agentType, setAgentType] = useState<'workshop' | 'command-centre'>('workshop');
  const [selectedOwnerUid, setSelectedOwnerUid] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [workshopUserRole, setWorkshopUserRole] = useState<WorkshopUserRole>('staff');

  const [bmsWorkshops, setBmsWorkshops] = useState<
    Array<{ ownerUid: string; name: string; branches: Array<{ id: string; name: string }> }>
  >([]);
  const [workshopsLoading, setWorkshopsLoading] = useState(false);
  const [workshopsError, setWorkshopsError] = useState('');

  useEffect(() => {
    if (!open) return;
    setAgentType('workshop');
    setSelectedOwnerUid('');
    setSelectedBranchId('');
    setWorkshopUserRole('staff');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWorkshopsLoading(true);
    setWorkshopsError('');
    fetchBmsWorkshopOptions()
      .then((list) => {
        if (!cancelled) {
          setBmsWorkshops(
            list.map((w) => ({
              ownerUid: w.ownerUid,
              name: w.name,
              branches: w.branches.map((b) => ({ id: b.id, name: b.name })),
            })),
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWorkshopsError(err instanceof Error ? err.message : 'Failed to load workshops');
        }
      })
      .finally(() => {
        if (!cancelled) setWorkshopsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedWorkshop = useMemo(
    () => bmsWorkshops.find((w) => w.ownerUid === selectedOwnerUid) ?? null,
    [bmsWorkshops, selectedOwnerUid],
  );
  const selectedBranch = useMemo(
    () =>
      selectedWorkshop?.branches.find((b) => b.id === selectedBranchId) ?? null,
    [selectedWorkshop, selectedBranchId],
  );

  useEffect(() => {
    if (!selectedWorkshop) {
      setSelectedBranchId('');
      return;
    }
    if (selectedWorkshop.branches.length === 0) {
      setSelectedBranchId('');
      return;
    }
    setSelectedBranchId((prev) => {
      if (prev && selectedWorkshop.branches.some((b) => b.id === prev)) return prev;
      return selectedWorkshop.branches[0].id;
    });
  }, [selectedWorkshop]);

  const matchedTenant = useMemo(() => {
    if (!selectedWorkshop) return null;
    return (
      tenants.find(
        (t) => String(t.bmsOwnerUid ?? '').trim() === selectedWorkshop.ownerUid,
      ) ?? null
    );
  }, [tenants, selectedWorkshop]);

  const requiresWorkshop = agentType === 'workshop';
  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(email.trim()) &&
    password.length >= 6 &&
    Boolean(extension.trim()) &&
    (!requiresWorkshop || (Boolean(selectedWorkshop) && Boolean(selectedBranchId)));

  const handleSubmit = async () => {
    if (requiresWorkshop && (!selectedWorkshop || !selectedBranchId)) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        extension: extension.trim(),
        notes: notes.trim(),
        agentType,
        ...(requiresWorkshop && matchedTenant ? { tenantId: matchedTenant.id } : {}),
        ...(requiresWorkshop && selectedWorkshop
          ? {
              workshopOwnerUid: selectedWorkshop.ownerUid,
              workshopName: selectedWorkshop.name,
            }
          : {}),
        ...(requiresWorkshop && selectedBranchId
          ? {
              workshopBranchId: selectedBranchId,
              workshopBranchName: selectedBranch?.name,
            }
          : {}),
        ...(requiresWorkshop ? { workshopUserRole } : {}),
      });
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
    setAgentType('workshop');
    setSelectedOwnerUid('');
    setSelectedBranchId('');
    setWorkshopUserRole('staff');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) resetAndClose(); }}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>
            Create either a workshop agent or a command center agent.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {workshopsError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load workshops</AlertTitle>
            <AlertDescription>{workshopsError}</AlertDescription>
          </Alert>
        )}

        {!workshopsLoading && !workshopsError && bmsWorkshops.length === 0 && (
          <Alert>
            <AlertTitle>No workshops</AlertTitle>
            <AlertDescription>
              The BMS call-center API returned no workshops for the signed-in account.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Agent Section</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={agentType === 'workshop' ? 'default' : 'outline'}
                onClick={() => setAgentType('workshop')}
              >
                Workshop Agent
              </Button>
              <Button
                type="button"
                variant={agentType === 'command-centre' ? 'default' : 'outline'}
                onClick={() => setAgentType('command-centre')}
              >
                Command Center Agent
              </Button>
            </div>
          </div>
          {agentType === 'workshop' && (
            <>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="workshop">Workshop *</Label>
            <Select
              value={selectedOwnerUid || undefined}
              onValueChange={setSelectedOwnerUid}
              disabled={workshopsLoading || bmsWorkshops.length === 0}
            >
              <SelectTrigger id="workshop" className="w-full">
                <SelectValue
                  placeholder={
                    workshopsLoading
                      ? 'Loading workshops…'
                      : bmsWorkshops.length === 0
                        ? 'No workshops'
                        : 'Select workshop'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {bmsWorkshops.map((w) => (
                  <SelectItem key={w.ownerUid} value={w.ownerUid}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWorkshop && (
              <p className="text-[11px] text-muted-foreground">
                BMS owner{' '}
                <span className="font-mono">{selectedWorkshop.ownerUid}</span>
                {matchedTenant ? (
                  <>
                    {' · '}
                    Command Centre tenant: <span className="font-semibold text-slate-600">{matchedTenant.name}</span>
                  </>
                ) : (
                  <>
                    {' · '}
                    <span className="text-amber-700">No tenant linked</span>
                    {' '}(optional — set <span className="font-mono">bms_owner_uid</span> on a tenant to match)
                  </>
                )}
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="workshopBranch">Workshop branch *</Label>
            <Select
              value={selectedBranchId || undefined}
              onValueChange={setSelectedBranchId}
              disabled={!selectedWorkshop || selectedWorkshop.branches.length === 0}
            >
              <SelectTrigger id="workshopBranch" className="w-full">
                <SelectValue
                  placeholder={
                    !selectedWorkshop
                      ? 'Select workshop first'
                      : selectedWorkshop.branches.length === 0
                        ? 'No branches on workshop'
                        : 'Select branch'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(selectedWorkshop?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name || b.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="workshopUserRole">User role *</Label>
            <Select
              value={workshopUserRole}
              onValueChange={(v) => setWorkshopUserRole(v as WorkshopUserRole)}
            >
              <SelectTrigger id="workshopUserRole" className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="branch_admin">Branch admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              How this person relates to the workshop (shown next to their extension in notifications).
            </p>
          </div>
            </>
          )}

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
            <Label htmlFor="extension">Yeastar extension *</Label>
            <Input id="extension" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="e.g. 8001" />
          </div>
          <div className="space-y-2 sm:col-span-2">
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
