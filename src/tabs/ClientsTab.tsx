import { useState } from 'react';
import type { TenantOnboarding, Permissions, NewClientForm } from '@/services/types';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { OnboardingStageBadge } from '@/components/dashboard/OnboardingStageBadge';
import { ClientSignupModal } from '@/components/dashboard/ClientSignupModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props {
  clients: TenantOnboarding[];
  permissions: Permissions;
  onCreateClient: (data: NewClientForm) => void;
  onAdvanceStage: (clientId: string) => void;
}

export function ClientsTab({ clients, permissions, onCreateClient, onAdvanceStage }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const visibleClients = permissions.canViewAllTenants
    ? clients
    : clients.filter((c) => c.id === permissions.allowedTenantId);

  return (
    <div className="cc-fade-in space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Client Onboarding
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Manage onboarding progress
          </h2>
        </div>
        {permissions.canSignUpClients && (
          <Button onClick={() => setModalOpen(true)}>
            + New Client
          </Button>
        )}
      </div>

      {visibleClients.length === 0 ? (
        <EmptyState message="No clients yet. Sign up your first client to get started." />
      ) : (
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Created</TableHead>
                  {permissions.canAdvanceOnboarding && <TableHead>Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleClients.map((c) => {
                  const isLive = c.onboardingStage === 'live';
                  const isNeedsRevision = c.onboardingStage === 'needs-revision';

                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: c.brandColor }}
                          />
                          <span className="font-medium text-slate-900">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.industry}</TableCell>
                      <TableCell>
                        <div className="text-sm">{c.contactName || '—'}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {c.contactEmail || c.contactPhone || '—'}
                        </div>
                      </TableCell>
                      <TableCell><OnboardingStageBadge stage={c.onboardingStage} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </TableCell>
                      {permissions.canAdvanceOnboarding && (
                        <TableCell>
                          {isLive ? (
                            <span className="text-sm font-medium text-emerald-700">Live</span>
                          ) : isNeedsRevision ? (
                            <span className="text-sm font-medium text-rose-600">Revision Required</span>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => onAdvanceStage(c.id)}>
                              Advance
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ClientSignupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCreateClient}
      />
    </div>
  );
}
