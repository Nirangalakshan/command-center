import { Fragment, useState, useCallback } from 'react';
import type { AgentOnboarding, AgentStatus, Permissions } from '@/services/types';
import { AgentOnboardingStageBadge } from '@/components/dashboard/AgentOnboardingStageBadge';
import { AgentTrainingChecklist } from '@/components/dashboard/AgentTrainingChecklist';
import { CreateAgentModal, type CreateAgentData } from '@/components/dashboard/CreateAgentModal';
import { createAgentViaEdge, advanceAgentStage, updateTrainingChecklist } from '@/services/agentOnboardingApi';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
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
  agentOnboarding: AgentOnboarding[];
  permissions: Permissions;
  onRefresh: () => void;
}

export function AgentOnboardingTab({ agentOnboarding, permissions, onRefresh }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState('all');

  const stages = ['invited', 'account-created', 'training', 'shadowing', 'live'] as const;

  const filtered = filterStage === 'all'
    ? agentOnboarding
    : agentOnboarding.filter((a) => a.stage === filterStage);

  const handleCreate = useCallback(async (data: CreateAgentData) => {
    await createAgentViaEdge(data);
    onRefresh();
  }, [onRefresh]);

  const handleAdvance = useCallback(async (id: string, stage: AgentOnboarding['stage']) => {
    await advanceAgentStage(id, stage);
    onRefresh();
  }, [onRefresh]);

  const handleChecklistChange = useCallback(async (id: string, checklist: AgentOnboarding['trainingChecklist']) => {
    await updateTrainingChecklist(id, checklist);
    onRefresh();
  }, [onRefresh]);

  const canManage = permissions.canOnboardAgents;

  return (
    <div className="cc-fade-in space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Agent Onboarding
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Track onboarding stages and training readiness
          </h2>
        </div>
        {canManage && (
          <Button onClick={() => setModalOpen(true)}>
            + Add Agent
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={filterStage === 'all' ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setFilterStage('all')}>
          All ({agentOnboarding.length})
        </Button>
        {stages.map((s) => {
          const count = agentOnboarding.filter((a) => a.stage === s).length;
          return (
            <Button
              key={s}
              variant={filterStage === s ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => setFilterStage(s)}
            >
              {s.replace('-', ' ')} ({count})
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No agents in onboarding pipeline" />
      ) : (
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Onboarding Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Invited</TableHead>
                  {canManage && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ao) => (
                  <Fragment key={ao.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === ao.id ? null : ao.id)}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{ao.agentName}</div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Ext {ao.agentExtension}
                        </div>
                      </TableCell>
                      <TableCell>{ao.tenantName}</TableCell>
                      <TableCell><AgentOnboardingStageBadge stage={ao.stage} /></TableCell>
                      <TableCell><StatusBadge status={ao.agentStatus as AgentStatus} /></TableCell>
                      <TableCell className="font-mono text-xs">{ao.personalEmail}</TableCell>
                      <TableCell className="font-mono text-xs">{new Date(ao.invitedAt).toLocaleDateString()}</TableCell>
                      {canManage && (
                        <TableCell>
                          {ao.stage !== 'live' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleAdvance(ao.id, ao.stage); }}
                            >
                              Advance
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                    {expandedId === ao.id && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 7 : 6} className="bg-slate-50/70">
                          <div className="flex flex-wrap gap-6 py-4">
                            <AgentTrainingChecklist
                              checklist={ao.trainingChecklist}
                              onChange={(c) => handleChecklistChange(ao.id, c)}
                              readOnly={!canManage}
                            />
                            {ao.notes && (
                              <div className="min-w-[220px] flex-1 rounded-2xl border border-border bg-white p-5 shadow-sm">
                                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                                  Notes
                                </div>
                                <p className="mt-3 text-sm text-slate-700">{ao.notes}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateAgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
